import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, retrieve, citedSources } from "../src/lib/retrieval";
import {
  chatSchema,
  inScope,
  agentSchema,
  agentConfigSchema,
  workflowSchema,
} from "../src/lib/validation";
import { systemPrompt, boundedContext, documentsForAgent } from "../src/lib/ai";
import { nextRun, runContributions } from "../src/lib/work";
import { presets } from "../src/lib/presets";
import type { Agent, Document, Message } from "../src/lib/types";
import { configured } from "../src/lib/supabase";
import { settingsPatchSchema } from "../src/lib/settings";
import { DEFAULT_MAP_PREFERENCES } from "../src/lib/map-data";
const id = "11111111-1111-4111-8111-111111111111";
test("partial scene and map preferences validate independently without accepting malformed locations", () => {
  assert.deepEqual(settingsPatchSchema.parse({ activeView: "map" }), {
    activeView: "map",
  });
  assert.deepEqual(
    settingsPatchSchema.parse({ backgroundScene: "network", catVisits: true }),
    { backgroundScene: "network", catVisits: true },
  );
  assert.ok(settingsPatchSchema.safeParse({ heroAgentId: null }).success);
  assert.ok(settingsPatchSchema.safeParse({ heroAgentId: "" }).success);
  assert.ok(
    !settingsPatchSchema.safeParse({ timezone: "unknown-zone" }).success,
  );
  assert.ok(!settingsPatchSchema.safeParse({ quietStart: "25:70" }).success);
  assert.ok(!settingsPatchSchema.safeParse({ owner: true }).success);
  const worldMap = {
    ...DEFAULT_MAP_PREFERENCES,
    mode: "history" as const,
    style: "dark" as const,
    places: [
      {
        id: "tucson",
        title: "My Tucson stop",
        city: "Tucson",
        country: "United States",
        lat: 32.2226,
        lon: -110.9747,
        category: "favorite" as const,
        note: "Return in spring.",
      },
    ],
  };
  const patch = settingsPatchSchema.parse({ worldMap });
  assert.equal(patch.worldMap?.places[0].lat, 32.2);
  assert.equal(patch.worldMap?.places[0].lon, -111);
  assert.ok(
    !settingsPatchSchema.safeParse({
      worldMap: { ...worldMap, date: "1916-02-30" },
    }).success,
  );
  assert.ok(
    !settingsPatchSchema.safeParse({
      worldMap: {
        ...worldMap,
        places: [...worldMap.places, ...worldMap.places],
      },
    }).success,
  );
  assert.ok(
    !settingsPatchSchema.safeParse({
      worldMap: { ...worldMap, places: [{ ...worldMap.places[0], lat: 91 }] },
    }).success,
  );
  assert.ok(
    !settingsPatchSchema.safeParse({
      worldMap: {
        ...worldMap,
        layers: { ...worldMap.layers, militaryTraffic: true },
      },
    }).success,
  );
  assert.ok(
    !settingsPatchSchema.safeParse({
      worldMap: {
        ...worldMap,
        places: Array.from({ length: 21 }, (_, i) => ({
          ...worldMap.places[0],
          id: `place-${i}`,
        })),
      },
    }).success,
  );
});
test("account availability requires a usable public URL and a browser-safe public key", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "proxy-secret-placeholder";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_fixture_public_key";
    assert.equal(configured(), false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
    assert.equal(configured(), true);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_secret_fixture_server_key";
    assert.equal(configured(), false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `fixture.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.fixture`;
    assert.equal(configured(), true);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `fixture.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.fixture`;
    assert.equal(configured(), false);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
test("roundtables are bounded, distinct, and cannot inject oversized prompts", () => {
  const input = { projectId: id, agentIds: [id], text: "Hello", requestId: id };
  assert.ok(chatSchema.safeParse(input).success);
  assert.equal(
    chatSchema.safeParse({ ...input, agentIds: [id, id] }).success,
    false,
  );
  assert.equal(
    chatSchema.safeParse({
      ...input,
      agentIds: Array.from(
        { length: 11 },
        (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      ),
    }).success,
    false,
  );
  assert.ok(
    chatSchema.safeParse({
      ...input,
      agentIds: Array.from(
        { length: 10 },
        (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      ),
    }).success,
  );
  assert.equal(
    chatSchema.safeParse({ ...input, text: "x".repeat(12001) }).success,
    false,
  );
});
test("ten contributions run at most three at once, preserve selection order, and isolate failures", async () => {
  let active = 0,
    maximum = 0;
  const invoked: number[] = [];
  const gates: (() => void)[] = [];
  const results = runContributions(
    10,
    new AbortController().signal,
    async (index) => {
      invoked.push(index);
      maximum = Math.max(maximum, ++active);
      await new Promise<void>((resolve) => {
        gates[index] = resolve;
      });
      active--;
      if (index === 4) throw new Error("One participant failed");
      return index;
    },
  );
  for (let offset = 0; offset < 10; offset += 3) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(invoked.length, Math.min(offset + 3, 10));
    for (let index = offset; index < Math.min(offset + 3, 10); index++)
      gates[index]();
  }
  const outcome = await results;
  assert.equal(maximum, 3);
  assert.deepEqual(
    invoked,
    Array.from({ length: 10 }, (_, index) => index),
  );
  assert.equal(outcome[4].status, "rejected");
  assert.deepEqual(
    outcome.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
    [0, 1, 2, 3, 5, 6, 7, 8, 9],
  );
  const cancelled = new AbortController();
  cancelled.abort();
  let calls = 0;
  const stopped = await runContributions(
    10,
    cancelled.signal,
    async () => ++calls,
  );
  assert.equal(calls, 0);
  assert.ok(stopped.every((result) => result.status === "rejected"));
});
test("character configuration is bounded guidance and selected files retain permission checks", () => {
  assert.deepEqual(agentSchema.parse(presets[0]).config, {});
  assert.ok(!agentConfigSchema.safeParse({ admin: true }).success);
  assert.ok(
    !agentConfigSchema.safeParse({
      examples: [{ prompt: "x", response: "x".repeat(1501) }],
    }).success,
  );
  assert.ok(!agentConfigSchema.safeParse({ document_ids: [id, id] }).success);
  const agent = {
    ...presets[0],
    id,
    user_id: id,
    config: {
      tools: ["send email"],
      examples: [
        {
          prompt: "How should I choose?",
          response: "Compare two options with evidence.",
        },
      ],
      document_ids: [id],
    },
  } as Agent;
  const prompt = systemPrompt(agent);
  assert.ok(prompt.includes("Compare two options with evidence."));
  assert.ok(prompt.includes("never grant execution or access"));
  assert.ok(prompt.includes("not model weight training"));
  const docs = [{ id }, { id: "other" }] as Document[];
  assert.deepEqual(
    documentsForAgent(agent, docs).map((doc) => doc.id),
    [id],
  );
  assert.deepEqual(
    documentsForAgent({ ...agent, config: { document_ids: [] } }, docs),
    [],
  );
  assert.deepEqual(documentsForAgent({ ...agent, config: {} }, docs), docs);
  assert.deepEqual(
    documentsForAgent(
      { ...agent, permissions: { ...agent.permissions, documents: false } },
      docs,
    ),
    [],
  );
  const workflow = {
    name: "Evidence check",
    kind: "text",
    enabled: true,
    steps: [
      { id, title: "Verify", instructions: "Check claims against citations." },
    ],
  };
  assert.ok(workflowSchema.safeParse(workflow).success);
  assert.ok(!workflowSchema.safeParse({ ...workflow, kind: "image" }).success);
  assert.ok(
    workflowSchema.safeParse({ ...workflow, kind: "image", enabled: false })
      .success,
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
