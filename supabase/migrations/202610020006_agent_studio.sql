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
