alter table public.profiles add constraint settings_size check(octet_length(settings::text)<=5000);
alter table public.agents add constraint agent_text_limits check(length(personality)<=2000 and length(worldview)<=2000 and length(background)<=2000 and length(expertise)<=2000 and length(instructions)<=3000 and length(memories)<=6000);
alter table public.agents add constraint avatar_scope check(avatar in ('amber','sage','slate','rose','blue','violet') or split_part(avatar,'/',1)=user_id::text);
alter table public.documents add constraint chunk_limits check(jsonb_typeof(chunks)='array' and jsonb_array_length(chunks)<=160 and octet_length(chunks::text)<=256000);
create function public.enforce_record_limits() returns trigger language plpgsql set search_path=public as $$ declare n integer; maximum integer; begin
perform pg_advisory_xact_lock(hashtext(new.user_id::text));
if tg_table_name='documents' then select count(*) into n from documents where project_id=new.project_id;maximum=20;
elsif tg_table_name='agents' then select count(*) into n from agents where user_id=new.user_id;maximum=500;
else select count(*) into n from projects where user_id=new.user_id;maximum=100;end if;
if n>=maximum then raise exception 'Record allowance reached';end if;return new;end $$;
create trigger limit_documents before insert on public.documents for each row execute function public.enforce_record_limits();
create trigger limit_agents before insert on public.agents for each row execute function public.enforce_record_limits();
create trigger limit_projects before insert on public.projects for each row execute function public.enforce_record_limits();
create function public.enforce_file_limits() returns trigger language plpgsql security definer set search_path=storage,public as $$ begin
if new.bucket_id='cast-private' then
perform pg_advisory_xact_lock(hashtext(split_part(new.name,'/',1)));
if (select count(*) from storage.objects where bucket_id='cast-private' and split_part(name,'/',1)=split_part(new.name,'/',1))>=100 then raise exception 'Private file allowance reached';end if;
end if;return new;end $$;
create trigger limit_private_files before insert on storage.objects for each row execute function public.enforce_file_limits();
revoke update on public.inbox from authenticated;
grant update(read) on public.inbox to authenticated;
