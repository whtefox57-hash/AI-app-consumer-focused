import { z } from "zod";
import { CronExpressionParser } from "cron-parser";
import { presets } from "./presets";
import { chunks } from "./retrieval";
import { settingsPatchSchema } from "./settings";
import {
  getBackground,
  removeBackground,
  type CustomBackground,
} from "./background-store";
import {
  agentSchema,
  projectSchema,
  jobSchema,
  workflowSchema,
  applyWorkflowSchema,
  id,
  inScope,
} from "./validation";
import {
  communityPanels,
  type CommunityBoot,
  type CommunityNetwork,
  type CommunityProfile,
} from "./community-types";
import type { Agent, Boot, Document, Job, Message, Workflow } from "./types";
import { isTemporaryPreview } from "./preview-mode";

export const PREVIEW_STORAGE_KEY = "cast.design-preview.v1";
const PREVIEW_DATABASE = "cast-design-preview-files-v1";
const USER_ID = "ca570000-0000-4000-8000-000000000001";
type FileRecord = { path: string; name: string; type: string; size: number };
type PreviewState = {
  version: 1;
  boot: Boot;
  community: CommunityBoot;
  files: FileRecord[];
};
export type PreviewStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export type PreviewFiles = {
  put: (path: string, blob: Blob) => Promise<void>;
  get: (path: string) => Promise<Blob | undefined>;
  remove: (path: string) => Promise<void>;
  clear: () => Promise<void>;
};
export type PreviewDependencies = {
  storage: PreviewStorage;
  files: PreviewFiles;
  uuid?: () => string;
  now?: () => Date;
  objectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  backgrounds?: {
    get: (owner: string) => Promise<CustomBackground | undefined>;
    remove: (owner: string) => Promise<unknown>;
  };
};

function initialState(uuid: () => string): PreviewState {
  const projectId = uuid();
  const agents = presets.map((preset) => ({
    ...structuredClone(preset),
    id: uuid(),
    user_id: USER_ID,
    config: {},
  })) as Agent[];
  const profile: CommunityProfile = {
    user_id: USER_ID,
    display_name: "You",
    bio: "",
    interests: [],
    discoverable: false,
  };
  return {
    version: 1,
    boot: {
      user: { id: USER_ID, email: "Design preview" },
      agents,
      workflows: [],
      projects: [
        { id: projectId, name: "First thoughts", archived: false, summary: "" },
      ],
      memberships: [{ project_id: projectId, agent_id: agents[0].id }],
      messages: [],
      documents: [],
      jobs: [],
      inbox: [],
      usage: [],
      profile: {
        settings: {
          onboarded: true,
          timezone: "America/Phoenix",
          quietStart: "22:00",
          quietEnd: "08:00",
          activeProjectId: projectId,
        },
      },
      capabilities: {
        ai: false,
        speech: false,
        search: false,
        music: false,
        owner: false,
        model: "Not connected",
        strongModel: "Not connected",
        strong: false,
      },
    },
    community: {
      profile,
      profiles: [profile],
      networks: [],
      members: [],
      posts: [],
      replies: [],
      reactions: [],
      invitations: [],
      connections: [],
      events: [],
      resources: [],
      layouts: [],
      suggestions: [],
    },
    files: [],
  };
}

function body(options: RequestInit): unknown {
  if (typeof options.body !== "string")
    throw new Error("This action requires JSON data.");
  if (new TextEncoder().encode(options.body).length > 50000)
    throw new Error("This request is too large.");
  try {
    return JSON.parse(options.body);
  } catch {
    throw new Error("This action requires valid JSON data.");
  }
}
function must<T extends { id: string }>(
  records: T[],
  target: string,
  label: string,
): T {
  const value = records.find((record) => record.id === id.parse(target));
  if (!value) throw new Error(`${label} is unavailable in this preview.`);
  return value;
}
const short = (max: number) => z.string().trim().min(1).max(max);
const https = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2000)
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Use an HTTPS address.",
    ),
]);

/** Explicit, browser-only design preview. No fetch, authentication or model client exists here. */
export function createPreviewApi(dependencies: PreviewDependencies) {
  const { storage, files } = dependencies;
  const uuid = dependencies.uuid ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const objectUrl =
    dependencies.objectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl =
    dependencies.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const temporaryUrls = new Set<string>();
  const fileUrls = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  const save = (state: PreviewState) => {
    try {
      storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(state));
    } catch {
      throw new Error(
        "Your browser could not save this preview. Free browser storage and try again; the change was not saved.",
      );
    }
  };
  function load(): PreviewState {
    let raw: string | null;
    try {
      raw = storage.getItem(PREVIEW_STORAGE_KEY);
    } catch {
      throw new Error(
        "Browser storage is unavailable. Enable storage for this site to use the design preview.",
      );
    }
    if (!raw) {
      const state = initialState(uuid);
      save(state);
      return state;
    }
    try {
      const state = JSON.parse(raw) as PreviewState;
      if (
        state.version !== 1 ||
        typeof state.boot?.user?.id !== "string" ||
        !state.boot?.profile?.settings ||
        !state.boot?.capabilities ||
        !Array.isArray(state.boot?.agents) ||
        !Array.isArray(state.boot?.projects) ||
        ![
          "memberships",
          "messages",
          "documents",
          "jobs",
          "inbox",
          "usage",
        ].every((key) => Array.isArray(state.boot[key as keyof Boot])) ||
        !state.community ||
        ![
          "profiles",
          "networks",
          "members",
          "posts",
          "replies",
          "reactions",
          "invitations",
          "connections",
          "events",
          "resources",
          "layouts",
          "suggestions",
        ].every((key) =>
          Array.isArray(state.community[key as keyof CommunityBoot]),
        ) ||
        !Array.isArray(state.files)
      )
        throw new Error();
      return state;
    } catch {
      throw new Error(
        "The saved preview could not be read. Open a temporary preview to keep exploring without changing your saved data.",
      );
    }
  }
  function urlFor(blob: Blob, path: string) {
    const existing = fileUrls.get(path);
    if (existing) return existing;
    const url = objectUrl(blob);
    temporaryUrls.add(url);
    fileUrls.set(path, url);
    return url;
  }
  async function removeFiles(state: PreviewState, paths: string[]) {
    for (const path of paths) {
      await files.remove(path);
      const url = fileUrls.get(path);
      if (url) {
        revokeObjectUrl(url);
        temporaryUrls.delete(url);
        fileUrls.delete(path);
      }
    }
    state.files = state.files.filter((file) => !paths.includes(file.path));
  }
  function checkAgentReferences(
    state: PreviewState,
    agent: z.infer<typeof agentSchema>,
  ) {
    for (const projectId of agent.project_scope)
      must(state.boot.projects, projectId, "Project");
    for (const documentId of agent.config.document_ids ?? [])
      must(state.boot.documents, documentId, "Document");
    for (const workflowId of agent.config.workflow_ids ?? []) {
      const workflow = must(state.boot.workflows ?? [], workflowId, "Workflow");
      if (workflow.kind !== "text" || !workflow.enabled)
        throw new Error("Choose an enabled text workflow from your library.");
    }
    if (
      agent.avatar.startsWith(`${USER_ID}/`) &&
      !state.files.some(
        (file) => file.path === agent.avatar && file.path.includes("/avatars/"),
      )
    )
      throw new Error("This avatar file is unavailable.");
    if (agent.avatar.includes("/") && !agent.avatar.startsWith(`${USER_ID}/`))
      throw new Error("Choose an avatar from this preview's files.");
  }
  function checkMembership(
    state: PreviewState,
    projectId: string,
    agentId: string,
  ) {
    const project = must(state.boot.projects, projectId, "Project");
    const agent = must(state.boot.agents, agentId, "Agent");
    if (project.archived || !inScope(agent, project.id))
      throw new Error(
        "This agent is archived or restricted to another project.",
      );
  }
  const timestamp = () => now().toISOString();

  async function execute(path: string, options: RequestInit): Promise<unknown> {
    if (options.signal?.aborted)
      throw new DOMException("The request was cancelled.", "AbortError");
    const method = (options.method ?? "GET").toUpperCase();
    const url = new URL(
      path.replace(/^\/api\//, ""),
      "https://preview.invalid/",
    );
    const segments = url.pathname.split("/").filter(Boolean);
    const [resource, target] = segments;
    const state = load();
    const boot = state.boot;
    if (resource === "boot" && method === "GET")
      return structuredClone({
        ...boot,
        messages: [...boot.messages]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 100),
      });
    if (resource === "seed" && method === "POST") return { ok: true };
    if (resource === "health" && method === "GET")
      return {
        ok: true,
        preview: true,
        ai: false,
        speech: false,
        search: false,
        music: false,
      };
    if (
      [
        "chat",
        "speech",
        "summarize",
        "music",
        "music-feedback",
        "owner",
        "cron",
      ].includes(resource)
    )
      throw new Error(
        "This service is not connected in the design preview. No generated result was created.",
      );
    if (resource === "cancel" && method === "POST") return { ok: true };

    if (resource === "agents") {
      if (method === "POST" || method === "PATCH") {
        const value = agentSchema.parse(body(options));
        checkAgentReferences(state, value);
        const existing =
          method === "PATCH" ? must(boot.agents, target, "Agent") : null;
        if (!existing && boot.agents.length >= 500)
          throw new Error("Your cast supports up to 500 agents.");
        const record: Agent = {
          ...value,
          id: existing?.id ?? uuid(),
          user_id: USER_ID,
        };
        boot.agents = existing
          ? boot.agents.map((agent) =>
              agent.id === existing.id ? record : agent,
            )
          : [...boot.agents, record];
        save(state);
        return record;
      }
      if (method === "DELETE") {
        const agent = must(boot.agents, target, "Agent");
        boot.agents = boot.agents.filter((record) => record.id !== agent.id);
        boot.memberships = boot.memberships.filter(
          (record) => record.agent_id !== agent.id,
        );
        boot.messages = boot.messages.map((message) =>
          message.agent_id === agent.id
            ? { ...message, agent_id: null }
            : message,
        );
        boot.jobs = boot.jobs.map((job) =>
          job.agent_id === agent.id
            ? { ...job, agent_id: null, enabled: false }
            : job,
        );
        if (
          agent.avatar.startsWith(`${USER_ID}/`) &&
          !boot.agents.some((record) => record.avatar === agent.avatar)
        )
          await removeFiles(state, [agent.avatar]);
        save(state);
        return { ok: true };
      }
    }
    if (resource === "projects") {
      if (method === "POST" || method === "PATCH") {
        const value = projectSchema.parse(body(options));
        const existing =
          method === "PATCH" ? must(boot.projects, target, "Project") : null;
        if (!existing && boot.projects.length >= 100)
          throw new Error("Your workspace supports up to 100 projects.");
        const record = { ...value, id: existing?.id ?? uuid() };
        boot.projects = existing
          ? boot.projects.map((project) =>
              project.id === existing.id ? record : project,
            )
          : [...boot.projects, record];
        save(state);
        return record;
      }
      if (method === "DELETE") {
        const project = must(boot.projects, target, "Project");
        await removeFiles(
          state,
          boot.documents
            .filter((document) => document.project_id === project.id)
            .map((document) => document.storage_path)
            .filter((path): path is string => Boolean(path)),
        );
        boot.projects = boot.projects.filter(
          (record) => record.id !== project.id,
        );
        boot.memberships = boot.memberships.filter(
          (record) => record.project_id !== project.id,
        );
        boot.messages = boot.messages.filter(
          (record) => record.project_id !== project.id,
        );
        const removedDocuments = boot.documents
          .filter((record) => record.project_id === project.id)
          .map((record) => record.id);
        boot.documents = boot.documents.filter(
          (record) => record.project_id !== project.id,
        );
        const removedJobs = boot.jobs
          .filter((record) => record.project_id === project.id)
          .map((record) => record.id);
        boot.jobs = boot.jobs.filter(
          (record) => record.project_id !== project.id,
        );
        boot.inbox = boot.inbox.filter(
          (record) => !removedJobs.includes(record.job_id),
        );
        boot.agents = boot.agents.map((agent) => ({
          ...agent,
          config: {
            ...agent.config,
            document_ids: agent.config?.document_ids?.filter(
              (documentId) => !removedDocuments.includes(documentId),
            ),
          },
        }));
        if (boot.profile.settings.activeProjectId === project.id)
          boot.profile.settings.activeProjectId =
            boot.projects.find((record) => !record.archived)?.id ?? "";
        save(state);
        return { ok: true };
      }
    }
    if (
      resource === "memberships" &&
      (method === "POST" || method === "DELETE")
    ) {
      const value = z
        .object({ project_id: id, agent_id: id })
        .parse(body(options));
      if (method === "POST") {
        checkMembership(state, value.project_id, value.agent_id);
        if (
          !boot.memberships.some(
            (record) =>
              record.project_id === value.project_id &&
              record.agent_id === value.agent_id,
          )
        ) {
          if (
            boot.memberships.filter(
              (record) => record.project_id === value.project_id,
            ).length >= 10
          )
            throw new Error(
              "A project supports up to ten participating agents.",
            );
          boot.memberships.push(value);
        }
      } else
        boot.memberships = boot.memberships.filter(
          (record) =>
            record.project_id !== value.project_id ||
            record.agent_id !== value.agent_id,
        );
      save(state);
      return { ok: true };
    }
    if (resource === "messages" && method === "GET") {
      const projectId = id.parse(url.searchParams.get("projectId"));
      must(boot.projects, projectId, "Project");
      const before = url.searchParams.get("before");
      if (before) z.iso.datetime({ offset: true }).parse(before);
      return boot.messages
        .filter(
          (message) =>
            message.project_id === projectId &&
            (!before || message.created_at < before),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 100);
    }
    if (resource === "preview-message" && method === "POST") {
      const value = z
        .object({
          projectId: id,
          text: z.string().trim().min(1).max(12000),
          requestId: id,
          agentIds: z.array(id).max(10).default([]),
        })
        .refine(
          (input) => new Set(input.agentIds).size === input.agentIds.length,
          "Duplicate participants",
        )
        .parse(body(options));
      const project = must(boot.projects, value.projectId, "Project");
      if (project.archived)
        throw new Error("Restore this project before adding a message.");
      for (const agentId of value.agentIds) {
        checkMembership(state, project.id, agentId);
        if (
          !boot.memberships.some(
            (member) =>
              member.project_id === project.id && member.agent_id === agentId,
          )
        )
          throw new Error("Invite this agent to the project first.");
      }
      const existing = boot.messages.find(
        (message) => message.request_id === value.requestId,
      );
      if (existing) {
        if (
          existing.project_id !== value.projectId ||
          existing.content !== value.text
        )
          throw new Error(
            "This request identifier was already used for another message.",
          );
        return existing;
      }
      const message: Message = {
        id: uuid(),
        project_id: project.id,
        agent_id: null,
        role: "user",
        content: value.text,
        sources: [],
        created_at: timestamp(),
        request_id: value.requestId,
      };
      boot.messages.push(message);
      save(state);
      return message;
    }
    if (resource === "selection" && method === "POST") {
      const value = z.object({ projectId: id }).parse(body(options));
      must(boot.projects, value.projectId, "Project");
      boot.profile.settings = {
        ...boot.profile.settings,
        activeProjectId: value.projectId,
      };
      save(state);
      return { ok: true };
    }
    if (resource === "settings" && method === "PATCH") {
      const value = settingsPatchSchema.parse(body(options));
      if (value.heroAgentId) must(boot.agents, value.heroAgentId, "Agent");
      boot.profile.settings = { ...boot.profile.settings, ...value };
      save(state);
      return { ok: true };
    }
    if (resource === "workflows") {
      const workflows = boot.workflows ?? (boot.workflows = []);
      if (method === "GET") return workflows;
      if (method === "POST" && segments[2] === "apply") {
        const value = applyWorkflowSchema.parse(body(options));
        const workflow = must(workflows, target, "Workflow");
        if (workflow.kind !== "text" || !workflow.enabled)
          throw new Error("Choose an enabled text workflow.");
        const selected = value.applyToAll
          ? boot.agents.filter((agent) => !agent.archived)
          : value.agentIds.map((agentId) =>
              must(boot.agents, agentId, "Agent"),
            );
        if (selected.some((agent) => agent.archived))
          throw new Error(
            "Restore archived agents before applying a workflow.",
          );
        let updated = 0;
        for (const agent of selected) {
          const current = agent.config?.workflow_ids ?? [];
          if (!current.includes(workflow.id)) {
            if (current.length >= 20)
              throw new Error("Each agent supports up to 20 workflows.");
            agent.config = {
              ...agent.config,
              workflow_ids: [...current, workflow.id],
            };
            updated++;
          }
        }
        save(state);
        return { updated };
      }
      if (method === "POST" || method === "PATCH") {
        const value = workflowSchema.parse(body(options));
        const existing =
          method === "PATCH" ? must(workflows, target, "Workflow") : null;
        if (!existing && workflows.length >= 100)
          throw new Error("Your library supports up to 100 workflows.");
        const record: Workflow = {
          ...value,
          id: existing?.id ?? uuid(),
          user_id: USER_ID,
          created_at: existing?.created_at ?? timestamp(),
          updated_at: timestamp(),
        };
        boot.workflows = existing
          ? workflows.map((workflow) =>
              workflow.id === existing.id ? record : workflow,
            )
          : [...workflows, record];
        save(state);
        return record;
      }
      if (method === "DELETE") {
        const workflow = must(workflows, target, "Workflow");
        boot.workflows = workflows.filter(
          (record) => record.id !== workflow.id,
        );
        boot.agents = boot.agents.map((agent) => ({
          ...agent,
          config: {
            ...agent.config,
            workflow_ids: agent.config?.workflow_ids?.filter(
              (workflowId) => workflowId !== workflow.id,
            ),
          },
        }));
        save(state);
        return { ok: true };
      }
    }
    if (resource === "notes" && method === "POST") {
      const value = z
        .object({ projectId: id, title: short(200), text: short(20000) })
        .parse(body(options));
      must(boot.projects, value.projectId, "Project");
      if (
        boot.documents.filter(
          (document) => document.project_id === value.projectId,
        ).length >= 20
      )
        throw new Error("Each project supports up to 20 documents.");
      const document: Document = {
        id: uuid(),
        project_id: value.projectId,
        name: value.title,
        storage_path: null,
        status: "ready",
        error: null,
        chunks: chunks(value.text),
      };
      boot.documents.push(document);
      save(state);
      return document;
    }
    if (resource === "documents" && method === "DELETE") {
      const document = must(boot.documents, target, "Document");
      if (document.storage_path)
        await removeFiles(state, [document.storage_path]);
      boot.documents = boot.documents.filter(
        (record) => record.id !== document.id,
      );
      boot.agents = boot.agents.map((agent) => ({
        ...agent,
        config: {
          ...agent.config,
          document_ids: agent.config?.document_ids?.filter(
            (documentId) => documentId !== document.id,
          ),
        },
      }));
      save(state);
      return { ok: true };
    }
    if (resource === "files" && method === "POST") {
      if (!(options.body instanceof FormData))
        throw new Error("Choose a file to upload.");
      const file = options.body.get("file");
      if (!(file instanceof File) || !file.size || file.size > 5242880)
        throw new Error("Choose a file between 1 byte and 5 MB.");
      if (state.files.length >= 100)
        throw new Error("Your preview supports up to 100 uploaded files.");
      const avatar = options.body.get("kind") === "avatar";
      const buffer = new Uint8Array(await file.arrayBuffer());
      const begins = (bytes: number[]) =>
        bytes.every((value, index) => buffer[index] === value);
      const decode = (start: number, end: number) =>
        new TextDecoder().decode(buffer.slice(start, end));
      let mime: string;
      if (avatar) {
        mime = begins([137, 80, 78, 71, 13, 10, 26, 10])
          ? "image/png"
          : begins([255, 216, 255])
            ? "image/jpeg"
            : decode(0, 4) === "RIFF" && decode(8, 12) === "WEBP"
              ? "image/webp"
              : "";
        if (!mime)
          throw new Error("Avatars support PNG, JPEG, and WebP images.");
      } else {
        const projectId = id.parse(options.body.get("projectId"));
        must(boot.projects, projectId, "Project");
        if (
          boot.documents.filter((document) => document.project_id === projectId)
            .length >= 20
        )
          throw new Error("Each project supports up to 20 documents.");
        mime =
          decode(0, 5) === "%PDF-"
            ? "application/pdf"
            : /\.(txt|md)$/i.test(file.name) && !buffer.includes(0)
              ? /\.md$/i.test(file.name)
                ? "text/markdown"
                : "text/plain"
              : "";
        if (!mime) throw new Error("Documents support PDF, TXT, and Markdown.");
      }
      const storagePath = `${USER_ID}/${avatar ? "avatars" : "documents"}/${uuid()}`;
      await files.put(storagePath, new Blob([buffer], { type: mime }));
      state.files.push({
        path: storagePath,
        name: file.name.slice(0, 200),
        type: mime,
        size: file.size,
      });
      if (avatar) {
        try {
          save(state);
        } catch (error) {
          await files.remove(storagePath);
          throw error;
        }
        return { path: storagePath };
      }
      const document: Document = {
        id: uuid(),
        project_id: id.parse(options.body.get("projectId")),
        name: file.name.slice(0, 200),
        storage_path: storagePath,
        status: "ready",
        error: null,
        chunks: [],
      };
      if (mime === "application/pdf") {
        document.status = "unsupported-in-preview";
        document.error =
          "Original PDF saved. PDF text extraction requires the connected application; no text was invented.";
      } else {
        try {
          document.chunks = chunks(
            new TextDecoder("utf-8", { fatal: true }).decode(buffer),
          );
          if (!document.chunks.length)
            throw new Error("This file has no readable text.");
        } catch (error) {
          document.status = "error";
          document.error =
            error instanceof Error ? error.message : "Text extraction failed.";
        }
      }
      boot.documents.push(document);
      try {
        save(state);
      } catch (error) {
        await files.remove(storagePath);
        throw error;
      }
      return { id: document.id };
    }
    if (resource === "files" && method === "GET") {
      const path = url.searchParams.get("path") ?? "";
      if (
        !path.startsWith(`${USER_ID}/`) ||
        !state.files.some((file) => file.path === path)
      )
        throw new Error("This file is unavailable in this preview.");
      const blob = await files.get(path);
      if (!blob)
        throw new Error(
          "The original file is no longer stored in this browser.",
        );
      return { url: urlFor(blob, path) };
    }
    if (resource === "jobs") {
      if (method === "POST" || method === "PATCH") {
        const value = jobSchema.parse(body(options));
        const existing =
          method === "PATCH" ? must(boot.jobs, target, "Schedule") : null;
        must(boot.projects, value.project_id, "Project");
        if (value.agent_id)
          checkMembership(state, value.project_id, value.agent_id);
        if (value.kind !== "reminder" && !value.agent_id)
          throw new Error("Choose an agent for generated work.");
        if (!existing && boot.jobs.length >= 50)
          throw new Error("Your preview supports up to 50 saved schedules.");
        let next_run: string;
        try {
          const cron = CronExpressionParser.parse(value.cron, {
            tz: value.timezone,
            currentDate: now(),
          });
          const first = cron.next().toDate();
          const second = cron.next().toDate();
          if (second.getTime() - first.getTime() < 3600000) throw new Error();
          next_run = first.toISOString();
        } catch {
          throw new Error(
            "Use a valid timezone and cron schedule, at most once per hour.",
          );
        }
        const record: Job = {
          ...value,
          id: existing?.id ?? uuid(),
          enabled: false,
          notify: false,
          next_run,
          last_error:
            "Saved locally. Background scheduling is unavailable in the design preview.",
        };
        boot.jobs = existing
          ? boot.jobs.map((job) => (job.id === existing.id ? record : job))
          : [...boot.jobs, record];
        save(state);
        return record;
      }
      if (method === "DELETE") {
        const job = must(boot.jobs, target, "Schedule");
        boot.jobs = boot.jobs.filter((record) => record.id !== job.id);
        boot.inbox = boot.inbox.filter((item) => item.job_id !== job.id);
        save(state);
        return { ok: true };
      }
    }
    if (resource === "history" && method === "GET") return [];
    if (resource === "inbox" && method === "PATCH") {
      const item = must(boot.inbox, target, "Inbox item");
      item.read = true;
      save(state);
      return { ok: true };
    }
    if (resource === "community") {
      const result = communityAction(
        state,
        segments.slice(1),
        method,
        options,
        uuid,
        timestamp,
      );
      if (method !== "GET") save(state);
      return result;
    }
    if (resource === "export" && method === "GET") {
      const exportedFiles = [];
      for (const file of state.files) {
        const blob = await files.get(file.path);
        exportedFiles.push({
          ...file,
          signedUrl: blob ? urlFor(blob, file.path) : null,
          error: blob
            ? null
            : "Original file is no longer stored in this browser.",
        });
      }
      const background = await dependencies.backgrounds?.get(USER_ID);
      if (background)
        exportedFiles.push({
          path: `${USER_ID}/background`,
          name: background.name,
          type: background.blob.type,
          size: background.blob.size,
          signedUrl: urlFor(background.blob, `${USER_ID}/background`),
          error: null,
        });
      return {
        version: 2,
        preview: true,
        exportedAt: timestamp(),
        data: {
          profiles: [boot.profile],
          agents: boot.agents,
          workflows: boot.workflows ?? [],
          projects: boot.projects,
          memberships: boot.memberships,
          messages: boot.messages,
          documents: boot.documents,
          jobs: boot.jobs,
          inbox: boot.inbox,
          job_runs: [],
          usage: [],
          music_feedback: [],
          community: state.community,
        },
        files: exportedFiles,
        fileLinksExpireAt: null,
        fileLinkNote:
          "Local blob links work only in this browser while this preview page remains open. Download originals before closing the page or deleting preview data.",
      };
    }
    if (resource === "account" && method === "DELETE") {
      z.object({ confirmation: z.literal("DELETE") }).parse(body(options));
      await files.clear();
      await dependencies.backgrounds?.remove(USER_ID);
      storage.removeItem(PREVIEW_STORAGE_KEY);
      for (const url of temporaryUrls) revokeObjectUrl(url);
      temporaryUrls.clear();
      fileUrls.clear();
      return { ok: true, preview: true };
    }
    throw new Error("This action is unavailable in the design preview.");
  }
  return function previewRequest<T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const result = queue
      .then(() => execute(path, options))
      .then((value) => structuredClone(value) as T);
    queue = result.catch(() => undefined);
    return result;
  };
}

function communityAction(
  state: PreviewState,
  path: string[],
  method: string,
  options: RequestInit,
  uuid: () => string,
  timestamp: () => string,
) {
  const community = state.community;
  const [resource, target, action] = path;
  const ownNetwork = (networkId: string) =>
    must(community.networks, networkId, "Network");
  if (resource === "boot" && method === "GET")
    return {
      ...community,
      networks: community.networks.map((network) => ({
        ...network,
        member_count: community.members.filter(
          (member) => member.network_id === network.id,
        ).length,
      })),
    };
  if (resource === "profile" && method === "PATCH") {
    const value = z
      .object({
        display_name: short(80),
        bio: z.string().trim().max(1000),
        interests: z.array(short(60)).max(20),
        discoverable: z.boolean(),
      })
      .parse(body(options));
    community.profile = { ...value, user_id: USER_ID };
    community.profiles = [community.profile];
    return community.profile;
  }
  if (resource === "layout" && method === "PATCH") {
    const value = z
      .object({
        view: z.enum(["feed", "networks"]),
        panels: z
          .array(
            z.object({
              id: z.enum(communityPanels),
              collapsed: z.boolean(),
              hidden: z.boolean(),
            }),
          )
          .max(12)
          .refine(
            (panels) =>
              new Set(panels.map((panel) => panel.id)).size === panels.length,
            "Each panel appears once.",
          ),
      })
      .parse(body(options));
    community.layouts = [
      ...community.layouts.filter((layout) => layout.view !== value.view),
      value,
    ];
    return value;
  }
  if (resource === "networks") {
    if (action === "join" && method === "POST") {
      ownNetwork(target);
      if (
        !community.members.some(
          (member) =>
            member.network_id === target && member.user_id === USER_ID,
        )
      )
        community.members.push({
          network_id: target,
          user_id: USER_ID,
          role: "member",
        });
      return { ok: true };
    }
    if (action === "invitations")
      throw new Error(
        "Inviting other people requires the connected application. No invitation was sent.",
      );
    if (method === "POST" || method === "PATCH") {
      const value = z
        .object({
          name: short(100),
          purpose: z.string().trim().max(2000),
          visibility: z.enum(["public", "private"]),
          topics: z.array(short(60)).max(12),
        })
        .parse(body(options));
      const existing = method === "PATCH" ? ownNetwork(target) : null;
      if (!existing && community.networks.length >= 100)
        throw new Error("Your preview supports up to 100 networks.");
      const network: CommunityNetwork = {
        ...value,
        id: existing?.id ?? uuid(),
        owner_id: USER_ID,
        created_at: existing?.created_at ?? timestamp(),
      };
      community.networks = existing
        ? community.networks.map((record) =>
            record.id === existing.id ? network : record,
          )
        : [...community.networks, network];
      if (!existing)
        community.members.push({
          network_id: network.id,
          user_id: USER_ID,
          role: "owner",
        });
      return network;
    }
    if (method === "DELETE") {
      ownNetwork(target);
      community.networks = community.networks.filter(
        (network) => network.id !== target,
      );
      community.members = community.members.filter(
        (member) => member.network_id !== target,
      );
      const posts = community.posts
        .filter((post) => post.network_id === target)
        .map((post) => post.id);
      community.posts = community.posts.filter(
        (post) => post.network_id !== target,
      );
      community.replies = community.replies.filter(
        (reply) => !posts.includes(reply.post_id),
      );
      community.reactions = community.reactions.filter(
        (reaction) => !posts.includes(reaction.post_id),
      );
      community.events = community.events.filter(
        (event) => event.network_id !== target,
      );
      community.resources = community.resources.filter(
        (item) => item.network_id !== target,
      );
      return { ok: true };
    }
  }
  if (["connections", "invitations", "members"].includes(resource))
    throw new Error(
      "Connecting with or managing other people requires the connected application. No message or invitation was sent.",
    );
  if (resource === "posts") {
    if (method === "POST" || method === "PATCH") {
      const value = z
        .object({
          network_id: id.nullable(),
          content: short(10000),
          link_url: https.default(""),
          audience: z
            .enum(["private", "connections", "public"])
            .default("connections"),
        })
        .parse(body(options));
      if (value.network_id) ownNetwork(value.network_id);
      const existing =
        method === "PATCH" ? must(community.posts, target, "Post") : null;
      if (!existing && community.posts.length >= 500)
        throw new Error("Your preview supports up to 500 posts.");
      const post = {
        ...value,
        id: existing?.id ?? uuid(),
        user_id: USER_ID,
        created_at: existing?.created_at ?? timestamp(),
      };
      community.posts = existing
        ? community.posts.map((record) =>
            record.id === existing.id ? post : record,
          )
        : [...community.posts, post];
      return post;
    }
    if (method === "DELETE") {
      must(community.posts, target, "Post");
      community.posts = community.posts.filter((post) => post.id !== target);
      community.replies = community.replies.filter(
        (reply) => reply.post_id !== target,
      );
      community.reactions = community.reactions.filter(
        (reaction) => reaction.post_id !== target,
      );
      return { ok: true };
    }
  }
  if (resource === "replies") {
    if (method === "POST") {
      const value = z
        .object({ post_id: id, content: short(3000) })
        .parse(body(options));
      must(community.posts, value.post_id, "Post");
      const reply = {
        ...value,
        id: uuid(),
        user_id: USER_ID,
        created_at: timestamp(),
      };
      community.replies.push(reply);
      return reply;
    }
    if (method === "DELETE") {
      must(community.replies, target, "Reply");
      community.replies = community.replies.filter(
        (reply) => reply.id !== target,
      );
      return { ok: true };
    }
  }
  if (resource === "reactions" && method === "POST") {
    const { active, ...value } = z
      .object({
        post_id: id,
        kind: z.enum(["like", "bookmark"]),
        active: z.boolean(),
      })
      .parse(body(options));
    must(community.posts, value.post_id, "Post");
    community.reactions = community.reactions.filter(
      (reaction) =>
        reaction.post_id !== value.post_id || reaction.kind !== value.kind,
    );
    if (active) community.reactions.push({ ...value, user_id: USER_ID });
    return { ok: true };
  }
  if (resource === "events") {
    if (method === "POST" || method === "PATCH") {
      const value = z
        .object({
          network_id: id.nullable(),
          title: short(160),
          starts_at: z.string().datetime({ offset: true }),
          location: z.string().trim().max(200).default(""),
          url: https.default(""),
        })
        .parse(body(options));
      if (value.network_id) ownNetwork(value.network_id);
      const existing =
        method === "PATCH" ? must(community.events, target, "Event") : null;
      const event = { ...value, id: existing?.id ?? uuid(), user_id: USER_ID };
      community.events = existing
        ? community.events.map((record) =>
            record.id === existing.id ? event : record,
          )
        : [...community.events, event];
      return event;
    }
    if (method === "DELETE") {
      must(community.events, target, "Event");
      community.events = community.events.filter(
        (event) => event.id !== target,
      );
      return { ok: true };
    }
  }
  if (resource === "resources") {
    if (method === "POST" || method === "PATCH") {
      const value = z
        .object({
          network_id: id,
          title: short(160),
          url: z
            .string()
            .url()
            .max(2000)
            .refine((address) => new URL(address).protocol === "https:"),
          kind: z.enum(["project", "resource", "game"]),
        })
        .parse(body(options));
      ownNetwork(value.network_id);
      const existing =
        method === "PATCH"
          ? must(community.resources, target, "Resource")
          : null;
      const item = { ...value, id: existing?.id ?? uuid(), user_id: USER_ID };
      community.resources = existing
        ? community.resources.map((record) =>
            record.id === existing.id ? item : record,
          )
        : [...community.resources, item];
      return item;
    }
    if (method === "DELETE") {
      must(community.resources, target, "Resource");
      community.resources = community.resources.filter(
        (item) => item.id !== target,
      );
      return { ok: true };
    }
  }
  throw new Error(
    "This community action is unavailable in the design preview.",
  );
}

function browserFiles(): PreviewFiles {
  let database: Promise<IDBDatabase> | undefined;
  function open() {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(PREVIEW_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(new Error("Your browser could not open local file storage."));
      };
      request.onblocked = () =>
        reject(
          new Error(
            "Another tab is blocking local file storage. Close other Cast preview tabs and try again.",
          ),
        );
    });
    return database;
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("files", mode);
      const request = operation(transaction.objectStore("files"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(
          new Error(
            "The local file operation failed. Your browser may be out of storage.",
          ),
        );
      transaction.onabort = () =>
        reject(new Error("The local file operation was interrupted."));
    });
  }
  return {
    put: async (path, blob) => {
      await transaction("readwrite", (store) => store.put(blob, path));
    },
    get: async (path) =>
      transaction("readonly", (store) => store.get(path)) as Promise<
        Blob | undefined
      >,
    remove: async (path) => {
      await transaction("readwrite", (store) => store.delete(path));
    },
    clear: async () => {
      await transaction("readwrite", (store) => store.clear());
    },
  };
}
let browserPreview: ReturnType<typeof createPreviewApi> | undefined;
function temporaryDependencies(): Pick<
  PreviewDependencies,
  "storage" | "files"
> {
  const records = new Map<string, string>();
  const blobs = new Map<string, Blob>();
  return {
    storage: {
      getItem: (key) => records.get(key) ?? null,
      setItem: (key, value) => {
        records.set(key, value);
      },
      removeItem: (key) => {
        records.delete(key);
      },
    },
    files: {
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
    },
  };
}
export function previewApi<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (typeof window === "undefined")
    return Promise.reject(
      new Error("Design preview storage is available only in the browser."),
    );
  try {
    browserPreview ??= createPreviewApi({
      ...(isTemporaryPreview()
        ? temporaryDependencies()
        : { storage: window.localStorage, files: browserFiles() }),
      backgrounds: { get: getBackground, remove: removeBackground },
    });
  } catch {
    return Promise.reject(
      new Error(
        "Enable browser storage for this site to use the design preview.",
      ),
    );
  }
  return browserPreview<T>(path, options);
}
