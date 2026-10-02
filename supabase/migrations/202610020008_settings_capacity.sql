-- Bounded scene preferences and up to twenty saved map places share the profile record.
alter table public.profiles drop constraint settings_size;
alter table public.profiles add constraint settings_size check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=20000);
