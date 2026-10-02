create function public.patch_settings(p_patch jsonb) returns void language sql set search_path=public as $$
update profiles set settings=settings||p_patch where user_id=auth.uid();$$;
revoke all on function public.patch_settings(jsonb) from public,anon;
grant execute on function public.patch_settings(jsonb) to authenticated;
