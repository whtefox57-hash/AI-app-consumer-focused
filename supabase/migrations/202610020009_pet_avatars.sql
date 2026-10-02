-- The studio's approved character appearances are safe literals, alongside private owner uploads.
alter table public.agents drop constraint avatar_scope;
alter table public.agents add constraint avatar_scope check(
  avatar in ('amber','sage','slate','rose','blue','violet','🐈','🐕','🐇','🦉','🦊','🤖')
  or split_part(avatar,'/',1)=user_id::text
);
