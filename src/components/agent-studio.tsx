"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Globe2,
  Heart,
  Layers3,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { api } from "@/lib/browser-db";
import { presets, voices } from "@/lib/presets";
import type {
  Agent,
  AgentConfig,
  Boot,
  Document,
  Project,
  Workflow,
} from "@/lib/types";
import {
  WorkflowStudio,
  WorkflowTemplateIcon,
  workflowFromTemplate,
  workflowTemplates,
} from "./workflow-studio";
import "./agent-studio.css";

export type AgentStudioDraft = Omit<Agent, "config"> & { config: AgentConfig };
export type AgentStudioProps = {
  agent: Agent | null;
  projects: Project[];
  documents: Document[];
  agents: Agent[];
  capabilities: Boot["capabilities"];
  onSave: (draft: AgentStudioDraft, applyAll?: boolean) => Promise<void>;
  onDelete?: (agentId: string) => Promise<void>;
  onClose: () => void;
};

const studioTabs = [
  { id: "identity", label: "Identity", icon: UserRound },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "behavior", label: "Behavior", icon: Heart },
  { id: "tools", label: "Tools", icon: Settings2 },
  { id: "templates", label: "Templates", icon: Layers3 },
] as const;
type StudioTab = (typeof studioTabs)[number]["id"];
const petAvatars = [
  { value: "🐈", label: "Cat" },
  { value: "🐕", label: "Dog" },
  { value: "🐇", label: "Rabbit" },
  { value: "🦉", label: "Owl" },
  { value: "🦊", label: "Fox" },
  { value: "🤖", label: "Robot" },
];
const avatarColors = ["amber", "sage", "slate", "rose", "blue", "violet"];
const temperaments = [
  "Warm",
  "Curious",
  "Calm",
  "Playful",
  "Direct",
  "Thoughtful",
  "Optimistic",
  "Skeptical",
];

function TagEditor({
  values,
  onChange,
  placeholder,
  label,
  limit = 20,
  maxLength = 100,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  label: string;
  limit?: number;
  maxLength?: number;
}) {
  const [input, setInput] = useState("");
  function add() {
    const next = input.trim();
    if (!next || values.length >= limit) return;
    if (!values.some((value) => value.toLowerCase() === next.toLowerCase()))
      onChange([...values, next]);
    setInput("");
  }
  return (
    <div className="studio-tag-editor">
      <div className="studio-tags">
        {values.map((value) => (
          <span key={value} className="studio-tag">
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`Remove ${value}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="studio-tag-input">
        <input
          value={input}
          maxLength={maxLength}
          aria-label={label}
          placeholder={
            values.length >= limit ? `Maximum ${limit} items` : placeholder
          }
          disabled={values.length >= limit}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          disabled={!input.trim() || values.length >= limit}
          onClick={add}
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <Plus size={17} />
        </button>
      </div>
    </div>
  );
}

function StudioAvatar({
  avatar,
  name,
  large = false,
}: {
  avatar: string;
  name: string;
  large?: boolean;
}) {
  const [url, setUrl] = useState("");
  const uploaded = avatar.includes("/");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (uploaded)
      api<{ url: string }>(`files?path=${encodeURIComponent(avatar)}`)
        .then((value) => {
          if (active) setUrl(value.url);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [avatar, uploaded]);
  return (
    <span
      className={`studio-avatar ${large ? "studio-avatar-large" : ""} studio-avatar-${avatarColors.includes(avatar) ? avatar : "sage"}`}
      aria-label={`${name || "Agent"} avatar`}
    >
      {uploaded && url ? (
        <img src={url} alt="" />
      ) : petAvatars.some((item) => item.value === avatar) ? (
        <span>{avatar}</span>
      ) : (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="25" fill="currentColor" opacity=".13" />
          <path
            d="M18 29V15l11 8m17 6V15L35 23"
            fill="currentColor"
            opacity=".45"
          />
          <ellipse
            cx="32"
            cy="35"
            rx="19"
            ry="18"
            fill="currentColor"
            opacity=".36"
          />
          <path
            d="M23 33h2m14 0h2"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m29 41 3 3 3-3m-3 3v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </span>
  );
}

export function AgentStudio({
  agent,
  projects,
  documents,
  agents,
  capabilities,
  onSave,
  onDelete,
  onClose,
}: AgentStudioProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const tabButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const avatarInput = useRef<HTMLInputElement>(null);
  const knowledgeInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<AgentStudioDraft>(() => ({
    ...(agent ?? {
      ...presets[0],
      id: "",
      user_id: "",
      name: "New agent",
      avatar: "🐈",
    }),
    config: {
      ...(agent?.id ? {} : { document_ids: [] }),
      ...(agent?.config ?? {}),
    },
  }));
  const [tab, setTab] = useState<StudioTab>("identity");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localDocuments, setLocalDocuments] = useState(documents);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [workflowManager, setWorkflowManager] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [uploadProject, setUploadProject] = useState(
    projects.find((project) => !project.archived)?.id ?? "",
  );
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);
  useEffect(() => {
    // The parent receives the database ID after the first save. Keep that ID
    // without replacing the user's current draft or creating a second agent.
    if (agent?.id)
      setDraft((old) =>
        old.id === agent.id
          ? old
          : { ...old, id: agent.id, user_id: agent.user_id },
      );
  }, [agent?.id, agent?.user_id]);
  useEffect(() => {
    let active = true;
    api<Workflow[]>("workflows")
      .then((value) => {
        if (active) setWorkflows(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingWorkflows(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update(value: Partial<AgentStudioDraft>) {
    setDraft((old) => ({ ...old, ...value }));
    setNotice("");
  }
  function config(value: Partial<AgentConfig>) {
    setDraft((old) => ({ ...old, config: { ...old.config, ...value } }));
    setNotice("");
  }
  function permission(key: keyof Agent["permissions"], value: boolean) {
    setDraft((old) => ({
      ...old,
      permissions: { ...old.permissions, [key]: value },
    }));
    setNotice("");
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: StudioTab) {
    const index = studioTabs.findIndex((item) => item.id === current);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % studioTabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + studioTabs.length) % studioTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? studioTabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(studioTabs[next].id);
    tabButtons.current[studioTabs[next].id]?.focus();
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    setError("");
    setNotice("");
    try {
      if (!file.size || file.size > 5242880)
        throw new Error("Choose a PNG, JPEG, or WebP image under 5 MB.");
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "avatar");
      const value = await api<{ path: string }>("files", {
        method: "POST",
        body: form,
      });
      update({ avatar: value.path });
      setNotice("Avatar uploaded. Save your agent to keep this choice.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to upload this avatar.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function uploadKnowledge(file: File) {
    setUploading(true);
    setError("");
    setNotice("");
    try {
      if (!uploadProject)
        throw new Error("Create a project before uploading knowledge.");
      if (!file.size || file.size > 5242880)
        throw new Error("Choose a PDF, TXT, or Markdown file under 5 MB.");
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "document");
      form.set("projectId", uploadProject);
      const uploaded = await api<{ id: string }>("files", {
        method: "POST",
        body: form,
      });
      const boot = await api<Boot>("boot");
      setLocalDocuments(boot.documents);
      const fileDocument = boot.documents.find(
        (item) => item.id === uploaded.id,
      );
      if (fileDocument?.status === "ready") {
        setDraft((old) => ({
          ...old,
          config: {
            ...old.config,
            document_ids:
              old.config.document_ids === undefined
                ? undefined
                : [
                    ...new Set([
                      ...(old.config.document_ids ?? []),
                      uploaded.id,
                    ]),
                  ].slice(0, 20),
          },
        }));
        setNotice(
          "File uploaded. Save your agent to keep its knowledge choices.",
        );
      } else
        setNotice(
          fileDocument?.error ||
            "File uploaded. Text extraction is not ready yet.",
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to upload this file.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function refreshWorkflows() {
    const value = await api<Workflow[]>("workflows");
    setWorkflows(value);
    setDraft((old) => ({
      ...old,
      config: {
        ...old.config,
        workflow_ids: (old.config.workflow_ids ?? []).filter((workflowId) =>
          value.some((workflow) => workflow.id === workflowId),
        ),
      },
    }));
  }

  async function addTemplate(templateId: string) {
    const template = workflowTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const existing = workflows.find(
        (workflow) =>
          workflow.name === template.name && workflow.kind === template.kind,
      );
      const saved =
        existing ??
        (await api<Workflow>("workflows", {
          method: "POST",
          body: JSON.stringify(workflowFromTemplate(template)),
        }));
      setWorkflows((old) =>
        old.some((item) => item.id === saved.id) ? old : [saved, ...old],
      );
      if (saved.kind === "text" && saved.enabled) {
        setDraft((old) => ({
          ...old,
          config: {
            ...old.config,
            workflow_ids: [
              ...new Set([...(old.config.workflow_ids ?? []), saved.id]),
            ].slice(0, 20),
          },
        }));
        setNotice(`${saved.name} added. Save your agent to use this workflow.`);
      } else if (saved.kind === "text")
        setNotice(
          `${saved.name} is saved in your library and paused. Enable it in the workflow studio before assigning it.`,
        );
      else
        setNotice(
          `${saved.name} saved to your library. It needs a connected ${saved.kind} service before agents can use it.`,
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to add this template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value: AgentStudioDraft = {
        ...draft,
        name: draft.name.trim(),
        config: {
          ...draft.config,
          examples: (draft.config.examples ?? []).filter(
            (example) => example.prompt.trim() || example.response.trim(),
          ),
        },
      };
      if (!value.name) {
        setTab("identity");
        throw new Error("Give your agent a name.");
      }
      if (
        value.config.examples?.some(
          (example) => !example.prompt.trim() || !example.response.trim(),
        )
      ) {
        setTab("behavior");
        throw new Error(
          "Each behavior example needs both a user message and an ideal reply.",
        );
      }
      await onSave(value, applyAll);
      setNotice(
        applyAll && (draft.config.workflow_ids?.length ?? 0) > 0
          ? "Agent saved. Selected workflows were applied to all your agents."
          : "Agent saved. Your choices will guide its next replies.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save your agent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent() {
    if (!draft.id || !onDelete) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(draft.id);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete this agent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicateAgent() {
    const original = draft;
    const copy: AgentStudioDraft = {
      ...draft,
      id: "",
      name: `${draft.name.trim().slice(0, 95)} copy`,
      archived: false,
      config: structuredClone(draft.config),
    };
    setBusy(true);
    setError("");
    setNotice("");
    setDraft(copy);
    try {
      await onSave(copy, false);
      setNotice("Agent duplicated. You're now editing the new copy.");
    } catch (reason) {
      setDraft(original);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to duplicate this agent.",
      );
    } finally {
      setBusy(false);
    }
  }

  const chosenDocuments = draft.config.document_ids ?? [];
  const useAllProjectFiles = draft.config.document_ids === undefined;
  const chosenWorkflows = draft.config.workflow_ids ?? [];
  const emotions = draft.config.emotions ?? [];
  const filteredDocuments = localDocuments.filter((document) =>
    document.name.toLowerCase().includes(documentQuery.toLowerCase()),
  );
  const filteredWorkflows = workflows.filter((workflow) =>
    `${workflow.name} ${workflow.description}`
      .toLowerCase()
      .includes(workflowQuery.toLowerCase()),
  );
  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? "Project";

  return (
    <>
      <dialog
        ref={dialog}
        className="studio-dialog"
        aria-labelledby={`${id}-title`}
        onCancel={onClose}
      >
        <header className="studio-head">
          <span className="studio-head-symbol">
            <Sparkles size={23} />
          </span>
          <div>
            <span className="studio-eyebrow">MAKE THIS COLLABORATOR YOURS</span>
            <h2 id={`${id}-title`}>
              {agent?.id ? "Agent studio" : "Create an agent"}
            </h2>
          </div>
          <button
            type="button"
            className="studio-close"
            aria-label="Close agent studio"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form
          className="studio-layout"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <aside className="studio-profile">
            <StudioAvatar avatar={draft.avatar} name={draft.name} large />
            <h3>{draft.name || "Your new agent"}</h3>
            <p>
              {draft.config.role ||
                draft.expertise.split(",")[0] ||
                "Your AI collaborator"}
            </p>
            <span className="studio-profile-badge">
              <span />
              AI collaborator
            </span>
            <div className="studio-profile-divider" />
            <span className="studio-profile-label">AT A GLANCE</span>
            <dl className="studio-profile-details">
              <div>
                <dt>
                  <BookOpen size={14} />
                  Knowledge
                </dt>
                <dd>
                  {useAllProjectFiles
                    ? "Project files"
                    : `${chosenDocuments.length} ${chosenDocuments.length === 1 ? "file" : "files"}`}
                </dd>
              </div>
              <div>
                <dt>
                  <WorkflowIcon size={14} />
                  Workflows
                </dt>
                <dd>{chosenWorkflows.length} assigned</dd>
              </div>
              <div>
                <dt>
                  <Volume2 size={14} />
                  Voice
                </dt>
                <dd>{draft.voice}</dd>
              </div>
            </dl>
            {emotions.length > 0 && (
              <div className="studio-profile-traits">
                {emotions.slice(0, 4).map((emotion) => (
                  <span key={emotion}>{emotion}</span>
                ))}
              </div>
            )}
            <div className="studio-profile-bottom">
              <ShieldCheck size={18} />
              <p>
                Personality and examples guide this agent. It uses the access
                you allow.
              </p>
            </div>
          </aside>
          <div className="studio-workspace">
            <div
              className="studio-tabs"
              role="tablist"
              aria-label="Agent customization"
            >
              {studioTabs.map(({ id: key, label, icon: Icon }) => (
                <button
                  key={key}
                  ref={(button) => {
                    tabButtons.current[key] = button;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${key}`}
                  aria-controls={`${id}-panel-${key}`}
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  className={tab === key ? "studio-tab-active" : ""}
                  onClick={() => setTab(key)}
                  onKeyDown={(event) => tabKey(event, key)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {key === "knowledge" && chosenDocuments.length > 0 && (
                    <small>{chosenDocuments.length}</small>
                  )}
                </button>
              ))}
            </div>
            <div className="studio-content">
              {error && (
                <div className="studio-alert" role="alert">
                  {error}
                  <button
                    type="button"
                    aria-label="Dismiss agent error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="studio-notice" role="status">
                  <CheckCircle2 size={17} />
                  {notice}
                </div>
              )}
              <fieldset disabled={busy || uploading} className="studio-fields">
                <section
                  role="tabpanel"
                  id={`${id}-panel-${tab}`}
                  aria-labelledby={`${id}-tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === "identity" && (
                    <>
                      <div className="studio-section-heading">
                        <span className="studio-section-icon">
                          <UserRound size={20} />
                        </span>
                        <div>
                          <h3>A face. A name. A point of view.</h3>
                          <p>
                            Shape who this agent is and what makes it a good
                            collaborator.
                          </p>
                        </div>
                      </div>
                      <div className="studio-avatar-editor">
                        <div>
                          <span className="studio-field-title">
                            Choose a face
                          </span>
                          <div className="studio-pet-choices">
                            {petAvatars.map((pet) => (
                              <button
                                type="button"
                                key={pet.value}
                                aria-label={`${pet.label} avatar`}
                                aria-pressed={draft.avatar === pet.value}
                                className={
                                  draft.avatar === pet.value
                                    ? "studio-avatar-chosen"
                                    : ""
                                }
                                onClick={() => update({ avatar: pet.value })}
                              >
                                {pet.value}
                                {draft.avatar === pet.value && (
                                  <Check size={11} />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="studio-upload-button"
                          onClick={() => avatarInput.current?.click()}
                        >
                          {uploading ? (
                            <Loader2 size={16} className="studio-spinning" />
                          ) : (
                            <Upload size={16} />
                          )}
                          Upload your own
                        </button>
                        <input
                          ref={avatarInput}
                          className="studio-hidden"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAvatar(file);
                            event.target.value = "";
                          }}
                        />
                      </div>
                      <div className="studio-color-row">
                        <span>Or keep it simple</span>
                        {avatarColors.map((color) => (
                          <button
                            type="button"
                            key={color}
                            className={`studio-color studio-color-${color}`}
                            aria-label={`${color} avatar`}
                            aria-pressed={draft.avatar === color}
                            onClick={() => update({ avatar: color })}
                          >
                            {draft.avatar === color && <Check size={12} />}
                          </button>
                        ))}
                        <small>PNG, JPEG, or WebP · up to 5 MB</small>
                      </div>
                      <div className="studio-two-columns">
                        <label className="studio-field">
                          Name
                          <input
                            value={draft.name}
                            maxLength={100}
                            required
                            placeholder="What should we call them?"
                            onChange={(event) =>
                              update({ name: event.target.value })
                            }
                          />
                        </label>
                        <label className="studio-field">
                          Role or specialty
                          <input
                            value={draft.config.role ?? ""}
                            maxLength={100}
                            placeholder="e.g. Creative partner"
                            onChange={(event) =>
                              config({ role: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="studio-field">
                        Personality
                        <textarea
                          aria-label="Personality"
                          rows={3}
                          value={draft.personality}
                          maxLength={2000}
                          placeholder="How do they think, speak, and work with you?"
                          onChange={(event) =>
                            update({ personality: event.target.value })
                          }
                        />
                        <small>
                          A little specific direction makes the agent feel more
                          consistent.
                        </small>
                      </label>
                      <div className="studio-two-columns">
                        <label className="studio-field">
                          Beliefs & worldview
                          <textarea
                            rows={3}
                            value={draft.worldview}
                            maxLength={2000}
                            placeholder="The perspectives and principles they should consider."
                            onChange={(event) =>
                              update({ worldview: event.target.value })
                            }
                          />
                        </label>
                        <label className="studio-field">
                          Guiding values
                          <textarea
                            rows={3}
                            value={draft.config.beliefs ?? ""}
                            maxLength={2000}
                            placeholder="e.g. Intellectual honesty, patience, and useful disagreement."
                            onChange={(event) =>
                              config({ beliefs: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="studio-field">
                        Origin
                        <input
                          value={draft.config.origin ?? ""}
                          maxLength={1000}
                          placeholder="Where does their perspective come from?"
                          onChange={(event) =>
                            config({ origin: event.target.value })
                          }
                        />
                      </label>
                      <label className="studio-field">
                        Origin story
                        <textarea
                          rows={3}
                          value={draft.config.story ?? ""}
                          maxLength={2000}
                          placeholder="Give them a creative backstory. They will still identify as an AI collaborator."
                          onChange={(event) =>
                            config({ story: event.target.value })
                          }
                        />
                      </label>
                      <label className="studio-field">
                        Background
                        <textarea
                          rows={2}
                          value={draft.background}
                          maxLength={2000}
                          placeholder="Relevant context about this agent's perspective."
                          onChange={(event) =>
                            update({ background: event.target.value })
                          }
                        />
                      </label>
                      {draft.id && (
                        <div className="studio-agent-maintenance">
                          <button
                            type="button"
                            className="studio-duplicate-agent"
                            disabled={!draft.name.trim()}
                            onClick={() => void duplicateAgent()}
                          >
                            <Copy size={15} />
                            Duplicate agent
                          </button>
                          <label className="studio-archive-toggle">
                            <input
                              type="checkbox"
                              aria-label="Archive this agent"
                              checked={draft.archived}
                              onChange={(event) =>
                                update({ archived: event.target.checked })
                              }
                            />
                            <span>
                              <strong>Archive this agent</strong>
                              <small>
                                Save to remove it from active chats. Restore it
                                from your cast library whenever you like.
                              </small>
                            </span>
                          </label>
                          {onDelete && (
                            <button
                              type="button"
                              className="studio-delete-agent"
                              onClick={() => setDeleteConfirm((old) => !old)}
                            >
                              <Trash2 size={15} />
                              Delete agent
                            </button>
                          )}
                          {deleteConfirm && (
                            <div className="studio-delete-confirm" role="alert">
                              <strong>
                                Delete {draft.name || "this agent"}?
                              </strong>
                              <p>
                                Its configuration, memory, and scheduled work
                                will be deleted. Past conversation messages stay
                                in your projects.
                              </p>
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm(false)}
                                >
                                  Keep agent
                                </button>
                                <button
                                  type="button"
                                  className="studio-confirm-delete"
                                  onClick={() => void deleteAgent()}
                                >
                                  Delete permanently
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {tab === "knowledge" && (
                    <>
                      <div className="studio-section-heading">
                        <span className="studio-section-icon">
                          <BookOpen size={20} />
                        </span>
                        <div>
                          <h3>Give them useful context.</h3>
                          <p>
                            Choose expertise and the files this agent can bring
                            into its work.
                          </p>
                        </div>
                      </div>
                      <label className="studio-field">
                        Expertise
                        <textarea
                          aria-label="Expertise"
                          rows={3}
                          maxLength={2000}
                          value={draft.expertise}
                          placeholder="e.g. Product design, travel planning, scientific literature…"
                          onChange={(event) =>
                            update({ expertise: event.target.value })
                          }
                        />
                      </label>
                      <div className="studio-field">
                        <span>Capabilities</span>
                        <TagEditor
                          label="Capability"
                          placeholder="Add a skill, then press Enter"
                          values={draft.config.capabilities ?? []}
                          onChange={(values) =>
                            config({ capabilities: values })
                          }
                        />
                        <small>
                          These describe strengths you want the agent to use.
                          Connected tools are controlled in the Tools tab.
                        </small>
                      </div>
                      <div className="studio-knowledge-head">
                        <div>
                          <h4>Knowledge files</h4>
                          <p>
                            {useAllProjectFiles
                              ? "All files in invited projects"
                              : `${chosenDocuments.length} of 20 selected`}
                          </p>
                        </div>
                        <label className="studio-switch">
                          <input
                            type="checkbox"
                            checked={draft.permissions.documents}
                            onChange={(event) =>
                              permission("documents", event.target.checked)
                            }
                          />
                          <span>Allow file access</span>
                        </label>
                      </div>
                      {!draft.permissions.documents && (
                        <p className="studio-info-note">
                          <LockKeyhole size={15} />
                          Files stay selected, but this agent will not read them
                          while file access is off.
                        </p>
                      )}
                      <label className="studio-all-project-files">
                        <input
                          type="checkbox"
                          checked={useAllProjectFiles}
                          onChange={(event) =>
                            config({
                              document_ids: event.target.checked
                                ? undefined
                                : [],
                            })
                          }
                        />
                        <span>
                          <strong>Use all files in invited projects</strong>
                          <small>
                            Turn this off to choose specific files below. File
                            access and project invitations still apply.
                          </small>
                        </span>
                      </label>
                      <div className="studio-knowledge-upload">
                        <label className="studio-field">
                          Upload to project
                          <select
                            aria-label="Project for knowledge upload"
                            value={uploadProject}
                            onChange={(event) =>
                              setUploadProject(event.target.value)
                            }
                          >
                            {projects
                              .filter((project) => !project.archived)
                              .map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="studio-upload-button"
                          disabled={
                            !uploadProject || chosenDocuments.length >= 20
                          }
                          onClick={() => knowledgeInput.current?.click()}
                        >
                          <Upload size={16} />
                          Upload a file
                        </button>
                        <input
                          ref={knowledgeInput}
                          type="file"
                          className="studio-hidden"
                          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadKnowledge(file);
                            event.target.value = "";
                          }}
                        />
                      </div>
                      <label className="studio-search">
                        <Search size={16} />
                        <input
                          aria-label="Search knowledge files"
                          placeholder="Find a file…"
                          value={documentQuery}
                          onChange={(event) =>
                            setDocumentQuery(event.target.value)
                          }
                        />
                      </label>
                      <div className="studio-document-list">
                        {filteredDocuments.map((document) => {
                          const outsideScope =
                            draft.project_scope.length > 0 &&
                            !draft.project_scope.includes(document.project_id);
                          const unavailable =
                            document.status !== "ready" || outsideScope;
                          const selected = useAllProjectFiles
                            ? !unavailable
                            : chosenDocuments.includes(document.id);
                          return (
                            <label
                              key={document.id}
                              className={`studio-document ${selected ? "studio-document-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={
                                  useAllProjectFiles ||
                                  (!selected &&
                                    (unavailable ||
                                      chosenDocuments.length >= 20))
                                }
                                onChange={(event) =>
                                  config({
                                    document_ids: event.target.checked
                                      ? [...chosenDocuments, document.id]
                                      : chosenDocuments.filter(
                                          (value) => value !== document.id,
                                        ),
                                  })
                                }
                              />
                              <span className="studio-document-icon">
                                <FileText size={20} />
                              </span>
                              <span className="studio-document-info">
                                <strong>{document.name}</strong>
                                <small>
                                  {projectName(document.project_id)}
                                  {outsideScope
                                    ? " · Outside this agent's project access"
                                    : document.status === "ready"
                                      ? ` · ${document.chunks?.length ?? 0} text sections`
                                      : ` · ${document.error || document.status}`}
                                </small>
                              </span>
                              {selected && (
                                <CheckCircle2
                                  size={17}
                                  className="studio-file-check"
                                />
                              )}
                            </label>
                          );
                        })}
                        {!filteredDocuments.length && (
                          <div className="studio-empty">
                            <FileText size={26} />
                            <strong>
                              {documentQuery
                                ? "No files match that search"
                                : "A little context goes a long way"}
                            </strong>
                            <p>
                              {documentQuery
                                ? "Try another name."
                                : "Upload a text PDF, TXT, or Markdown file, or use your project's existing documents."}
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="studio-footnote">
                        Files stay private to your account. Agents can use
                        selected files only when invited to the file's project.
                        Scanned PDFs need text extraction before upload.
                      </p>
                      <label className="studio-field studio-memory-field">
                        Personal memory
                        <textarea
                          aria-label="Personal memory"
                          rows={4}
                          maxLength={6000}
                          value={draft.memories}
                          placeholder="Details you want this agent to remember about you or how you work."
                          onChange={(event) =>
                            update({ memories: event.target.value })
                          }
                        />
                        <small>
                          Editable context, used only when memory access is on.
                        </small>
                      </label>
                    </>
                  )}
                  {tab === "behavior" && (
                    <>
                      <div className="studio-section-heading">
                        <span className="studio-section-icon">
                          <Heart size={20} />
                        </span>
                        <div>
                          <h3>Help them get your style.</h3>
                          <p>
                            Set a tone, make your expectations clear, and teach
                            by example.
                          </p>
                        </div>
                      </div>
                      <div className="studio-field">
                        <span>Emotional tone</span>
                        <div className="studio-temperaments">
                          {temperaments.map((emotion) => (
                            <button
                              type="button"
                              key={emotion}
                              aria-pressed={emotions.includes(emotion)}
                              className={
                                emotions.includes(emotion)
                                  ? "studio-temperament-selected"
                                  : ""
                              }
                              disabled={
                                !emotions.includes(emotion) &&
                                emotions.length >= 12
                              }
                              onClick={() =>
                                config({
                                  emotions: emotions.includes(emotion)
                                    ? emotions.filter(
                                        (value) => value !== emotion,
                                      )
                                    : [...emotions, emotion],
                                })
                              }
                            >
                              {emotion}
                              {emotions.includes(emotion) && (
                                <Check size={12} />
                              )}
                            </button>
                          ))}
                        </div>
                        <TagEditor
                          label="Custom emotional tone"
                          limit={
                            12 -
                            emotions.filter((emotion) =>
                              temperaments.includes(emotion),
                            ).length
                          }
                          maxLength={80}
                          values={emotions.filter(
                            (emotion) => !temperaments.includes(emotion),
                          )}
                          placeholder="Add your own tone"
                          onChange={(values) =>
                            config({
                              emotions: [
                                ...emotions.filter((emotion) =>
                                  temperaments.includes(emotion),
                                ),
                                ...values,
                              ].slice(0, 12),
                            })
                          }
                        />
                        <small>
                          These are communication cues for an AI, rather than
                          feelings it experiences.
                        </small>
                      </div>
                      <div className="studio-field">
                        <span>Response style</span>
                        <div
                          className="studio-response-styles"
                          role="group"
                          aria-label="Response style"
                        >
                          {[
                            {
                              value: "concise",
                              title: "Keep it brief",
                              description: "The point, with less preamble",
                            },
                            {
                              value: "balanced",
                              title: "A useful balance",
                              description: "Enough detail for the task",
                            },
                            {
                              value: "thorough",
                              title: "Go deeper",
                              description: "Context, reasoning, and detail",
                            },
                          ].map((style) => (
                            <button
                              type="button"
                              key={style.value}
                              aria-pressed={
                                (draft.config.responseStyle ?? "balanced") ===
                                style.value
                              }
                              className={
                                (draft.config.responseStyle ?? "balanced") ===
                                style.value
                                  ? "studio-style-selected"
                                  : ""
                              }
                              onClick={() =>
                                config({
                                  responseStyle:
                                    style.value as AgentConfig["responseStyle"],
                                })
                              }
                            >
                              <strong>{style.title}</strong>
                              <small>{style.description}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="studio-field">
                        Working instructions
                        <textarea
                          aria-label="Working instructions"
                          rows={4}
                          maxLength={3000}
                          value={draft.instructions}
                          placeholder="e.g. Be honest when you disagree. Ask before making assumptions. End plans with one concrete next step."
                          onChange={(event) =>
                            update({ instructions: event.target.value })
                          }
                        />
                        <small>
                          These instructions guide every reply alongside the
                          agent's personality and expertise.
                        </small>
                      </label>
                      <div className="studio-examples-head">
                        <div>
                          <h4>Show, don't just tell.</h4>
                          <p>
                            Give examples of the way you want this agent to
                            respond.
                          </p>
                        </div>
                        <span>{draft.config.examples?.length ?? 0} / 6</span>
                      </div>
                      <div className="studio-examples">
                        {(draft.config.examples ?? []).map((example, index) => (
                          <div key={index} className="studio-example">
                            <div className="studio-example-heading">
                              <span>
                                <MessageSquare size={14} />
                                Example {index + 1}
                              </span>
                              <button
                                type="button"
                                aria-label={`Remove behavior example ${index + 1}`}
                                onClick={() =>
                                  config({
                                    examples: (
                                      draft.config.examples ?? []
                                    ).filter(
                                      (_, position) => position !== index,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <label className="studio-field">
                              When I say…
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={example.prompt}
                                placeholder="A message you might send"
                                onChange={(event) =>
                                  config({
                                    examples: (draft.config.examples ?? []).map(
                                      (item, position) =>
                                        position === index
                                          ? {
                                              ...item,
                                              prompt: event.target.value,
                                            }
                                          : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label className="studio-field">
                              I'd like a reply like…
                              <textarea
                                rows={3}
                                maxLength={1500}
                                value={example.response}
                                placeholder="An example of the tone and answer you'd prefer"
                                onChange={(event) =>
                                  config({
                                    examples: (draft.config.examples ?? []).map(
                                      (item, position) =>
                                        position === index
                                          ? {
                                              ...item,
                                              response: event.target.value,
                                            }
                                          : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="studio-add-example"
                        disabled={(draft.config.examples?.length ?? 0) >= 6}
                        onClick={() =>
                          config({
                            examples: [
                              ...(draft.config.examples ?? []),
                              { prompt: "", response: "" },
                            ],
                          })
                        }
                      >
                        <Plus size={16} />
                        Add a behavior example
                      </button>
                      <p className="studio-footnote">
                        Examples become instructions for future replies. They do
                        not change the underlying AI model.
                      </p>
                      <label className="studio-field studio-voice-field">
                        Voice
                        <select
                          aria-label="Voice"
                          value={draft.voice}
                          onChange={(event) =>
                            update({ voice: event.target.value })
                          }
                        >
                          {voices.map((voice) => (
                            <option key={voice} value={voice}>
                              {voice}
                            </option>
                          ))}
                        </select>
                        <small>
                          {capabilities.speech
                            ? "Used when this agent speaks in a voice session."
                            : "Your voice choice is saved. Live voice needs a connected speech service."}
                        </small>
                      </label>
                    </>
                  )}
                  {tab === "tools" && (
                    <>
                      <div className="studio-section-heading">
                        <span className="studio-section-icon">
                          <Settings2 size={20} />
                        </span>
                        <div>
                          <h3>Useful tools. Clear boundaries.</h3>
                          <p>
                            Choose what this agent can access and where it can
                            work.
                          </p>
                        </div>
                      </div>
                      <div className="studio-permission-grid">
                        {[
                          {
                            key: "documents" as const,
                            icon: FileText,
                            title: "Project knowledge",
                            description:
                              "Read permitted files when invited to a project.",
                            connected: true,
                          },
                          {
                            key: "memory" as const,
                            icon: BookOpen,
                            title: "Personal memory",
                            description:
                              "Use the memory you write for this agent.",
                            connected: true,
                          },
                          {
                            key: "search" as const,
                            icon: Globe2,
                            title: "Grounded web research",
                            description:
                              "Use cited web results in enabled research work.",
                            connected: capabilities.search,
                          },
                          {
                            key: "scheduled" as const,
                            icon: Clock3,
                            title: "Scheduled work",
                            description:
                              "Allow explicitly enabled background tasks.",
                            connected: capabilities.ai,
                          },
                        ].map(
                          ({
                            key,
                            icon: Icon,
                            title,
                            description,
                            connected,
                          }) => (
                            <label
                              key={key}
                              className={`studio-permission ${draft.permissions[key] ? "studio-permission-on" : ""}`}
                            >
                              <span className="studio-tool-icon">
                                <Icon size={20} />
                              </span>
                              <span className="studio-permission-copy">
                                <strong>{title}</strong>
                                <small>{description}</small>
                                <span
                                  className={`studio-tool-state ${connected ? "studio-tool-connected" : ""}`}
                                >
                                  <span />
                                  {connected
                                    ? "Available"
                                    : "Connection needed"}
                                </span>
                              </span>
                              <input
                                type="checkbox"
                                checked={draft.permissions[key]}
                                disabled={!connected && !draft.permissions[key]}
                                aria-label={`Allow ${title.toLowerCase()}`}
                                onChange={(event) =>
                                  permission(key, event.target.checked)
                                }
                              />
                            </label>
                          ),
                        )}
                      </div>
                      <div className="studio-field">
                        <span>Tool preferences</span>
                        <TagEditor
                          label="Tool preference"
                          values={draft.config.tools ?? []}
                          placeholder="e.g. Spreadsheet analysis"
                          onChange={(values) => config({ tools: values })}
                        />
                        <small>
                          Preferences tell the agent what would help. They do
                          not grant access to an external service.
                        </small>
                      </div>
                      <div className="studio-connectors-heading">
                        <h4>External connectors</h4>
                        <span>Ready when you connect a service</span>
                      </div>
                      <div className="studio-connectors">
                        {[
                          { symbol: "M", name: "Gmail", color: "red" },
                          { symbol: "N", name: "Notion", color: "ink" },
                          { symbol: "#", name: "Slack", color: "purple" },
                          { symbol: "△", name: "Google Drive", color: "blue" },
                          { symbol: "▦", name: "Calendar", color: "green" },
                          {
                            symbol: "✦",
                            name: "Image & video",
                            color: "purple",
                          },
                        ].map((connector) => (
                          <div
                            key={connector.name}
                            className="studio-connector"
                          >
                            <span
                              className={`studio-connector-symbol studio-connector-${connector.color}`}
                            >
                              {connector.symbol}
                            </span>
                            <span>
                              <strong>{connector.name}</strong>
                              <small>
                                <LockKeyhole size={10} />
                                Not connected
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="studio-footnote">
                        No email, calendar, or external account access is
                        enabled by these preferences. Connections need their own
                        integration and account authorization.
                      </p>
                      <div className="studio-project-access">
                        <h4>Project access</h4>
                        <p>
                          Limit which projects can invite this agent. Leave all
                          unchecked to allow invitations to any of your
                          projects.
                        </p>
                        <div className="studio-project-choices">
                          {projects
                            .filter((project) => !project.archived)
                            .map((project) => (
                              <label key={project.id}>
                                <input
                                  type="checkbox"
                                  checked={draft.project_scope.includes(
                                    project.id,
                                  )}
                                  onChange={(event) =>
                                    update({
                                      project_scope: event.target.checked
                                        ? [...draft.project_scope, project.id]
                                        : draft.project_scope.filter(
                                            (value) => value !== project.id,
                                          ),
                                    })
                                  }
                                />
                                <span>{project.name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "templates" && (
                    <>
                      <div className="studio-section-heading">
                        <span className="studio-section-icon">
                          <Layers3 size={20} />
                        </span>
                        <div>
                          <h3>A way of working, ready to go.</h3>
                          <p>
                            Give this agent reusable templates. Make them yours
                            in the workflow studio.
                          </p>
                        </div>
                      </div>
                      <div className="studio-template-toolbar">
                        <button
                          type="button"
                          className="studio-workflow-launch"
                          onClick={() => setWorkflowManager(true)}
                        >
                          <WorkflowIcon size={17} />
                          Open workflow studio
                          <ArrowRight size={15} />
                        </button>
                        <span>{chosenWorkflows.length} / 20 assigned</span>
                      </div>
                      <label className="studio-search">
                        <Search size={16} />
                        <input
                          aria-label="Search agent workflows"
                          placeholder="Find a saved workflow…"
                          value={workflowQuery}
                          onChange={(event) =>
                            setWorkflowQuery(event.target.value)
                          }
                        />
                      </label>
                      <div className="studio-workflow-list">
                        {loadingWorkflows ? (
                          <p className="studio-loading">
                            <Loader2 size={16} className="studio-spinning" />
                            Loading workflows…
                          </p>
                        ) : filteredWorkflows.length ? (
                          filteredWorkflows.map((workflow) => {
                            const selected = chosenWorkflows.includes(
                              workflow.id,
                            );
                            const available =
                              workflow.kind === "text" && workflow.enabled;
                            return (
                              <label
                                key={workflow.id}
                                className={`studio-workflow-choice ${selected ? "studio-workflow-chosen" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={
                                    !selected &&
                                    (!available || chosenWorkflows.length >= 20)
                                  }
                                  onChange={(event) =>
                                    config({
                                      workflow_ids: event.target.checked
                                        ? [...chosenWorkflows, workflow.id]
                                        : chosenWorkflows.filter(
                                            (value) => value !== workflow.id,
                                          ),
                                    })
                                  }
                                />
                                <span className="studio-workflow-icon">
                                  <WorkflowIcon size={20} />
                                </span>
                                <span className="studio-workflow-info">
                                  <strong>{workflow.name}</strong>
                                  <small>
                                    {workflow.description ||
                                      `${workflow.steps.length} reusable steps`}
                                  </small>
                                  <span>
                                    {workflow.kind !== "text"
                                      ? `${workflow.kind === "image" ? "Image" : "Video"} service required`
                                      : workflow.enabled
                                        ? `${workflow.steps.length} steps · Text instructions`
                                        : "Paused in workflow studio"}
                                  </span>
                                </span>
                                {selected && <CheckCircle2 size={17} />}
                              </label>
                            );
                          })
                        ) : (
                          <p className="studio-empty-workflows">
                            {workflowQuery
                              ? "No workflows match that search."
                              : "Start with a template below, or create your own in the workflow studio."}
                          </p>
                        )}
                      </div>
                      <label className="studio-apply-all">
                        <input
                          type="checkbox"
                          checked={applyAll}
                          disabled={!chosenWorkflows.length}
                          onChange={(event) =>
                            setApplyAll(event.target.checked)
                          }
                        />
                        <span>
                          <strong>
                            Apply selected workflows to all my agents
                          </strong>
                          <small>
                            This shares the templates when you save. Each agent
                            keeps its own name, personality, avatar, and memory.
                          </small>
                        </span>
                      </label>
                      <div className="studio-ready-heading">
                        <h4>Start with a template</h4>
                        <span>Editable. Reusable. Yours.</span>
                      </div>
                      <div className="studio-template-grid">
                        {workflowTemplates.map((template) => (
                          <button
                            type="button"
                            key={template.id}
                            className="studio-template-card"
                            disabled={
                              template.kind === "text" &&
                              chosenWorkflows.length >= 20
                            }
                            onClick={() => void addTemplate(template.id)}
                          >
                            <span
                              className={`studio-template-icon ${template.kind !== "text" ? "studio-template-media" : ""}`}
                            >
                              <WorkflowTemplateIcon
                                template={template}
                                size={18}
                              />
                            </span>
                            <span>
                              <strong>{template.name}</strong>
                              <small>{template.output}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                      <p className="studio-footnote">
                        Text templates guide an agent's reply. Charts, diagrams,
                        sites, and apps provide plans or source code. Media
                        templates can be saved now and need a connected service
                        to generate images or videos.
                      </p>
                    </>
                  )}
                </section>
              </fieldset>
            </div>
            <footer className="studio-footer">
              <span>
                {busy || uploading ? (
                  <>
                    <Loader2 size={14} className="studio-spinning" />
                    {uploading ? "Uploading…" : "Saving…"}
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} />
                    Save to use your changes
                  </>
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="studio-cancel"
                  disabled={busy || uploading}
                  onClick={onClose}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="studio-save"
                  disabled={busy || uploading}
                >
                  {busy ? (
                    <Loader2 size={16} className="studio-spinning" />
                  ) : (
                    <Check size={16} />
                  )}
                  Save agent
                </button>
              </div>
            </footer>
          </div>
        </form>
      </dialog>
      {workflowManager && (
        <WorkflowStudio
          agents={agents}
          capabilities={capabilities}
          workflows={workflows}
          initialAgentIds={agent?.id ? [agent.id] : []}
          onClose={() => setWorkflowManager(false)}
          onChanged={refreshWorkflows}
          onApplied={(workflow, agentIds) => {
            if (agent?.id && agentIds.includes(agent.id))
              config({
                workflow_ids: [
                  ...new Set([...chosenWorkflows, workflow.id]),
                ].slice(0, 20),
              });
          }}
        />
      )}
    </>
  );
}
