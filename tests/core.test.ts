import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, retrieve, citedSources } from "../src/lib/retrieval";
import { chatSchema, inScope } from "../src/lib/validation";
import { systemPrompt, boundedContext } from "../src/lib/ai";
import { nextRun } from "../src/lib/work";
import { presets } from "../src/lib/presets";
import type { Agent, Document, Message } from "../src/lib/types";
const id = "11111111-1111-4111-8111-111111111111";
test("roundtables are bounded, distinct, and cannot inject oversized prompts", () => {
  const input = { projectId: id, agentIds: [id], text: "Hello", requestId: id };
  assert.ok(chatSchema.safeParse(input).success);
  assert.equal(
    chatSchema.safeParse({ ...input, agentIds: [id, id] }).success,
    false,
  );
  assert.equal(
    chatSchema.safeParse({ ...input, agentIds: [id, id, id, id] }).success,
    false,
  );
  assert.equal(
    chatSchema.safeParse({ ...input, text: "x".repeat(12001) }).success,
    false,
  );
});
test("revoked, archived, and restricted agent scopes are enforced", () => {
  assert.ok(inScope({ archived: false, project_scope: [] }, id));
  assert.ok(!inScope({ archived: true, project_scope: [] }, id));
  assert.ok(!inScope({ archived: false, project_scope: ["other"] }, id));
});
test("retrieval ignores failed files and only attaches citations actually used", () => {
  const docs = [
    {
      id,
      name: "Launch plan",
      status: "ready",
      chunks: chunks("The launch budget is 4200 dollars. The owner is Mira."),
    },
    {
      id: "failed",
      name: "broken.pdf",
      status: "error",
      chunks: chunks("The launch budget is fake."),
    },
  ] as Document[];
  const sources = retrieve(docs, "What is the launch budget?");
  assert.equal(sources.length, 1);
  assert.ok(sources[0].snippet.includes("4200"));
  assert.equal(
    citedSources(`The budget is 4200 [${sources[0].id}]`, sources).length,
    1,
  );
  assert.equal(
    citedSources("The budget is 4200 [D:invented:1]", sources).length,
    0,
  );
  assert.throws(() => chunks("x".repeat(160001)));
});
test("personal memory is omitted when permission is revoked; personalities affect system input", () => {
  const agent = {
    ...presets[0],
    id,
    user_id: id,
    memories: "private violet",
    permissions: { ...presets[0].permissions, memory: false },
  } as Agent;
  assert.ok(!systemPrompt(agent).includes("private violet"));
  assert.ok(
    systemPrompt({
      ...agent,
      permissions: { ...agent.permissions, memory: true },
    }).includes("private violet"),
  );
  assert.notEqual(
    systemPrompt(agent),
    systemPrompt({ ...agent, ...presets[3] }),
  );
  assert.ok(
    systemPrompt(agent).includes(
      "Beliefs change perspective, never factual standards",
    ),
  );
  assert.ok(systemPrompt(agent).includes("untrusted data"));
});
test("history and evidence remain bounded and represented as data", () => {
  const messages = Array.from({ length: 100 }, () => ({
    role: "assistant",
    content: "x".repeat(6000),
  })) as Message[];
  const value = JSON.parse(boundedContext(messages, [], "hello"));
  assert.equal(value.recentConversation.length, 12);
  assert.equal(value.recentConversation[0].content.length, 2500);
});
test("scheduling honors timezone and rejects rapid or invalid schedules", () => {
  assert.equal(
    nextRun("0 9 * * *", "America/Phoenix", new Date("2026-10-02T08:00:00Z")),
    "2026-10-02T16:00:00.000Z",
  );
  assert.throws(() => nextRun("* * * * *", "UTC"));
  assert.throws(() => nextRun("0 9 * * *", "unknown"));
});
import { rankCatalog } from "../src/lib/music";
test("context and explicit feedback change real-metadata ranking; arbitrary catalog URLs are rejected", () => {
  const tracks = [
    {
      trackId: 1,
      trackName: "Fixture Pop",
      artistName: "Fixture Artist",
      trackViewUrl: "https://music.apple.com/us/album/1",
      primaryGenreName: "Pop",
    },
    {
      trackId: 2,
      trackName: "Fixture Classical",
      artistName: "Fixture Artist",
      trackViewUrl: "https://music.apple.com/us/album/2",
      primaryGenreName: "Classical",
    },
    {
      trackId: 3,
      trackName: "Invalid",
      artistName: "Fixture Artist",
      trackViewUrl: "javascript:alert(1)",
      primaryGenreName: "Classical",
    },
  ];
  assert.equal(rankCatalog(tracks, "working", "quiet rain", [])[0].trackId, 2);
  assert.equal(rankCatalog(tracks, "walking", "upbeat", [])[0].trackId, 1);
  assert.equal(
    rankCatalog(tracks, "working", "quiet", [
      { track_id: 2, context: "working", feedback: "wrong moment" },
    ])[0].trackId,
    1,
  );
  assert.ok(
    rankCatalog(tracks, "working", "", []).every((t) => t.trackId !== 3),
  );
});
