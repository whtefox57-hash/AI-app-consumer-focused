import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPreviewApi,
  PREVIEW_STORAGE_KEY,
  type PreviewFiles,
  type PreviewStorage,
} from "../src/lib/preview-store";
import type {
  Agent,
  Boot,
  Document,
  Message,
  Project,
  Workflow,
  Job,
} from "../src/lib/types";
import type { CommunityBoot, CommunityPost } from "../src/lib/community-types";
import { DEFAULT_MAP_PREFERENCES } from "../src/lib/map-data";

function fixture() {
  const records = new Map<string, string>();
  const blobs = new Map<string, Blob>();
  const revoked: string[] = [];
  let sequence = 1;
  const uuid = () =>
    `ca570000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const storage: PreviewStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
    removeItem: (key) => {
      records.delete(key);
    },
  };
  const files: PreviewFiles = {
    put: async (path, blob) => {
      blobs.set(path, blob);
    },
    get: async (path) => blobs.get(path),
    remove: async (path) => {
      blobs.delete(path);
    },
    clear: async () => {
      blobs.clear();
    },
  };
  const dependencies = {
    storage,
    files,
    uuid,
    now: () => new Date("2026-10-02T20:00:00Z"),
    objectUrl: () => `blob:preview-${sequence++}`,
    revokeObjectUrl: (url: string) => {
      revoked.push(url);
    },
  };
  return {
    records,
    blobs,
    revoked,
    dependencies,
    api: createPreviewApi(dependencies),
    uuid,
  };
}
const json = (value: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(value),
});
const agentInput = ({ id: _id, user_id: _user, ...value }: Agent) => value;

test("preview saves genuine edits and selections across new clients, seeds only once, and preserves settings from concurrent views", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const original = await api<Boot>("boot");
  assert.equal(original.agents.length, 6);
  assert.equal(original.projects.length, 1);
  assert.equal(original.messages.length, 0);
  assert.ok(
    Object.entries(original.capabilities)
      .filter(([, value]) => typeof value === "boolean")
      .every(([, value]) => value === false),
  );
  const project = await api<Project>(
    "projects",
    json({ name: "Test project", summary: "Actual personal note" }),
  );
  await Promise.all([
    api("settings", json({ timezone: "Europe/Paris" }, "PATCH")),
    api("selection", json({ projectId: project.id })),
    api("settings", json({ quietStart: "21:15" }, "PATCH")),
  ]);
  const newClient = createPreviewApi(fixtureValue.dependencies);
  const persisted = await newClient<Boot>("boot");
  assert.equal(persisted.user.id, original.user.id);
  assert.equal(persisted.projects.length, 2);
  assert.equal(persisted.profile.settings.timezone, "Europe/Paris");
  assert.equal(persisted.profile.settings.activeProjectId, project.id);
  assert.equal(persisted.profile.settings.quietStart, "21:15");
  for (const agent of persisted.agents)
    await newClient(`agents/${agent.id}`, { method: "DELETE" });
  await newClient("seed", { method: "POST" });
  assert.equal(
    (await createPreviewApi(fixtureValue.dependencies)<Boot>("boot")).agents
      .length,
    0,
  );
});

test("preview rejects real generation and auth services, stores only the user's text, and enforces participant membership, scope and idempotency", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const boot = await api<Boot>("boot");
  const project = boot.projects[0];
  const agent = boot.agents[0];
  const input = {
    projectId: project.id,
    text: "My genuine test message",
    requestId: fixtureValue.uuid(),
    agentIds: [agent.id],
  };
  const message = await api<Message>("preview-message", json(input));
  assert.equal(message.role, "user");
  assert.equal(message.content, input.text);
  assert.equal(
    (await api<Message>("preview-message", json(input))).id,
    message.id,
  );
  await assert.rejects(
    api("preview-message", json({ ...input, text: "Changed content" })),
    /already used/,
  );
  await assert.rejects(
    api(
      "preview-message",
      json({
        ...input,
        requestId: fixtureValue.uuid(),
        agentIds: [agent.id, agent.id],
      }),
    ),
    /Duplicate participants/,
  );
  await assert.rejects(
    api(
      "preview-message",
      json({
        ...input,
        requestId: fixtureValue.uuid(),
        agentIds: [boot.agents[1].id],
      }),
    ),
    /Invite this agent/,
  );
  for (const service of [
    "chat",
    "speech/transcribe",
    "summarize",
    "music",
    "owner",
    "cron",
  ])
    await assert.rejects(api(service, json(input)), /not connected/);
  const other = await api<Project>("projects", json({ name: "Other project" }));
  await api(
    `agents/${agent.id}`,
    json({ ...agentInput(agent), project_scope: [other.id] }, "PATCH"),
  );
  await assert.rejects(
    api("preview-message", json({ ...input, requestId: fixtureValue.uuid() })),
    /restricted/,
  );
  const current = await api<Boot>("boot");
  assert.equal(current.messages.length, 1);
  assert.equal(current.messages[0].role, "user");
  assert.deepEqual(current.usage, []);
  assert.deepEqual(current.inbox, []);
  await api(`projects/${other.id}`, { method: "DELETE" });
  await assert.rejects(
    api("memberships", json({ project_id: project.id, agent_id: agent.id })),
    /restricted/,
  );
});

test("preview enforces ten participants and enabled text workflow references, applies once and removes deleted references", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const boot = await api<Boot>("boot");
  const project = boot.projects[0];
  for (let index = 1; index < 10; index++) {
    const agent = await api<Agent>(
      "agents",
      json({ ...agentInput(boot.agents[0]), name: `Extra ${index}` }),
    );
    await api(
      "memberships",
      json({ project_id: project.id, agent_id: agent.id }),
    );
  }
  await assert.rejects(
    api(
      "memberships",
      json({ project_id: project.id, agent_id: boot.agents[1].id }),
    ),
    /ten/,
  );
  const workflow = await api<Workflow>(
    "workflows",
    json({
      name: "Review",
      kind: "text",
      steps: [
        {
          id: fixtureValue.uuid(),
          title: "Read",
          instructions: "Read the supplied document.",
        },
      ],
      enabled: true,
    }),
  );
  assert.deepEqual(
    await api(
      `workflows/${workflow.id}/apply`,
      json({ applyToAll: false, agentIds: [boot.agents[0].id] }),
    ),
    { updated: 1 },
  );
  assert.deepEqual(
    await api(
      `workflows/${workflow.id}/apply`,
      json({ applyToAll: false, agentIds: [boot.agents[0].id] }),
    ),
    { updated: 0 },
  );
  const disabled = await api<Workflow>(
    "workflows",
    json({
      name: "Image idea",
      kind: "image",
      steps: [
        {
          id: fixtureValue.uuid(),
          title: "Scene",
          instructions: "Describe a room.",
        },
      ],
      enabled: false,
    }),
  );
  await assert.rejects(
    api(`workflows/${disabled.id}/apply`, json({ applyToAll: true })),
    /enabled text/,
  );
  await api(`workflows/${workflow.id}`, { method: "DELETE" });
  assert.deepEqual(
    (await api<Boot>("boot")).agents[0].config?.workflow_ids,
    [],
  );
  await assert.rejects(
    api(
      "agents",
      json({
        ...agentInput(boot.agents[0]),
        config: { document_ids: [fixtureValue.uuid()] },
      }),
    ),
    /unavailable/,
  );
});

test("original files persist, TXT extraction is real, PDF extraction is honestly unavailable, and deletion revokes object links", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const boot = await api<Boot>("boot");
  const projectId = boot.projects[0].id;
  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "document");
    form.set("projectId", projectId);
    return api<{ id: string }>("files", { method: "POST", body: form });
  }
  const saved = await upload(
    new File(["The actual budget is $4200. Owner: Mira."], "plan.txt", {
      type: "text/plain",
    }),
  );
  const pdf = await upload(
    new File(["%PDF-1.4\nsynthetic test bytes"], "test.pdf", {
      type: "application/pdf",
    }),
  );
  const refreshed = await createPreviewApi(fixtureValue.dependencies)<Boot>(
    "boot",
  );
  const txt = refreshed.documents.find((document) => document.id === saved.id)!;
  assert.equal(txt.status, "ready");
  assert.equal(txt.chunks[0].text, "The actual budget is $4200. Owner: Mira.");
  const unsupported = refreshed.documents.find(
    (document) => document.id === pdf.id,
  )!;
  assert.equal(unsupported.status, "unsupported-in-preview");
  assert.equal(unsupported.chunks.length, 0);
  assert.match(unsupported.error!, /no text was invented/);
  const download = await api<{ url: string }>(
    `files?path=${encodeURIComponent(txt.storage_path!)}`,
  );
  assert.ok(download.url.startsWith("blob:"));
  assert.equal(
    await fixtureValue.blobs.get(txt.storage_path!)?.text(),
    txt.chunks[0].text,
  );
  const exported = await api<{
    data: { documents: Document[] };
    files: { path: string; signedUrl: string }[];
    fileLinksExpireAt: null;
  }>("export");
  assert.equal(exported.data.documents.length, 2);
  assert.equal(exported.files.length, 2);
  assert.equal(exported.fileLinksExpireAt, null);
  await api(`documents/${txt.id}`, { method: "DELETE" });
  assert.ok(fixtureValue.revoked.includes(download.url));
  assert.equal(fixtureValue.blobs.has(txt.storage_path!), false);
  await assert.rejects(
    api(`files?path=${encodeURIComponent(txt.storage_path!)}`),
    /unavailable/,
  );
  await assert.rejects(
    upload(new File([new Uint8Array(5242881)], "oversized.txt")),
    /5 MB/,
  );
});

test("schedules stay disabled with no fabricated runs, community contains only genuine saved records, and account reset leaves production keys intact", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const boot = await api<Boot>("boot");
  fixtureValue.records.set("sb-real-project-auth-token", "unchanged");
  const job = await api<Job>(
    "jobs",
    json({
      title: "Real draft",
      kind: "reminder",
      project_id: boot.projects[0].id,
      agent_id: null,
      topic: "Think about tomorrow",
      cron: "0 9 * * *",
      timezone: "America/Phoenix",
      enabled: true,
      notify: true,
      allowance: 1,
    }),
  );
  assert.equal(job.enabled, false);
  assert.equal(job.notify, false);
  assert.match(job.last_error!, /unavailable/);
  assert.deepEqual(await api("history"), []);
  const community = await api<CommunityBoot>("community/boot");
  assert.equal(community.profiles.length, 1);
  assert.equal(community.posts.length, 0);
  assert.equal(community.networks.length, 0);
  assert.equal(community.suggestions.length, 0);
  const post = await api<CommunityPost>(
    "community/posts",
    json({ network_id: null, content: "My actual post", audience: "private" }),
  );
  await api(
    "community/reactions",
    json({ post_id: post.id, kind: "bookmark", active: true }),
  );
  const restored = await createPreviewApi(
    fixtureValue.dependencies,
  )<CommunityBoot>("community/boot");
  assert.equal(restored.posts[0].content, "My actual post");
  assert.equal(restored.reactions[0].kind, "bookmark");
  assert.equal(restored.profiles.length, 1);
  await assert.rejects(
    api("community/connections", json({ target_id: fixtureValue.uuid() })),
    /requires the connected application/,
  );
  await assert.rejects(
    api("account", json({ confirmation: "wrong" }, "DELETE")),
  );
  await api("account", json({ confirmation: "DELETE" }, "DELETE"));
  assert.equal(fixtureValue.records.has(PREVIEW_STORAGE_KEY), false);
  assert.equal(
    fixtureValue.records.get("sb-real-project-auth-token"),
    "unchanged",
  );
  const reset = await api<Boot>("boot");
  assert.equal(reset.jobs.length, 0);
  assert.equal(reset.agents.length, 6);
  assert.equal((await api<CommunityBoot>("community/boot")).posts.length, 0);
});

test("failed browser writes surface an error without reporting unsaved edits as durable", async () => {
  const fixtureValue = fixture();
  const api = fixtureValue.api;
  const original = await api<Boot>("boot");
  fixtureValue.dependencies.storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  await assert.rejects(
    api("projects", json({ name: "Cannot save" })),
    /could not save/,
  );
  assert.equal(
    (await createPreviewApi(fixtureValue.dependencies)<Boot>("boot")).projects
      .length,
    original.projects.length,
  );
});

test("scene and map settings merge with other views, and custom background export/reset touches only the preview owner", async () => {
  const fixtureValue = fixture();
  const backgrounds = new Map<
    string,
    { blob: Blob; name: string; type: "image" }
  >();
  backgrounds.set("unrelated-user", {
    blob: new Blob(["other original"]),
    name: "other.png",
    type: "image",
  });
  const api = createPreviewApi({
    ...fixtureValue.dependencies,
    backgrounds: {
      get: async (owner) => backgrounds.get(owner),
      remove: async (owner) => {
        backgrounds.delete(owner);
      },
    },
  });
  const boot = await api<Boot>("boot");
  backgrounds.set(boot.user.id, {
    blob: new Blob(["preview original"], { type: "image/png" }),
    name: "background.png",
    type: "image",
  });
  await Promise.all([
    api(
      "settings",
      json(
        {
          activeView: "map",
          worldMap: { ...DEFAULT_MAP_PREFERENCES, style: "dark" },
        },
        "PATCH",
      ),
    ),
    api(
      "settings",
      json(
        {
          backgroundScene: "custom",
          heroCharacter: "agent",
          heroAgentId: boot.agents[0].id,
          catVisits: false,
        },
        "PATCH",
      ),
    ),
  ]);
  const persisted = await api<Boot>("boot");
  assert.equal(persisted.profile.settings.activeView, "map");
  assert.equal(persisted.profile.settings.backgroundScene, "custom");
  assert.equal(
    (persisted.profile.settings.worldMap as { style: string }).style,
    "dark",
  );
  await assert.rejects(
    api("settings", json({ heroAgentId: fixtureValue.uuid() }, "PATCH")),
    /unavailable/,
  );
  await assert.rejects(
    api(
      "settings",
      json(
        {
          worldMap: {
            ...DEFAULT_MAP_PREFERENCES,
            places: Array(21).fill({ id: "duplicate" }),
          },
        },
        "PATCH",
      ),
    ),
  );
  const exported = await api<{ files: { name: string; signedUrl: string }[] }>(
    "export",
  );
  assert.equal(exported.files.length, 1);
  assert.equal(exported.files[0].name, "background.png");
  assert.ok(exported.files[0].signedUrl.startsWith("blob:"));
  await api("account", json({ confirmation: "DELETE" }, "DELETE"));
  assert.equal(backgrounds.has(boot.user.id), false);
  assert.equal(backgrounds.has("unrelated-user"), true);
});
