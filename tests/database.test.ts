import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { presets } from "../src/lib/presets";
import { settingsPatchSchema } from "../src/lib/settings";
import { DEFAULT_MAP_PREFERENCES } from "../src/lib/map-data";
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
test("partial scene and map patches persist together without overwriting account preferences", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    await db.exec(
      `insert into agents(id,name) values('${alice}','Welcome character');`,
    );
    const scene = settingsPatchSchema.parse({
      activeView: "map",
      backgroundScene: "network",
      heroCharacter: "agent",
      heroAgentId: alice,
      catVisits: true,
    });
    await db.query("select patch_settings($1::jsonb)", [JSON.stringify(scene)]);
    const worldMap = {
      ...DEFAULT_MAP_PREFERENCES,
      style: "dark" as const,
      mode: "history" as const,
      places: Array.from({ length: 20 }, (_, index) => ({
        id: `place-${index}`,
        title: `Saved place ${index}`,
        city: "Tucson",
        country: "United States",
        lat: 32.2226,
        lon: -110.9747,
        category: "favorite" as const,
        note: "a".repeat(180),
      })),
    };
    const mapPatch = settingsPatchSchema.parse({ worldMap });
    assert.ok(Buffer.byteLength(JSON.stringify(mapPatch)) > 5000);
    await db.query("select patch_settings($1::jsonb)", [
      JSON.stringify(mapPatch),
    ]);
    await db.query("select patch_settings($1::jsonb)", [
      JSON.stringify(settingsPatchSchema.parse({ quietStart: "21:00" })),
    ]);
    const settings = (
      await db.query<{ settings: Record<string, unknown> }>(
        "select settings from profiles",
      )
    ).rows[0].settings;
    assert.equal(settings.timezone, "America/Phoenix");
    assert.equal(settings.quietStart, "21:00");
    assert.equal(settings.quietEnd, "08:00");
    assert.equal(settings.activeView, "map");
    assert.equal(settings.backgroundScene, "network");
    assert.equal(settings.heroAgentId, alice);
    assert.equal(settings.catVisits, true);
    assert.deepEqual(settings.worldMap, mapPatch.worldMap);
    await assert.rejects(
      db.query("select patch_settings($1::jsonb)", [
        JSON.stringify({ oversized: "x".repeat(20001) }),
      ]),
    );
    await asUser(db, bob);
    await db.query("select patch_settings($1::jsonb)", [
      JSON.stringify(settingsPatchSchema.parse({ backgroundScene: "home" })),
    ]);
    await asUser(db, alice);
    assert.deepEqual(
      (
        await db.query<{ settings: Record<string, unknown> }>(
          "select settings from profiles",
        )
      ).rows[0].settings,
      settings,
    );
  } finally {
    await db.close();
  }
});
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
test("approved pet avatars save while arbitrary emoji and foreign uploads remain rejected", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    for (const avatar of ["🐈", "🐕", "🐇", "🦉", "🦊", "🤖"])
      await db.query(
        "insert into agents(name,avatar) values('Pet character',$1)",
        [avatar],
      );
    assert.equal((await db.query("select * from agents")).rows.length, 6);
    await db.query(
      "insert into agents(name,avatar) values('Uploaded character',$1)",
      [`${alice}/avatars/private.webp`],
    );
    await assert.rejects(
      db.query("insert into agents(name,avatar) values('Alien',$1)", ["👽"]),
    );
    await assert.rejects(
      db.query("insert into agents(name,avatar) values('Foreign upload',$1)", [
        `${bob}/avatars/private.webp`,
      ]),
    );
    await assert.rejects(
      db.query("insert into agents(name,avatar) values('External upload',$1)", [
        "https://example.com/avatar.webp",
      ]),
    );
  } finally {
    await db.close();
  }
});
test("saved workflows remain private and applying a template preserves each character", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    await db.exec(
      `insert into projects(id,name) values('${alice}','Knowledge');insert into agents(id,name,personality) values('${alice}','First','Curious'),('${bob}','Second','Skeptical');insert into agents(name,archived) values('Archived',true);insert into documents(id,project_id,name) values('${alice}','${alice}','Private knowledge');`,
    );
    const steps = JSON.stringify([
      {
        id: alice,
        title: "Check evidence",
        instructions: "Explain the evidence and uncertainty.",
      },
    ]);
    const workflow = (
      await db.query<{ id: string }>(
        "insert into workflows(name,steps) values('Evidence check',$1::jsonb) returning id",
        [steps],
      )
    ).rows[0].id;
    await db.query("update agents set config=$1::jsonb where id=$2", [
      JSON.stringify({ document_ids: [alice], responseStyle: "concise" }),
      alice,
    ]);
    assert.equal(
      (
        await db.query<{ updated: number }>(
          "select apply_workflow($1,'{}',true) as updated",
          [workflow],
        )
      ).rows[0].updated,
      2,
    );
    assert.equal(
      (
        await db.query<{ updated: number }>(
          "select apply_workflow($1,'{}',true) as updated",
          [workflow],
        )
      ).rows[0].updated,
      0,
    );
    const characters = (
      await db.query<{
        personality: string;
        config: { workflow_ids: string[]; document_ids?: string[] };
      }>(
        "select personality,config from agents where not archived order by name",
      )
    ).rows;
    assert.deepEqual(
      characters.map((character) => character.personality),
      ["Curious", "Skeptical"],
    );
    assert.deepEqual(characters[0].config.document_ids, [alice]);
    assert.ok(
      characters.every((character) =>
        character.config.workflow_ids.includes(workflow),
      ),
    );
    await asUser(db, bob);
    assert.equal((await db.query("select * from workflows")).rows.length, 0);
    assert.equal(
      (await db.query("update workflows set name='Stolen' returning id")).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query("select apply_workflow($1,'{}',true)", [workflow]),
    );
    await assert.rejects(
      db.query(
        "insert into agents(name,config) values('Foreign files',$1::jsonb)",
        [JSON.stringify({ document_ids: [alice] })],
      ),
    );
    await assert.rejects(
      db.query(
        "insert into agents(name,config) values('Foreign plans',$1::jsonb)",
        [JSON.stringify({ workflow_ids: [workflow] })],
      ),
    );
    await asUser(db, alice);
    await db.query("delete from documents where id=$1", [alice]);
    const afterFileDeletion = (
      await db.query<{ config: { document_ids: string[] } }>(
        "select config from agents where id=$1",
        [alice],
      )
    ).rows[0].config;
    assert.deepEqual(afterFileDeletion.document_ids, []);
    await db.query("update workflows set enabled=false where id=$1", [
      workflow,
    ]);
    await assert.rejects(
      db.query("select apply_workflow($1,'{}',true)", [workflow]),
    );
    await db.query("delete from workflows where id=$1", [workflow]);
    const remaining = (
      await db.query<{ config: { workflow_ids?: string[] } }>(
        "select config from agents",
      )
    ).rows;
    assert.ok(
      remaining.every(
        (agent) => !agent.config.workflow_ids?.includes(workflow),
      ),
    );
    await assert.rejects(
      db.query(
        "insert into workflows(name,kind,steps,enabled) values('Cannot run images','image',$1::jsonb,true)",
        [steps],
      ),
    );
    await db.query(
      "insert into workflows(name,kind,steps,enabled) values('Image draft','image',$1::jsonb,false)",
      [steps],
    );
    await assert.rejects(
      db.query(
        "insert into workflows(name,steps) values('Bad steps',$1::jsonb)",
        [
          JSON.stringify([
            { id: alice, title: "Oversized", instructions: "x".repeat(2001) },
          ]),
        ],
      ),
    );
    await assert.rejects(
      db.query("update agents set config=$1::jsonb where id=$2", [
        JSON.stringify({ tools: ["x".repeat(101)] }),
        alice,
      ]),
    );
    await assert.rejects(
      db.query("update agents set config=$1::jsonb where id=$2", [
        JSON.stringify({ admin: true }),
        alice,
      ]),
    );
  } finally {
    await db.close();
  }
});
test("ten-agent projects and quota reservations reject an eleventh participant without partial writes", async () => {
  const db = await database();
  try {
    await asUser(db, alice);
    await db.exec(
      `insert into projects(id,name) values('${alice}','Ten-agent room');`,
    );
    const agents = (
      await db.query<{ id: string }>(
        "insert into agents(name) select 'Agent '||i from generate_series(1,11) i returning id",
      )
    ).rows;
    for (const agent of agents.slice(0, 10))
      await db.query(
        "insert into memberships(project_id,agent_id) values($1,$2)",
        [alice, agent.id],
      );
    await db.query(
      "insert into memberships(project_id,agent_id) values($1,$2) on conflict(project_id,agent_id) do nothing",
      [alice, agents[0].id],
    );
    await assert.rejects(
      db.query("insert into memberships(project_id,agent_id) values($1,$2)", [
        alice,
        agents[10].id,
      ]),
    );
    assert.equal((await db.query("select * from memberships")).rows.length, 10);
    await db.exec(
      "reset role; update system_config set user_daily_limit=10,global_daily_limit=10;",
    );
    const ids = (
      await db.query<{ ids: string[] }>(
        "select reserve_usage($1,'text','model',10) as ids",
        [alice],
      )
    ).rows[0].ids;
    assert.equal(ids.length, 10);
    await assert.rejects(
      db.query("select reserve_usage($1,'text','model',11)", [bob]),
    );
    await assert.rejects(
      db.query("select reserve_usage($1,'text','model',1)", [bob]),
    );
    assert.equal((await db.query("select * from usage")).rows.length, 10);
    await db.query(
      "insert into requests(id,user_id,project_id) values($1,$1,$1)",
      [alice],
    );
    await db.query(
      "insert into messages(user_id,project_id,agent_id,role,content,request_id) values($1,$1,$2,'assistant','First',$1)",
      [alice, agents[0].id],
    );
    await assert.rejects(
      db.query(
        "insert into messages(user_id,project_id,agent_id,role,content,request_id) values($1,$1,$2,'assistant','Second',$1)",
        [alice, agents[0].id],
      ),
    );
  } finally {
    await db.close();
  }
});
