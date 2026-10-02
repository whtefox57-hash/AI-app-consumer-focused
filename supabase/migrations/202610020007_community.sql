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
