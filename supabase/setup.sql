-- Cast schema setup for a NEW, EMPTY Supabase project only.
-- Existing installations: use incremental migrations, not this bundle.
begin;

-- 202610020001_cast.sql
create table public.profiles (user_id uuid primary key references auth.users on delete cascade, settings jsonb not null default '{"timezone":"America/Phoenix","quietStart":"22:00","quietEnd":"08:00"}');
create table public.agents (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null check(length(name) between 1 and 100), avatar text not null default 'amber', personality text not null default '', worldview text not null default '', background text not null default '', expertise text not null default '', instructions text not null default '', voice text not null default 'Kore', memories text not null default '', permissions jsonb not null default '{"documents":true,"memory":true,"search":false,"scheduled":false}', project_scope uuid[] not null default '{}', archived boolean not null default false, unique(id,user_id));
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null check(length(name) between 1 and 100), archived boolean not null default false, created_at timestamptz not null default now(), unique(id,user_id));
create table public.memberships (project_id uuid not null,agent_id uuid not null,user_id uuid not null default auth.uid() references auth.users on delete cascade,primary key(project_id,agent_id),foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,foreign key(agent_id,user_id) references public.agents(id,user_id) on delete cascade);
create table public.requests (id uuid primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,project_id uuid not null, status text not null default 'pending' check(status in ('pending','done','failed','cancelled')),created_at timestamptz not null default now(), foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade);
create unique index one_pending_turn on public.requests(project_id) where status='pending';
create table public.messages (id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,project_id uuid not null,agent_id uuid,role text not null check(role in ('user','assistant')),content text not null check(length(content)<=24000),sources jsonb not null default '[]',created_at timestamptz not null default now(),request_id uuid references public.requests on delete set null,foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,foreign key(agent_id,user_id) references public.agents(id,user_id) on delete set null (agent_id));
create table public.documents (id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,project_id uuid not null,name text not null,storage_path text,status text not null default 'processing' check(status in ('processing','ready','error')),error text,chunks jsonb not null default '[]',created_at timestamptz not null default now(),foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade);
create table public.jobs (id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,project_id uuid not null,agent_id uuid,title text not null,kind text not null check(kind in ('reminder','ideas','research')),topic text not null,cron text not null,timezone text not null,next_run timestamptz not null,enabled boolean not null default true,notify boolean not null default false,allowance integer not null default 10 check(allowance between 1 and 30),last_error text,foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,foreign key(agent_id,user_id) references public.agents(id,user_id) on delete cascade);
create table public.job_runs (id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs on delete cascade,user_id uuid not null references auth.users on delete cascade,scheduled_at timestamptz not null,status text not null default 'running',attempts integer not null default 1,lease_until timestamptz not null default now()+interval '2 minutes',error text,created_at timestamptz not null default now(),unique(job_id,scheduled_at));
create table public.inbox (id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,job_id uuid not null references public.jobs on delete cascade,run_id uuid not null unique references public.job_runs on delete cascade,title text not null,body text not null,why text not null,sources jsonb not null default '[]',read boolean not null default false,created_at timestamptz not null default now());
create table public.usage (id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,kind text not null,model text not null default '',status text not null default 'reserved',input_tokens integer,output_tokens integer,duration_ms integer,created_at timestamptz not null default now());
create index usage_by_user_day on public.usage(user_id,created_at);
create table public.music_feedback (id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,track_id bigint not null,context text not null,feedback text not null check(feedback in ('liked','disliked','wrong moment')),created_at timestamptz not null default now());
create table public.system_config (id boolean primary key default true check(id),ai_enabled boolean not null default true,user_daily_limit integer not null default 40 check(user_daily_limit between 1 and 1000),global_daily_limit integer not null default 400 check(global_daily_limit between 1 and 100000));
insert into public.system_config(id) values(true);
-- Never trust an agent prompt or client filter as authorization.
do $$ declare t text; begin foreach t in array array['profiles','agents','projects','memberships','requests','messages','documents','jobs','job_runs','inbox','usage','music_feedback'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy own_read on public.%I for select to authenticated using (user_id=auth.uid())',t);end loop;end $$;
do $$ declare t text; begin foreach t in array array['profiles','agents','projects','memberships','messages','documents','jobs','music_feedback'] loop execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id=auth.uid())',t);execute format('create policy own_update on public.%I for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);execute format('create policy own_delete on public.%I for delete to authenticated using (user_id=auth.uid())',t);end loop;end $$;
create policy inbox_read_update on public.inbox for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table public.system_config enable row level security;
-- Usage mutations are privileged. Failed and cancelled attempts consume call allowance.
create function public.reserve_usage(p_user uuid,p_kind text,p_model text,p_count integer) returns uuid[] language plpgsql security definer set search_path=public as $$
declare limits system_config; result uuid[]='{}'; item uuid; begin
if current_user<>'postgres' and auth.role()<>'service_role' then raise exception 'service role required';end if;
if p_count<1 or p_count>3 then raise exception 'invalid call count';end if;
perform pg_advisory_xact_lock(914257);
select * into limits from system_config where id=true;
if p_kind<>'music' and not limits.ai_enabled then raise exception 'AI is paused by the owner';end if;
if (select count(*) from usage where user_id=p_user and created_at>=date_trunc('day',now()))+p_count>limits.user_daily_limit then raise exception 'daily user allowance reached';end if;
if (select count(*) from usage where created_at>=date_trunc('day',now()))+p_count>limits.global_daily_limit then raise exception 'daily app allowance reached';end if;
for i in 1..p_count loop insert into usage(user_id,kind,model) values(p_user,p_kind,p_model) returning id into item;result=array_append(result,item);end loop;return result;end $$;
revoke all on function public.reserve_usage(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_usage(uuid,text,text,integer) to service_role;
create function public.claim_jobs() returns setof public.job_runs language plpgsql security definer set search_path=public as $$
declare j jobs; r job_runs; begin
for j in select * from jobs where enabled and next_run<=now() order by next_run for update skip locked limit 5 loop
if (select count(*) from job_runs where job_id=j.id and status='done' and created_at>=date_trunc('month',now()))>=j.allowance then continue;end if;
insert into job_runs(job_id,user_id,scheduled_at) values(j.id,j.user_id,j.next_run) on conflict(job_id,scheduled_at) do nothing returning * into r;
if r.id is null then update job_runs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes' where job_id=j.id and scheduled_at=j.next_run and lease_until<now() and status in ('running','retry') and attempts<3 returning * into r;end if;
if r.id is not null then return next r;end if;
end loop;end $$;
revoke all on function public.claim_jobs() from public,anon,authenticated;
grant execute on function public.claim_jobs() to service_role;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(user_id) values(new.id);return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
-- Private storage; paths begin with the authenticated user's UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cast-private','cast-private',false,5242880,array['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/markdown']);
create policy own_files_read on storage.objects for select to authenticated using(bucket_id='cast-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_files_insert on storage.objects for insert to authenticated with check(bucket_id='cast-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_files_delete on storage.objects for delete to authenticated using(bucket_id='cast-private' and (storage.foldername(name))[1]=auth.uid()::text);


-- 202610020002_limits.sql
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


-- 202610020003_onboarding.sql
-- Serialize onboarding per profile so repeated sign-in requests cannot duplicate presets.
create function public.bootstrap_cast(p_presets jsonb) returns void language plpgsql set search_path=public as $$
declare profile profiles; preset jsonb; project uuid; agent uuid; begin
select * into profile from profiles where user_id=auth.uid() for update;
if profile.user_id is null then raise exception 'Profile required';end if;
if coalesce((profile.settings->>'onboarded')::boolean,false) then return;end if;
if jsonb_typeof(p_presets)<>'array' or jsonb_array_length(p_presets)>6 then raise exception 'Invalid presets';end if;
if not exists(select 1 from agents where user_id=auth.uid()) then
for preset in select value from jsonb_array_elements(p_presets) loop
insert into agents(name,avatar,personality,worldview,background,expertise,instructions,voice,memories,permissions)
values(preset->>'name',preset->>'avatar',preset->>'personality',preset->>'worldview',preset->>'background',preset->>'expertise',preset->>'instructions',preset->>'voice','',preset->'permissions');
end loop;end if;
select id into project from projects where user_id=auth.uid() and not archived order by created_at limit 1;
if project is null then insert into projects(name) values('First thoughts') returning id into project;end if;
select id into agent from agents where user_id=auth.uid() and not archived order by (name='Researcher') desc,name limit 1;
if agent is not null then insert into memberships(project_id,agent_id) values(project,agent) on conflict do nothing;end if;
update profiles set settings=jsonb_set(settings,'{onboarded}','true'::jsonb) where user_id=auth.uid();end $$;
revoke all on function public.bootstrap_cast(jsonb) from public,anon;
grant execute on function public.bootstrap_cast(jsonb) to authenticated;


-- 202610020004_settings.sql
create function public.patch_settings(p_patch jsonb) returns void language sql set search_path=public as $$
update profiles set settings=settings||p_patch where user_id=auth.uid();$$;
revoke all on function public.patch_settings(jsonb) from public,anon;
grant execute on function public.patch_settings(jsonb) to authenticated;


-- 202610020005_context_jobs.sql
alter table public.projects add column summary text not null default '' check(length(summary)<=4000);
alter table public.jobs add constraint job_text_limits check(length(title) between 1 and 100 and length(topic) between 1 and 3000 and length(cron)<=100 and length(timezone)<=100);
create or replace function public.enforce_record_limits() returns trigger language plpgsql set search_path=public as $$ declare n integer; maximum integer; begin
perform pg_advisory_xact_lock(hashtext(new.user_id::text));
if tg_table_name='documents' then select count(*) into n from documents where project_id=new.project_id;maximum=20;
elsif tg_table_name='agents' then select count(*) into n from agents where user_id=new.user_id;maximum=500;
elsif tg_table_name='jobs' then select count(*) into n from jobs where user_id=new.user_id;maximum=50;
else select count(*) into n from projects where user_id=new.user_id;maximum=100;end if;
if n>=maximum then raise exception 'Record allowance reached';end if;return new;end $$;
create trigger limit_jobs before insert on public.jobs for each row execute function public.enforce_record_limits();
create or replace function public.claim_jobs() returns setof public.job_runs language plpgsql security definer set search_path=public as $$
declare j jobs; r job_runs; begin
for j in select * from jobs where enabled and next_run<=now()
and (select count(*) from job_runs where job_id=jobs.id and status='done' and created_at>=date_trunc('month',now()))<allowance
order by next_run for update skip locked limit 2 loop
insert into job_runs(job_id,user_id,scheduled_at) values(j.id,j.user_id,j.next_run) on conflict(job_id,scheduled_at) do nothing returning * into r;
if r.id is null then update job_runs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes' where job_id=j.id and scheduled_at=j.next_run and lease_until<now() and status in ('running','retry') and attempts<3 returning * into r;end if;
if r.id is not null then return next r;end if;
end loop;end $$;


commit;
