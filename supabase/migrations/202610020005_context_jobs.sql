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
