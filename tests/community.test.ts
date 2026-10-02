import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { suggestedProfiles } from "../src/lib/community-types";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const cara = "33333333-3333-4333-8333-333333333333";
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;`,
  );
  await db.exec(
    await readFile("supabase/migrations/202610020007_community.sql", "utf8"),
  );
  await db.exec(
    `insert into auth.users values('${alice}'),('${bob}'),('${cara}');`,
  );
  return db;
}
async function asUser(db: PGlite, user: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${user}';set role authenticated;`,
  );
}
async function createNetwork(db: PGlite, visibility = "private") {
  return (
    await db.query<{ id: string }>(
      "insert into community_networks(name,visibility) values('Builders',$1) returning id",
      [visibility],
    )
  ).rows[0].id;
}

test("network invitations require target acceptance; RLS and roles prevent joining and escalation", async () => {
  const db = await setup();
  try {
    await asUser(db, alice);
    const network = await createNetwork(db);
    assert.equal(
      (await db.query("select * from community_members")).rows.length,
      1,
    );
    const post = (
      await db.query<{ id: string }>(
        "insert into community_posts(network_id,content) values($1,'Private network thought') returning id",
        [network],
      )
    ).rows[0].id;
    await asUser(db, bob);
    assert.equal(
      (await db.query("select * from community_networks")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
    );
    await assert.rejects(db.query("select community_join($1)", [network]));
    await assert.rejects(
      db.query("select community_invite($1,$2,'member')", [network, cara]),
    );
    await assert.rejects(
      db.query(
        "insert into community_members(network_id,user_id,role) values($1,$2,'owner')",
        [network, bob],
      ),
    );
    await asUser(db, alice);
    const invitation = (
      await db.query<{ id: string }>(
        "insert into community_invitations(network_id,target_id) values($1,$2) returning id",
        [network, bob],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query("select community_accept_invitation($1,true)", [invitation]),
    );
    await asUser(db, bob);
    assert.equal(
      (await db.query("select * from community_networks")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
      "An invitation does not grant access to private posts",
    );
    await db.query("select community_accept_invitation($1,true)", [invitation]);
    assert.equal(
      (await db.query("select * from community_posts where id=$1", [post])).rows
        .length,
      1,
    );
    await db.query(
      "insert into community_posts(network_id,content) values($1,'Member reply')",
      [network],
    );
    await assert.rejects(
      db.query("select community_manage_member($1,$2,'moderator')", [
        network,
        bob,
      ]),
    );
    await asUser(db, alice);
    await db.query("select community_manage_member($1,$2,'moderator')", [
      network,
      bob,
    ]);
    await asUser(db, bob);
    await assert.rejects(
      db.query("select community_manage_member($1,$2,null)", [network, alice]),
    );
    await assert.rejects(
      db.query("select community_invite($1,$2,'moderator')", [network, cara]),
    );
    await assert.rejects(
      db.query(
        "insert into community_invitations(network_id,target_id,role) values($1,$2,'moderator')",
        [network, cara],
      ),
    );
    const memberInvitation = (
      await db.query<{ id: string }>(
        "insert into community_invitations(network_id,target_id) values($1,$2) returning id",
        [network, cara],
      )
    ).rows[0].id;
    await asUser(db, cara);
    await db.query("select community_accept_invitation($1,true)", [
      memberInvitation,
    ]);
    await asUser(db, bob);
    await db.query("select community_manage_member($1,$2,null)", [
      network,
      cara,
    ]);
    await asUser(db, cara);
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
    );
    await asUser(db, alice);
    assert.equal(
      Number(
        (
          await db.query<{ member_count: number }>(
            "select * from community_member_counts()",
          )
        ).rows[0].member_count,
      ),
      2,
    );
  } finally {
    await db.close();
  }
});

test("private feeds need accepted connections; discovery is opt-in and bookmarks stay private", async () => {
  const db = await setup();
  try {
    await asUser(db, alice);
    await db.exec(
      "insert into community_profiles(display_name,interests,discoverable) values('Alice',array['Design'],true)",
    );
    const post = (
      await db.query<{ id: string }>(
        "insert into community_posts(content,audience) values('For friends','connections') returning id",
      )
    ).rows[0].id;
    const privatePost = (
      await db.query<{ id: string }>(
        "insert into community_posts(content,audience) values('Only me','private') returning id",
      )
    ).rows[0].id;
    await asUser(db, bob);
    await db.exec("insert into community_profiles(display_name) values('Bob')");
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
    );
    const connection = (
      await db.query<{ id: string }>(
        "insert into community_connections(target_id) values($1) returning id",
        [alice],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query("select community_accept_connection($1,true)", [connection]),
    );
    await asUser(db, alice);
    await db.query("select community_accept_connection($1,true)", [connection]);
    await asUser(db, bob);
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("select * from community_posts where id=$1", [
          privatePost,
        ])
      ).rows.length,
      0,
    );
    await db.query(
      "insert into community_replies(post_id,content) values($1,'Actual reply')",
      [post],
    );
    await db.query(
      "insert into community_reactions(post_id,kind) values($1,'bookmark'),($1,'like')",
      [post],
    );
    await assert.rejects(
      db.exec(
        "insert into community_posts(content,audience) values('Anonymous discovery','public')",
      ),
    );
    await asUser(db, alice);
    assert.equal(
      (await db.query("select * from community_reactions")).rows.length,
      1,
      "A peer sees the like but not Bob's bookmark",
    );
    assert.equal(
      (await db.query("select * from community_profiles")).rows.length,
      1,
      "Opted-out Bob remains undiscoverable",
    );
    await asUser(db, cara);
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from community_replies")).rows.length,
      0,
    );
    await asUser(db, alice);
    await db.exec(
      "insert into community_posts(content,audience) values('A public thought','public')",
    );
    await asUser(db, cara);
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      1,
    );
    await asUser(db, alice);
    await db.exec("update community_profiles set discoverable=false");
    await asUser(db, cara);
    assert.equal(
      (await db.query("select * from community_posts")).rows.length,
      0,
      "Opting out removes discoverable personal posts from strangers' views",
    );
  } finally {
    await db.close();
  }
});

test("public networks join as members, private events and layout stay private, ownership is immutable", async () => {
  const db = await setup();
  try {
    await asUser(db, alice);
    const network = await createNetwork(db, "public");
    await db.query(
      "insert into community_events(title,starts_at) values('Private calendar',now()+interval '1 day')",
    );
    await db.query(
      'insert into community_layouts(view,panels) values(\'feed\',\'[{"id":"events","collapsed":true,"hidden":false}]\')',
    );
    await assert.rejects(
      db.query("update community_networks set owner_id=$1 where id=$2", [
        bob,
        network,
      ]),
    );
    await asUser(db, bob);
    await db.query("select community_join($1)", [network]);
    assert.equal(
      (
        await db.query<{ role: string }>(
          "select role from community_members where user_id=$1",
          [bob],
        )
      ).rows[0].role,
      "member",
    );
    assert.equal(
      (await db.query("select * from community_events")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from community_layouts")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into community_events(network_id,title,starts_at) values($1,'Member takeover',now())",
        [network],
      ),
    );
    await assert.rejects(
      db.query(
        "insert into community_resources(network_id,title,url) values($1,'Unapproved','https://example.com')",
        [network],
      ),
    );
    await asUser(db, alice);
    await db.query(
      "insert into community_resources(network_id,title,url) values($1,'Useful resource','https://example.com')",
      [network],
    );
    await asUser(db, bob);
    assert.equal(
      (await db.query("select * from community_resources")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

test("interest suggestions use only opted-in profiles and declared overlapping interests", () => {
  const own = {
    user_id: alice,
    display_name: "Alice",
    interests: ["Design", "Aviation"],
    bio: "",
    discoverable: true,
  };
  const profiles = [
    own,
    {
      ...own,
      user_id: bob,
      display_name: "Bob",
      interests: ["design"],
      discoverable: false,
    },
    {
      ...own,
      user_id: cara,
      display_name: "Cara",
      interests: ["Design", "aviation"],
    },
  ];
  assert.deepEqual(
    suggestedProfiles(profiles, own).map((p) => p.user_id),
    [cara],
  );
  assert.equal(
    suggestedProfiles(profiles, { ...own, discoverable: false }).length,
    0,
  );
  assert.equal(suggestedProfiles(profiles, own, [cara]).length, 0);
});

test("renewed invitations still need target acceptance and moderators cannot forge event authors", async () => {
  const db = await setup();
  try {
    await asUser(db, alice);
    const network = await createNetwork(db);
    const invite = (
      await db.query<{ id: string }>(
        "select (community_invite($1,$2,'moderator')).*",
        [network, bob],
      )
    ).rows[0].id;
    await asUser(db, bob);
    await db.query("select community_accept_invitation($1,false)", [invite]);
    assert.equal(
      (await db.query("select * from community_members")).rows.length,
      0,
    );
    await asUser(db, alice);
    const renewed = (
      await db.query<{ id: string }>(
        "select (community_invite($1,$2,'moderator')).*",
        [network, bob],
      )
    ).rows[0].id;
    assert.equal(renewed, invite);
    const event = (
      await db.query<{ id: string }>(
        "insert into community_events(network_id,title,starts_at) values($1,'An actual event',now()+interval '1 day') returning id",
        [network],
      )
    ).rows[0].id;
    await asUser(db, bob);
    await db.query("select community_accept_invitation($1,true)", [invite]);
    assert.equal(
      (
        await db.query(
          "update community_events set title='Updated by moderator' where id=$1 returning id",
          [event],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update community_events set user_id=$1 where id=$2", [
        bob,
        event,
      ]),
    );
    await assert.rejects(
      db.query("select community_invite($1,$2,null)", [network, cara]),
    );
    await db.query("select community_manage_member($1,$2,null)", [
      network,
      bob,
    ]);
    assert.equal(
      (await db.query("select * from community_events")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
