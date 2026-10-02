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
