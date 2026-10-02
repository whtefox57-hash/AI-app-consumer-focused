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


-- 202610020006_agent_studio.sql
-- Character preferences are bounded data; they do not grant tool execution.
create function public.valid_agent_config(value jsonb) returns boolean language plpgsql immutable as $$
declare item record; member jsonb; maximum integer;
begin
  if jsonb_typeof(value)<>'object' or octet_length(value::text)>24000 then return false;end if;
  for item in select * from jsonb_each(value) loop
    if item.key in ('role','beliefs','origin','story','responseStyle') then
      if jsonb_typeof(item.value)<>'string' then return false;end if;
      maximum=case item.key when 'role' then 100 when 'origin' then 1000 when 'responseStyle' then 10 else 2000 end;
      if length(item.value#>>'{}')>maximum then return false;end if;
      if item.key='responseStyle' and item.value#>>'{}' not in ('balanced','concise','thorough') then return false;end if;
    elsif item.key in ('emotions','capabilities','tools','document_ids','workflow_ids','examples') then
      if jsonb_typeof(item.value)<>'array' then return false;end if;
      maximum=case item.key when 'emotions' then 12 when 'examples' then 6 else 20 end;
      if jsonb_array_length(item.value)>maximum then return false;end if;
      for member in select * from jsonb_array_elements(item.value) loop
        if item.key='examples' then
          if jsonb_typeof(member)<>'object' or jsonb_typeof(member->'prompt') is distinct from 'string' or jsonb_typeof(member->'response') is distinct from 'string' then return false;end if;
          if (select count(*) from jsonb_object_keys(member))<>2 or length(member->>'prompt') not between 1 and 500 or length(member->>'response') not between 1 and 1500 then return false;end if;
        else
          if jsonb_typeof(member)<>'string' then return false;end if;
          if item.key in ('document_ids','workflow_ids') then
            if member#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
          else
            maximum=case when item.key='emotions' then 80 else 100 end;
            if length(member#>>'{}') not between 1 and maximum then return false;end if;
          end if;
        end if;
      end loop;
      if item.key in ('document_ids','workflow_ids') and (select count(distinct entry.value) from jsonb_array_elements(item.value) entry(value))<>jsonb_array_length(item.value) then return false;end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;
alter table public.agents add column config jsonb not null default '{}' check(public.valid_agent_config(config));

create function public.valid_workflow_steps(value jsonb) returns boolean language plpgsql immutable as $$
declare step jsonb;
begin
  if jsonb_typeof(value)<>'array' or octet_length(value::text)>20000 then return false;end if;
  if jsonb_array_length(value) not between 1 and 8 then return false;end if;
  for step in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(step)<>'object' or (select count(*) from jsonb_object_keys(step))<>3 then return false;end if;
    if jsonb_typeof(step->'id') is distinct from 'string' or jsonb_typeof(step->'title') is distinct from 'string' or jsonb_typeof(step->'instructions') is distinct from 'string' then return false;end if;
    if step->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(step->>'title') not between 1 and 100 or length(step->>'instructions') not between 1 and 2000 then return false;end if;
  end loop;
  return (select count(distinct entry.value->>'id') from jsonb_array_elements(value) entry(value))=jsonb_array_length(value);
end $$;
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check(length(name) between 1 and 100),
  description text not null default '' check(length(description)<=1000),
  kind text not null default 'text' check(kind in ('text','image','video')),
  steps jsonb not null check(public.valid_workflow_steps(steps)),
  enabled boolean not null default true check(kind='text' or not enabled),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);
alter table public.workflows enable row level security;
create policy own_read on public.workflows for select to authenticated using(user_id=auth.uid());
create policy own_insert on public.workflows for insert to authenticated with check(user_id=auth.uid());
create policy own_update on public.workflows for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_delete on public.workflows for delete to authenticated using(user_id=auth.uid());
grant select,insert,update,delete on public.workflows to authenticated,service_role;

create function public.check_workflow_write() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    if (select count(*) from workflows where user_id=new.user_id)>=100 then raise exception 'Workflow allowance reached';end if;
  end if;
  new.updated_at=now();return new;
end $$;
create trigger workflow_write before insert or update on public.workflows for each row execute function public.check_workflow_write();

-- IDs cannot be used to smuggle another account's private files or plans into a character.
create function public.check_agent_references() returns trigger language plpgsql set search_path=public as $$
declare selected text;
begin
  if not public.valid_agent_config(new.config) then raise exception 'Invalid character configuration';end if;
  for selected in select jsonb_array_elements_text(coalesce(new.config->'document_ids','[]'::jsonb)) loop
    if not exists(select 1 from documents where id=selected::uuid and user_id=new.user_id) then raise exception 'File is unavailable';end if;
  end loop;
  for selected in select jsonb_array_elements_text(coalesce(new.config->'workflow_ids','[]'::jsonb)) loop
    if not exists(select 1 from workflows where id=selected::uuid and user_id=new.user_id) then raise exception 'Workflow is unavailable';end if;
  end loop;
  return new;
end $$;
create trigger agent_references before insert or update of config,user_id on public.agents for each row execute function public.check_agent_references();

create function public.apply_workflow(p_workflow uuid,p_agents uuid[],p_all boolean default false) returns integer language plpgsql set search_path=public as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if cardinality(p_agents)>500 or cardinality(p_agents) is null or p_all is null then raise exception 'Invalid selections';end if;
  if p_all and cardinality(p_agents)>0 or not p_all and cardinality(p_agents)=0 then raise exception 'Choose agents or apply to all';end if;
  if (select count(distinct selected) from unnest(p_agents) selected)<>cardinality(p_agents) then raise exception 'Duplicate selections';end if;
  if not exists(select 1 from workflows where id=p_workflow and user_id=auth.uid() and kind='text' and enabled) then raise exception 'Choose an enabled text workflow';end if;
  if not p_all and (select count(*) from agents where user_id=auth.uid() and not archived and id=any(p_agents))<>cardinality(p_agents) then raise exception 'Agent is unavailable';end if;
  update agents set config=jsonb_set(config,'{workflow_ids}',coalesce(config->'workflow_ids','[]'::jsonb)||to_jsonb(p_workflow::text))
  where user_id=auth.uid() and not archived and (p_all or id=any(p_agents)) and not coalesce(config->'workflow_ids','[]'::jsonb) @> to_jsonb(array[p_workflow::text]);
  get diagnostics affected=row_count;return affected;
end $$;
revoke all on function public.apply_workflow(uuid,uuid[],boolean) from public,anon;
grant execute on function public.apply_workflow(uuid,uuid[],boolean) to authenticated;

create function public.remove_workflow_references() returns trigger language plpgsql set search_path=public as $$
begin
  update agents set config=jsonb_set(config,'{workflow_ids}',coalesce((select jsonb_agg(selected) from jsonb_array_elements_text(config->'workflow_ids') selected where selected<>old.id::text),'[]'::jsonb))
  where user_id=old.user_id and config->'workflow_ids' @> to_jsonb(array[old.id::text]);
  return old;
end $$;
create trigger remove_workflow_references after delete on public.workflows for each row execute function public.remove_workflow_references();

create function public.remove_document_references() returns trigger language plpgsql set search_path=public as $$
begin
  update agents set config=jsonb_set(config,'{document_ids}',coalesce((select jsonb_agg(selected) from jsonb_array_elements_text(config->'document_ids') selected where selected<>old.id::text),'[]'::jsonb))
  where user_id=old.user_id and config->'document_ids' @> to_jsonb(array[old.id::text]);
  return old;
end $$;
create trigger remove_document_references after delete on public.documents for each row execute function public.remove_document_references();

-- Ten distinct participants reserve one bounded call each, atomically.
create or replace function public.reserve_usage(p_user uuid,p_kind text,p_model text,p_count integer) returns uuid[] language plpgsql security definer set search_path=public as $$
declare limits system_config; result uuid[]='{}'; item uuid; begin
if current_user<>'postgres' and auth.role()<>'service_role' then raise exception 'service role required';end if;
if p_count<1 or p_count>10 then raise exception 'invalid call count';end if;
perform pg_advisory_xact_lock(914257);
select * into limits from system_config where id=true;
if p_kind<>'music' and not limits.ai_enabled then raise exception 'AI is paused by the owner';end if;
if (select count(*) from usage where user_id=p_user and created_at>=date_trunc('day',now()))+p_count>limits.user_daily_limit then raise exception 'daily user allowance reached';end if;
if (select count(*) from usage where created_at>=date_trunc('day',now()))+p_count>limits.global_daily_limit then raise exception 'daily app allowance reached';end if;
for i in 1..p_count loop insert into usage(user_id,kind,model) values(p_user,p_kind,p_model) returning id into item;result=array_append(result,item);end loop;return result;end $$;
create unique index one_assistant_reply_per_participant on public.messages(request_id,agent_id) where role='assistant' and request_id is not null and agent_id is not null;

-- Serialize membership changes on the project so simultaneous clients cannot exceed ten.
create function public.limit_project_cast() returns trigger language plpgsql set search_path=public as $$
begin
  perform 1 from projects where id=new.project_id and user_id=new.user_id for update;
  if exists(select 1 from memberships where project_id=new.project_id and agent_id=new.agent_id) then return new;end if;
  if tg_op='UPDATE' then
    if (select count(*) from memberships where project_id=new.project_id and (project_id,agent_id)<>(old.project_id,old.agent_id))>=10 then raise exception 'A project can include up to ten agents';end if;
  elsif (select count(*) from memberships where project_id=new.project_id)>=10 then raise exception 'A project can include up to ten agents';end if;
  return new;
end $$;
create trigger limit_project_cast before insert or update of project_id,agent_id on public.memberships for each row execute function public.limit_project_cast();


-- 202610020007_community.sql
-- Shared community records never expose private account settings or precise locations.
create table public.community_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check(length(display_name) between 1 and 80),
  bio text not null default '' check(length(bio)<=1000),
  interests text[] not null default '{}' check(cardinality(interests)<=20 and length(array_to_string(interests,','))<=1000),
  discoverable boolean not null default false
);
create table public.community_networks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check(length(name) between 1 and 100),
  purpose text not null default '' check(length(purpose)<=2000),
  visibility text not null default 'private' check(visibility in ('public','private')),
  topics text[] not null default '{}' check(cardinality(topics)<=12 and length(array_to_string(topics,','))<=600),
  created_at timestamptz not null default now()
);
create table public.community_members (
  network_id uuid references public.community_networks on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check(role in ('owner','moderator','member')),
  primary key(network_id,user_id)
);
create table public.community_invitations (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.community_networks on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check(role in ('moderator','member')),
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  expires_at timestamptz not null default now()+interval '7 days',
  check(sender_id<>target_id), unique(network_id,target_id)
);
create table public.community_connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  check(sender_id<>target_id), unique(sender_id,target_id)
);
create table public.community_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  network_id uuid references public.community_networks on delete cascade,
  content text not null check(length(content) between 1 and 10000),
  link_url text not null default '' check(length(link_url)<=2000 and (link_url='' or link_url like 'https://%')),
  audience text not null default 'connections' check(audience in ('private','connections','public')),
  created_at timestamptz not null default now()
);
create table public.community_replies (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  content text not null check(length(content) between 1 and 3000),created_at timestamptz not null default now()
);
create table public.community_reactions (
  post_id uuid references public.community_posts on delete cascade,user_id uuid default auth.uid() references auth.users on delete cascade,
  kind text check(kind in ('like','bookmark')), primary key(post_id,user_id,kind)
);
create table public.community_events (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
  network_id uuid references public.community_networks on delete cascade,
  title text not null check(length(title) between 1 and 160),starts_at timestamptz not null,
  location text not null default '' check(length(location)<=200),
  url text not null default '' check(length(url)<=2000 and (url='' or url like 'https://%'))
);
create table public.community_resources (
  id uuid primary key default gen_random_uuid(),network_id uuid not null references public.community_networks on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check(length(title) between 1 and 160),url text not null check(length(url)<=2000 and url like 'https://%'),
  kind text not null default 'resource' check(kind in ('project','resource','game'))
);
create table public.community_layouts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  view text not null check(view in ('feed','networks')),panels jsonb not null default '[]'
  check(jsonb_typeof(panels)='array' and jsonb_array_length(panels)<=12 and length(panels::text)<=3000),primary key(user_id,view)
);
create index community_posts_recent on public.community_posts(created_at desc);
create index community_posts_network on public.community_posts(network_id,created_at desc);
-- Security-definer helpers avoid recursive membership policies. All decisions use auth.uid().
create function public.community_role(p_network uuid) returns text language sql stable security definer set search_path=public as $$
select case when owner_id=auth.uid() then 'owner' else (select role from community_members where network_id=p_network and user_id=auth.uid()) end from community_networks where id=p_network $$;
create function public.community_can_read_network(p_network uuid) returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from community_networks where id=p_network and (visibility='public' or community_role(p_network) is not null or exists(select 1 from community_invitations where network_id=p_network and target_id=auth.uid() and status='pending' and expires_at>now()))) $$;
create function public.community_can_read_post(p_post uuid) returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from community_posts p where p.id=p_post and (p.user_id=auth.uid() or (p.network_id is not null and community_can_read_network(p.network_id) and (exists(select 1 from community_networks where id=p.network_id and visibility='public') or community_role(p.network_id) is not null)) or (p.network_id is null and p.audience='public' and exists(select 1 from community_profiles where user_id=p.user_id and discoverable)) or (p.network_id is null and p.audience='connections' and exists(select 1 from community_connections c where c.status='accepted' and ((c.sender_id=p.user_id and c.target_id=auth.uid()) or (c.target_id=p.user_id and c.sender_id=auth.uid())))))) $$;
create function public.community_member_counts() returns table(network_id uuid,member_count bigint) language sql stable security definer set search_path=public as $$
select n.id,count(m.user_id) from community_networks n left join community_members m on m.network_id=n.id where community_can_read_network(n.id) group by n.id $$;
create function public.community_owner_member() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into community_members(network_id,user_id,role) values(new.id,new.owner_id,'owner');return new;end $$;
create trigger community_network_owner after insert on public.community_networks for each row execute function public.community_owner_member();
create function public.community_network_immutable() returns trigger language plpgsql as $$ begin if new.owner_id<>old.owner_id or new.id<>old.id then raise exception 'Network identity cannot change';end if;return new;end $$;
create trigger community_network_identity before update on public.community_networks for each row execute function public.community_network_immutable();
create function public.community_record_immutable() returns trigger language plpgsql as $$ begin if new.user_id<>old.user_id or new.id<>old.id then raise exception 'Record author and identity cannot change';end if;return new;end $$;
create trigger community_post_identity before update on public.community_posts for each row execute function public.community_record_immutable();
create trigger community_event_identity before update on public.community_events for each row execute function public.community_record_immutable();
create trigger community_resource_identity before update on public.community_resources for each row execute function public.community_record_immutable();
create function public.community_join(p_network uuid) returns void language plpgsql security definer set search_path=public as $$ begin
if auth.uid() is null or not exists(select 1 from community_networks where id=p_network and visibility='public') then raise exception 'This network requires an invitation';end if;
insert into community_members(network_id,user_id,role) values(p_network,auth.uid(),'member') on conflict do nothing;end $$;
create function public.community_accept_invitation(p_invitation uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$ declare invite community_invitations;begin
select * into invite from community_invitations where id=p_invitation and target_id=auth.uid() and status='pending' and expires_at>now() for update;
if invite.id is null then raise exception 'This invitation is unavailable';end if;
if p_accept then insert into community_members(network_id,user_id,role) values(invite.network_id,auth.uid(),invite.role) on conflict(network_id,user_id) do nothing;end if;
update community_invitations set status=case when p_accept then 'accepted' else 'declined' end where id=invite.id;end $$;
create function public.community_invite(p_network uuid,p_target uuid,p_role text default 'member') returns public.community_invitations language plpgsql security definer set search_path=public as $$ declare actor text;result community_invitations;begin
actor=community_role(p_network);
if auth.uid() is null or actor is null or p_target is null or p_target=auth.uid() or p_role is null or p_role not in ('member','moderator') or not (actor='owner' or (actor='moderator' and p_role='member')) then raise exception 'Cannot send this invitation';end if;
if exists(select 1 from community_members where network_id=p_network and user_id=p_target) then raise exception 'This person has already joined';end if;
insert into community_invitations(network_id,sender_id,target_id,role) values(p_network,auth.uid(),p_target,p_role)
on conflict(network_id,target_id) do update set sender_id=auth.uid(),role=p_role,status='pending',expires_at=now()+interval '7 days' returning * into result;return result;end $$;
create function public.community_accept_connection(p_connection uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$ begin
update community_connections set status=case when p_accept then 'accepted' else 'declined' end where id=p_connection and target_id=auth.uid() and status='pending';
if not found then raise exception 'This connection request is unavailable';end if;end $$;
create function public.community_manage_member(p_network uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$ declare actor text; target text;begin
actor=community_role(p_network);select role into target from community_members where network_id=p_network and user_id=p_user for update;
if actor is null or target is null or target='owner' then raise exception 'Cannot change this member';end if;
if p_role is null then
if auth.uid()<>p_user and not (actor='owner' or (actor='moderator' and target='member')) then raise exception 'Role required';end if;
delete from community_members where network_id=p_network and user_id=p_user;
else
if actor<>'owner' or p_role not in ('member','moderator') then raise exception 'Only the owner can assign roles';end if;
update community_members set role=p_role where network_id=p_network and user_id=p_user;
end if;end $$;
do $$ declare t text;begin foreach t in array array['community_profiles','community_networks','community_members','community_invitations','community_connections','community_posts','community_replies','community_reactions','community_events','community_resources','community_layouts'] loop execute format('alter table public.%I enable row level security',t);end loop;end $$;
create policy community_profiles_read on public.community_profiles for select to authenticated using(user_id=auth.uid() or discoverable);
create policy community_profiles_write on public.community_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy community_networks_read on public.community_networks for select to authenticated using(owner_id=auth.uid() or community_can_read_network(id));
create policy community_networks_create on public.community_networks for insert to authenticated with check(owner_id=auth.uid());
create policy community_networks_edit on public.community_networks for update to authenticated using(community_role(id) in ('owner','moderator')) with check(community_role(id) in ('owner','moderator'));
create policy community_networks_delete on public.community_networks for delete to authenticated using(owner_id=auth.uid());
create policy community_members_read on public.community_members for select to authenticated using(community_role(network_id) is not null);
create policy community_invitations_read on public.community_invitations for select to authenticated using(target_id=auth.uid() or sender_id=auth.uid() or community_role(network_id) in ('owner','moderator'));
create policy community_invitations_create on public.community_invitations for insert to authenticated with check(sender_id=auth.uid() and status='pending' and expires_at between now() and now()+interval '8 days' and ((community_role(network_id)='owner') or (community_role(network_id)='moderator' and role='member')));
create policy community_invitations_delete on public.community_invitations for delete to authenticated using(sender_id=auth.uid() or community_role(network_id)='owner');
create policy community_connections_read on public.community_connections for select to authenticated using(sender_id=auth.uid() or target_id=auth.uid());
create policy community_connections_create on public.community_connections for insert to authenticated with check(sender_id=auth.uid() and status='pending' and exists(select 1 from community_profiles where user_id=target_id and discoverable));
create policy community_connections_delete on public.community_connections for delete to authenticated using(sender_id=auth.uid() or target_id=auth.uid());
create policy community_posts_read on public.community_posts for select to authenticated using(user_id=auth.uid() or community_can_read_post(id));
create policy community_posts_create on public.community_posts for insert to authenticated with check(user_id=auth.uid() and (network_id is null or community_role(network_id) is not null) and (audience<>'public' or network_id is not null or exists(select 1 from community_profiles where user_id=auth.uid() and discoverable)));
create policy community_posts_edit on public.community_posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (network_id is null or community_role(network_id) is not null) and (audience<>'public' or network_id is not null or exists(select 1 from community_profiles where user_id=auth.uid() and discoverable)));
create policy community_posts_delete on public.community_posts for delete to authenticated using(user_id=auth.uid() or community_role(network_id) in ('owner','moderator'));
create policy community_replies_read on public.community_replies for select to authenticated using(community_can_read_post(post_id));
create policy community_replies_create on public.community_replies for insert to authenticated with check(user_id=auth.uid() and community_can_read_post(post_id) and exists(select 1 from community_posts where id=post_id and (network_id is null or community_role(network_id) is not null)));
create policy community_replies_delete on public.community_replies for delete to authenticated using(user_id=auth.uid() or exists(select 1 from community_posts where id=post_id and community_role(network_id) in ('owner','moderator')));
create policy community_reactions_read on public.community_reactions for select to authenticated using(community_can_read_post(post_id) and (kind='like' or user_id=auth.uid()));
create policy community_reactions_create on public.community_reactions for insert to authenticated with check(user_id=auth.uid() and community_can_read_post(post_id));
create policy community_reactions_delete on public.community_reactions for delete to authenticated using(user_id=auth.uid());
create policy community_events_read on public.community_events for select to authenticated using(user_id=auth.uid() or (network_id is not null and community_can_read_network(network_id)));
create policy community_events_create on public.community_events for insert to authenticated with check(user_id=auth.uid() and (network_id is null or community_role(network_id) in ('owner','moderator')));
create policy community_events_edit on public.community_events for update to authenticated using(user_id=auth.uid() or community_role(network_id) in ('owner','moderator')) with check((network_id is null and user_id=auth.uid()) or community_role(network_id) in ('owner','moderator'));
create policy community_events_delete on public.community_events for delete to authenticated using(user_id=auth.uid() or community_role(network_id) in ('owner','moderator'));
create policy community_resources_read on public.community_resources for select to authenticated using(community_can_read_network(network_id));
create policy community_resources_create on public.community_resources for insert to authenticated with check(user_id=auth.uid() and community_role(network_id) in ('owner','moderator'));
create policy community_resources_edit on public.community_resources for update to authenticated using(community_role(network_id) in ('owner','moderator')) with check(community_role(network_id) in ('owner','moderator'));
create policy community_resources_delete on public.community_resources for delete to authenticated using(community_role(network_id) in ('owner','moderator'));
create policy community_layouts_own on public.community_layouts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
do $$ declare f regprocedure;begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'community_%' loop execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated,service_role',f);end loop;end $$;
grant select,insert,update,delete on public.community_profiles,public.community_networks,public.community_members,public.community_invitations,public.community_connections,public.community_posts,public.community_replies,public.community_reactions,public.community_events,public.community_resources,public.community_layouts to authenticated;


-- 202610020008_settings_capacity.sql
-- Bounded scene preferences and up to twenty saved map places share the profile record.
alter table public.profiles drop constraint settings_size;
alter table public.profiles add constraint settings_size check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=20000);


-- 202610020009_pet_avatars.sql
-- The studio's approved character appearances are safe literals, alongside private owner uploads.
alter table public.agents drop constraint avatar_scope;
alter table public.agents add constraint avatar_scope check(
  avatar in ('amber','sage','slate','rose','blue','violet','🐈','🐕','🐇','🦉','🦊','🤖')
  or split_part(avatar,'/',1)=user_id::text
);


commit;
