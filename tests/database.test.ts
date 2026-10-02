import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { presets } from "../src/lib/presets";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  await db.exec(
    `grant usage on schema public,auth,storage to authenticated,anon,service_role;grant all on all tables in schema public,storage to authenticated,service_role;insert into auth.users(id) values('${alice}'),('${bob}');`,
  );
  return db;
}
async function asUser(db: PGlite, user: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${user}';set role authenticated;`,
  );
}
test("RLS and composite ownership prevent cross-account reads, writes, and invitations", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    const p = (
      await db.query<{ id: string }>(
        "insert into projects(name) values('Private project') returning id",
      )
    ).rows[0].id;
    const a = (
      await db.query<{ id: string }>(
        "insert into agents(name) values('Private agent') returning id",
      )
    ).rows[0].id;
    await db.exec(
      `insert into memberships(project_id,agent_id) values('${p}','${a}');insert into storage.objects(bucket_id,name) values('cast-private','${alice}/documents/a.txt');`,
    );
    await asUser(db, bob);
    assert.equal((await db.query("select * from projects")).rows.length, 0);
    assert.equal((await db.query("select * from agents")).rows.length, 0);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update projects set name='stolen' where id='${p}' returning id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into messages(project_id,role,content) values('${p}','user','stolen');`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into memberships(project_id,agent_id) values('${p}','${a}');`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('cast-private','${alice}/documents/stolen.txt');`,
      ),
    );
    await assert.rejects(
      db.exec(`select reserve_usage('${bob}','text','model',1);`),
    );
    await assert.rejects(db.exec("select claim_jobs();"));
  } finally {
    await db.close();
  }
});
test("usage reservations enforce user/global limits, retain failed call cost, and respect kill switch", async () => {
  const db = await database();
  try {
    await db.exec(
      `update system_config set user_daily_limit=3,global_daily_limit=4;`,
    );
    await db.query("select reserve_usage($1,'text','model',3)", [alice]);
    await assert.rejects(
      db.query("select reserve_usage($1,'text','model',1)", [alice]),
    );
    await db.exec("update usage set status='failed';");
    await assert.rejects(
      db.query("select reserve_usage($1,'text','model',1)", [alice]),
    );
    await db.query("select reserve_usage($1,'text','model',1)", [bob]);
    await assert.rejects(
      db.query("select reserve_usage($1,'text','model',1)", [bob]),
    );
    await db.exec("update system_config set ai_enabled=false;");
    await assert.rejects(
      db.query("select reserve_usage($1,'voice','model',1)", [bob]),
    );
    assert.equal((await db.query("select * from usage")).rows.length, 4);
  } finally {
    await db.close();
  }
});
test("scheduler claims are idempotent, overlapping workers cannot double-claim, retries are bounded", async () => {
  const db = await database();
  try {
    await db.exec(
      `insert into projects(id,user_id,name) values('${alice}','${alice}','A');insert into jobs(id,user_id,project_id,title,kind,topic,cron,timezone,next_run) values('${bob}','${alice}','${alice}','Reminder','reminder','Think','0 9 * * *','UTC',now()-interval '1 hour');`,
    );
    assert.equal((await db.query("select * from claim_jobs()")).rows.length, 1);
    assert.equal((await db.query("select * from claim_jobs()")).rows.length, 0);
    await db.exec(
      "update job_runs set lease_until=now()-interval '1 minute',status='retry';",
    );
    const r = (
      await db.query<{ attempts: number }>("select * from claim_jobs()")
    ).rows[0];
    assert.equal(r.attempts, 2);
    await db.exec(
      "update job_runs set lease_until=now()-interval '1 minute',attempts=3,status='retry';",
    );
    assert.equal((await db.query("select * from claim_jobs()")).rows.length, 0);
  } finally {
    await db.close();
  }
});
test("database records survive process-equivalent close and reopen", async () => {
  const path = await mkdtemp(tmpdir() + "/cast-durability-");
  let db = new PGlite(path);
  await db.exec(
    "create table persistence(value text); insert into persistence values('saved conversation');",
  );
  await db.close();
  db = new PGlite(path);
  assert.equal(
    (await db.query<{ value: string }>("select * from persistence")).rows[0]
      .value,
    "saved conversation",
  );
  await db.close();
});
test("onboarding runs once and preference patches preserve unrelated settings", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    await db.query("select bootstrap_cast($1::jsonb)", [
      JSON.stringify(presets),
    ]);
    await db.query("select bootstrap_cast($1::jsonb)", [
      JSON.stringify(presets),
    ]);
    assert.equal((await db.query("select * from agents")).rows.length, 6);
    assert.equal((await db.query("select * from projects")).rows.length, 1);
    assert.equal((await db.query("select * from memberships")).rows.length, 1);
    await db.query("select patch_settings($1::jsonb)", [
      JSON.stringify({ timezone: "Europe/London" }),
    ]);
    await db.query("select patch_settings($1::jsonb)", [
      JSON.stringify({ activeProjectId: alice }),
    ]);
    const settings = (
      await db.query<{
        settings: {
          timezone: string;
          activeProjectId: string;
          onboarded: boolean;
        };
      }>("select settings from profiles")
    ).rows[0].settings;
    assert.equal(settings.timezone, "Europe/London");
    assert.equal(settings.activeProjectId, alice);
    assert.ok(settings.onboarded);
    await db.exec("delete from agents;");
    await db.query("select bootstrap_cast($1::jsonb)", [
      JSON.stringify(presets),
    ]);
    assert.equal((await db.query("select * from agents")).rows.length, 0);
  } finally {
    await db.close();
  }
});
test("database enforces direct-write document, avatar, and private-file bounds", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    await db.exec(`insert into projects(id,name) values('${alice}','Bounds');`);
    for (let i = 0; i < 20; i++)
      await db.exec(
        `insert into documents(project_id,name) values('${alice}','doc${i}');`,
      );
    await assert.rejects(
      db.exec(
        `insert into documents(project_id,name) values('${alice}','excess');`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into agents(name,avatar) values('Foreign avatar','${bob}/avatars/private');`,
      ),
    );
    for (let i = 0; i < 100; i++)
      await db.exec(
        `insert into storage.objects(bucket_id,name) values('cast-private','${alice}/documents/${i}');`,
      );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('cast-private','${alice}/documents/excess');`,
      ),
    );
  } finally {
    await db.close();
  }
});
