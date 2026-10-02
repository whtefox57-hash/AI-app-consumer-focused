"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Newspaper,
  Plus,
  Search,
  Sparkles,
  Sun,
  Table2,
  Trash2,
  Video,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { api } from "@/lib/browser-db";
import type { Agent, Boot, Workflow } from "@/lib/types";
import "./workflow-studio.css";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  kind: Workflow["kind"];
  category: "Everyday" | "Visual thinking" | "Create";
  output: string;
  icon:
    "sun" | "table" | "diagram" | "news" | "file" | "code" | "image" | "video";
  steps: { title: string; instructions: string }[];
};

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "morning-brief",
    name: "Morning brief",
    category: "Everyday",
    kind: "text",
    icon: "sun",
    description:
      "Start with what matters, a short agenda, and your next useful step.",
    output: "Structured text",
    steps: [
      {
        title: "Gather context",
        instructions:
          "Use only this conversation, permitted memories, project summary, and attached documents. Identify the user's stated goals, deadlines, and unanswered questions. Do not claim to have checked email, calendars, the weather, or current news.",
      },
      {
        title: "Write the brief",
        instructions:
          "Create a concise morning brief with: today's focus, three priorities, anything waiting on the user, and one achievable next step. If deadlines or current facts are unknown, say so. Cite supplied sources where available.",
      },
    ],
  },
  {
    id: "comparison-table",
    name: "Clear comparisons",
    category: "Everyday",
    kind: "text",
    icon: "table",
    description: "Turn a messy decision into a useful comparison table.",
    output: "Markdown table",
    steps: [
      {
        title: "Choose criteria",
        instructions:
          "Identify the options and the decision criteria from the user's request. Separate verified facts, user preferences, and unknowns. Never invent specifications or prices.",
      },
      {
        title: "Compare and recommend",
        instructions:
          "Produce a compact Markdown table comparing each option against the criteria. Add the biggest tradeoff and a recommendation that follows from the available evidence. Mark missing values as unknown.",
      },
    ],
  },
  {
    id: "document-style",
    name: "Well-made documents",
    category: "Everyday",
    kind: "text",
    icon: "file",
    description:
      "Give proposals, notes, and reports a consistent, readable structure.",
    output: "Markdown document",
    steps: [
      {
        title: "Establish the brief",
        instructions:
          "Identify the document's audience, purpose, and available source material. Preserve names, figures, and quotations accurately. Ask one focused question only if essential information is missing.",
      },
      {
        title: "Draft the document",
        instructions:
          "Write a polished Markdown document with a meaningful title, short opening, logically ordered sections, and concrete next steps when appropriate. Cite provided sources and flag assumptions. Do not claim to create or export a binary Word or PDF file.",
      },
    ],
  },
  {
    id: "diagram",
    name: "Explain with a diagram",
    category: "Visual thinking",
    kind: "text",
    icon: "diagram",
    description: "Make systems and processes easier to understand.",
    output: "Mermaid code + explanation",
    steps: [
      {
        title: "Find the structure",
        instructions:
          "Identify the real entities, relationships, and sequence in the user's material. Keep the diagram focused and avoid adding unsupported connections.",
      },
      {
        title: "Write the diagram",
        instructions:
          "Return valid Mermaid diagram source in a fenced mermaid code block followed by a plain-language explanation. Use a flowchart or sequence diagram as appropriate. Explain that the output is diagram source if a renderer is unavailable.",
      },
    ],
  },
  {
    id: "charts",
    name: "Charts & graphs",
    category: "Visual thinking",
    kind: "text",
    icon: "table",
    description:
      "Choose the right chart and prepare honest data and plotting code.",
    output: "Chart plan + plotting code",
    steps: [
      {
        title: "Check the data",
        instructions:
          "Use only supplied quantitative data. Check units, missing values, and whether a 2D or 3D visualization serves the question. Never fabricate measurements or add perspective that distorts comparisons.",
      },
      {
        title: "Prepare the visualization",
        instructions:
          "Describe the most suitable chart and return reusable plotting code or a Vega-Lite specification based on the provided data. Include accessible labels and a brief explanation. Do not claim the chart has been rendered or exported.",
      },
    ],
  },
  {
    id: "newspaper",
    name: "Newspaper style",
    category: "Visual thinking",
    kind: "text",
    icon: "news",
    description:
      "A sharp headline, a clear lead, and the context behind the story.",
    output: "Editorial text layout",
    steps: [
      {
        title: "Verify the story",
        instructions:
          "Find the central story in the provided material. Distinguish established facts from claims and interpretations. Use dates and source attribution when provided; never invent current reporting.",
      },
      {
        title: "Lay out the edition",
        instructions:
          "Write a newspaper-style Markdown edition: headline, deck, lead paragraph, concise body, a context sidebar, and sources. Avoid sensationalism and invented quotations. This is a text layout, not an image or rendered newspaper.",
      },
    ],
  },
  {
    id: "infographic",
    name: "Infographic blueprint",
    category: "Visual thinking",
    kind: "text",
    icon: "diagram",
    description:
      "A visual story, with the facts and layout ready for a designer.",
    output: "Copy + design instructions",
    steps: [
      {
        title: "Select the story",
        instructions:
          "Choose one core takeaway from the user's evidence. Identify a small set of supporting facts and check that every number has a source.",
      },
      {
        title: "Plan the layout",
        instructions:
          "Prepare concise infographic copy, section order, visual hierarchy, suggested icons, colors, and source notes. Include alt text. Clearly identify the output as a design blueprint, not a generated image.",
      },
    ],
  },
  {
    id: "website",
    name: "Sites & apps",
    category: "Create",
    kind: "text",
    icon: "code",
    description:
      "Turn a product idea into a useful specification and starter code.",
    output: "Specification + source code",
    steps: [
      {
        title: "Define the experience",
        instructions:
          "Identify the intended user, the task the site or app solves, the necessary screens, and a small workable scope. Include accessibility and mobile behavior.",
      },
      {
        title: "Prepare the build",
        instructions:
          "Write a concise implementation plan and relevant starter source code for the requested stack. Mark any integrations, credentials, or hosting steps required. Never claim to have run, tested, deployed, or published generated code.",
      },
    ],
  },
  {
    id: "image-generation",
    name: "Image generation",
    category: "Create",
    kind: "image",
    icon: "image",
    description: "Save your visual brief for a connected image service.",
    output: "Image service required",
    steps: [
      {
        title: "Build the visual brief",
        instructions:
          "Create a visual brief describing subject, composition, style, light, palette, aspect ratio, and intended use. Preserve user-provided requirements.",
      },
      {
        title: "Generate with a provider",
        instructions:
          "Send the approved brief to a connected image-generation provider. This step cannot execute until that provider is connected.",
      },
    ],
  },
  {
    id: "video-generation",
    name: "Video generation",
    category: "Create",
    kind: "video",
    icon: "video",
    description: "A repeatable storyboard for a connected video service.",
    output: "Video service required",
    steps: [
      {
        title: "Storyboard",
        instructions:
          "Define duration, scenes, camera motion, visual continuity, dialogue or captions, and the intended audience. Do not add copyrighted music without permission.",
      },
      {
        title: "Generate with a provider",
        instructions:
          "Generate and assemble the approved storyboard using a connected video-generation provider. This step cannot execute until that provider is connected.",
      },
    ],
  },
  {
    id: "meme",
    name: "Custom memes",
    category: "Create",
    kind: "text",
    icon: "image",
    description: "Find the joke and write the caption and visual brief.",
    output: "Captions + image brief",
    steps: [
      {
        title: "Find the joke",
        instructions:
          "Use the user's topic, audience, and tone to suggest three original, concise meme concepts. Avoid personal harassment and unsupported factual allegations.",
      },
      {
        title: "Package the concept",
        instructions:
          "For the strongest concept, provide top and bottom captions, a visual description, and alt text. Identify this as meme copy and a visual brief; no image has been generated.",
      },
    ],
  },
  {
    id: "gif",
    name: "Custom GIFs",
    category: "Create",
    kind: "video",
    icon: "video",
    description: "Plan an expressive loop for a connected media service.",
    output: "Video service required",
    steps: [
      {
        title: "Plan the loop",
        instructions:
          "Describe a short seamless loop, expression, motion, framing, frame timing, and any caption. Make it legible at small sizes.",
      },
      {
        title: "Render the GIF",
        instructions:
          "Render and export the loop with a connected media provider. This step cannot execute until that provider is connected.",
      },
    ],
  },
  {
    id: "sticker",
    name: "Custom stickers",
    category: "Create",
    kind: "image",
    icon: "image",
    description: "Keep a character's look consistent across a sticker set.",
    output: "Image service required",
    steps: [
      {
        title: "Define the set",
        instructions:
          "Create a consistent character brief and a set of distinct expressions. Specify a transparent background, a clear silhouette, and readable details at small sizes.",
      },
      {
        title: "Generate the stickers",
        instructions:
          "Generate the sticker set with a connected image provider and preserve character consistency. This step cannot execute until that provider is connected.",
      },
    ],
  },
];

const templateIcons = {
  sun: Sun,
  table: Table2,
  diagram: Layers3,
  news: Newspaper,
  file: FileText,
  code: Code2,
  image: ImageIcon,
  video: Video,
};

export function WorkflowTemplateIcon({
  template,
  size = 20,
}: {
  template: WorkflowTemplate;
  size?: number;
}) {
  const Icon = templateIcons[template.icon];
  return <Icon size={size} aria-hidden="true" />;
}

export type WorkflowDraft = Pick<
  Workflow,
  "name" | "description" | "kind" | "steps" | "enabled"
> & { id?: string };

export function workflowFromTemplate(
  template: WorkflowTemplate,
): WorkflowDraft {
  return {
    name: template.name,
    description: template.description,
    kind: template.kind,
    steps: template.steps.map((step) => ({ ...step, id: crypto.randomUUID() })),
    enabled: template.kind === "text",
  };
}

export type WorkflowStudioProps = {
  agents: Agent[];
  capabilities: Boot["capabilities"];
  workflows?: Workflow[];
  initialAgentIds?: string[];
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
  onApplied?: (workflow: Workflow, agentIds: string[]) => void | Promise<void>;
};

export function WorkflowStudio({
  agents,
  capabilities,
  workflows,
  initialAgentIds = [],
  onClose,
  onChanged,
  onApplied,
}: WorkflowStudioProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<Workflow[]>(workflows ?? []);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [chosenAgents, setChosenAgents] = useState(initialAgentIds);
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!workflows);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const liveAgents = agents.filter((agent) => !agent.archived);
  const dirty = !!draft && JSON.stringify(draft) !== savedDraft;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    api<Workflow[]>("workflows")
      .then((value) => {
        if (active) setLibrary(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load workflows.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectWorkflow(value: WorkflowDraft, saved = false) {
    setDraft(value);
    setSavedDraft(saved ? JSON.stringify(value) : "");
    setError("");
    setNotice("");
    setDeleteConfirm(false);
  }

  function update(value: Partial<WorkflowDraft>) {
    setDraft((old) => (old ? { ...old, ...value } : old));
    setNotice("");
    setDeleteConfirm(false);
  }

  async function saveDraft() {
    if (!draft) throw new Error("Choose a workflow first.");
    const { id, ...body } = draft;
    const value = await api<Workflow>(id ? `workflows/${id}` : "workflows", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({
        ...body,
        name: body.name.trim(),
        enabled: body.kind === "text" && body.enabled,
      }),
    });
    const next = {
      id: value.id,
      name: value.name,
      description: value.description,
      kind: value.kind,
      steps: value.steps,
      enabled: value.enabled,
    };
    setDraft(next);
    setSavedDraft(JSON.stringify(next));
    setLibrary((old) => [value, ...old.filter((item) => item.id !== value.id)]);
    await onChanged?.();
    return value;
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyWorkflow() {
    if (!draft) return;
    if (!applyAll && !chosenAgents.length) {
      setError("Choose at least one agent.");
      return;
    }
    await perform(async () => {
      const value =
        dirty || !draft.id
          ? await saveDraft()
          : library.find((item) => item.id === draft.id);
      if (!value) throw new Error("Save the workflow before applying it.");
      await api(`workflows/${value.id}/apply`, {
        method: "POST",
        body: JSON.stringify({
          applyToAll: applyAll,
          agentIds: applyAll ? undefined : chosenAgents,
        }),
      });
      const ids = applyAll ? liveAgents.map((agent) => agent.id) : chosenAgents;
      await onChanged?.();
      await onApplied?.(value, ids);
      setNotice(
        `${value.name} applied to ${ids.length} ${ids.length === 1 ? "agent" : "agents"}. Their identities and personal memories are preserved.`,
      );
    });
  }

  function moveStep(index: number, direction: -1 | 1) {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    update({ steps });
  }

  function exportWorkflow() {
    if (!draft) return;
    const { id: _id, ...portable } = draft;
    const blob = new Blob(
      [
        JSON.stringify(
          { format: "cast.workflow.v1", workflow: portable },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "workflow"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Workflow exported. The file contains the current instructions.");
  }

  async function importWorkflow(file: File) {
    setError("");
    try {
      if (file.size > 100000)
        throw new Error("Choose a workflow JSON file under 100 KB.");
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || !("workflow" in value))
        throw new Error("Choose a file exported from the workflow studio.");
      const data = (value as { workflow: unknown }).workflow;
      if (!data || typeof data !== "object")
        throw new Error("The workflow file is invalid.");
      const item = data as Record<string, unknown>;
      if (
        typeof item.name !== "string" ||
        item.name.length > 100 ||
        typeof item.description !== "string" ||
        item.description.length > 1000 ||
        !["text", "image", "video"].includes(String(item.kind)) ||
        !Array.isArray(item.steps) ||
        item.steps.length < 1 ||
        item.steps.length > 8
      )
        throw new Error(
          "The workflow file has unsupported fields or too many steps.",
        );
      const steps = item.steps.map((raw: unknown) => {
        if (!raw || typeof raw !== "object")
          throw new Error("A workflow step is invalid.");
        const step = raw as Record<string, unknown>;
        if (
          typeof step.title !== "string" ||
          !step.title.trim() ||
          step.title.length > 100 ||
          typeof step.instructions !== "string" ||
          !step.instructions.trim() ||
          step.instructions.length > 2000
        )
          throw new Error(
            "Each step needs a title and instructions within the supported limits.",
          );
        return {
          id: crypto.randomUUID(),
          title: step.title,
          instructions: step.instructions,
        };
      });
      selectWorkflow({
        name: item.name,
        description: item.description,
        kind: item.kind as Workflow["kind"],
        enabled: item.kind === "text" && item.enabled === true,
        steps,
      });
      setNotice(
        "Workflow imported. Review the steps and save it to your library.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to import this workflow.",
      );
    }
  }

  const needle = query.trim().toLowerCase();
  const filteredLibrary = library.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(needle),
  );
  const filteredTemplates = workflowTemplates.filter(
    (template) =>
      (category === "All" || template.category === category) &&
      `${template.name} ${template.description}`.toLowerCase().includes(needle),
  );

  return (
    <dialog
      ref={dialog}
      className="workflow-dialog"
      aria-labelledby="workflow-title"
      onCancel={onClose}
    >
      <header className="workflow-head">
        <div className="workflow-heading-icon">
          <WorkflowIcon size={24} />
        </div>
        <div>
          <span className="workflow-eyebrow">MAKE GOOD WORK REPEATABLE</span>
          <h2 id="workflow-title">Workflow studio</h2>
        </div>
        <button
          className="workflow-icon-button workflow-close"
          aria-label="Close workflow studio"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="workflow-layout">
        <aside className="workflow-library" aria-label="Workflow library">
          <label className="workflow-search">
            <Search size={17} />
            <input
              aria-label="Search workflows and templates"
              placeholder="Find a workflow…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="workflow-new"
            disabled={busy}
            onClick={() =>
              selectWorkflow({
                name: "My workflow",
                description: "",
                kind: "text",
                enabled: true,
                steps: [
                  {
                    id: crypto.randomUUID(),
                    title: "First step",
                    instructions: "",
                  },
                ],
              })
            }
          >
            <Plus size={17} />
            Create a workflow
          </button>
          <div className="workflow-library-label">
            <span>Your library</span>
            <span>{library.length}</span>
          </div>
          {loading ? (
            <p className="workflow-muted">
              <Loader2 size={16} className="workflow-spinning" />
              Loading your workflows…
            </p>
          ) : filteredLibrary.length ? (
            filteredLibrary.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                className={`workflow-library-item ${draft?.id === item.id ? "workflow-selected" : ""}`}
                onClick={() =>
                  selectWorkflow(
                    {
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      kind: item.kind,
                      steps: item.steps,
                      enabled: item.enabled,
                    },
                    true,
                  )
                }
              >
                {item.kind === "text" ? (
                  <FileText size={18} />
                ) : item.kind === "image" ? (
                  <ImageIcon size={18} />
                ) : (
                  <Video size={18} />
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind !== "text"
                      ? "Connector required"
                      : item.enabled
                        ? `${item.steps.length} steps · Active`
                        : "Paused"}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <p className="workflow-empty-note">
              {query
                ? "No matching saved workflows."
                : "Your saved workflows will live here. Start with a template or make your own."}
            </p>
          )}
          <button
            className="workflow-text-button"
            disabled={busy}
            onClick={() => importInput.current?.click()}
          >
            <Download size={16} />
            Import a workflow
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="workflow-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importWorkflow(file);
              event.target.value = "";
            }}
          />
          <div className="workflow-library-bottom">
            <BookOpen size={18} />
            <p>
              Workflows guide your agents' replies. Saving a template does not
              create a scheduled task.
            </p>
          </div>
        </aside>
        <main className="workflow-main">
          {error && (
            <div className="workflow-alert" role="alert">
              {error}
              <button
                aria-label="Dismiss workflow error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="workflow-notice" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {!draft ? (
            <>
              <div className="workflow-hero">
                <span className="workflow-hero-icon">
                  <Sparkles size={26} />
                </span>
                <span className="workflow-eyebrow">
                  A LITTLE STRUCTURE. BETTER RESULTS.
                </span>
                <h3>
                  Your next good idea,
                  <br />
                  with a head start.
                </h3>
                <p>
                  Choose a starting point. Make it yours. Give your cast a way
                  of working that you can use again.
                </p>
              </div>
              <div className="workflow-gallery-head">
                <h3>Start with a template</h3>
                <div
                  className="workflow-category"
                  aria-label="Filter template categories"
                >
                  {["All", "Everyday", "Visual thinking", "Create"].map(
                    (item) => (
                      <button
                        key={item}
                        aria-pressed={category === item}
                        className={
                          category === item ? "workflow-active-category" : ""
                        }
                        onClick={() => setCategory(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="workflow-template-grid">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    className="workflow-template-card"
                    onClick={() =>
                      selectWorkflow(workflowFromTemplate(template))
                    }
                  >
                    <span
                      className={`workflow-template-icon ${template.kind !== "text" ? "workflow-template-unconnected" : ""}`}
                    >
                      <WorkflowTemplateIcon template={template} />
                    </span>
                    <strong>{template.name}</strong>
                    <p>{template.description}</p>
                    <span className="workflow-output">
                      {template.output}
                      <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
              {!filteredTemplates.length && (
                <p className="workflow-empty-note">
                  No templates match your search.
                </p>
              )}
            </>
          ) : (
            <form
              className="workflow-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  await saveDraft();
                  setNotice("Workflow saved to your library.");
                });
              }}
            >
              <div className="workflow-editor-top">
                <button
                  type="button"
                  className="workflow-text-button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setDeleteConfirm(false);
                  }}
                >
                  ← Templates
                </button>
                <span className="workflow-status">
                  {draft.id
                    ? dirty
                      ? "Unsaved changes"
                      : "Saved in your library"
                    : "New workflow"}
                </span>
              </div>
              <fieldset className="workflow-fields" disabled={busy}>
                <label className="workflow-field">
                  Workflow name
                  <input
                    required
                    maxLength={100}
                    value={draft.name}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </label>
                <label className="workflow-field">
                  What should it help with?
                  <textarea
                    rows={2}
                    maxLength={1000}
                    placeholder="Describe the outcome and when to use this workflow."
                    value={draft.description}
                    onChange={(event) =>
                      update({ description: event.target.value })
                    }
                  />
                </label>
                <div className="workflow-two-column">
                  <label className="workflow-field">
                    Output
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        update({
                          kind: event.target.value as Workflow["kind"],
                          enabled: event.target.value === "text",
                        })
                      }
                    >
                      <option value="text">Text, plans, or source code</option>
                      <option value="image">
                        Generated image · connector required
                      </option>
                      <option value="video">
                        Generated video · connector required
                      </option>
                    </select>
                  </label>
                  <label className="workflow-toggle">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={draft.kind !== "text"}
                      onChange={(event) =>
                        update({ enabled: event.target.checked })
                      }
                    />
                    <span>
                      <strong>Use with agents</strong>
                      <small>
                        {draft.kind === "text"
                          ? "Include this plan in their replies"
                          : "Available after a media service is connected"}
                      </small>
                    </span>
                  </label>
                </div>
                {draft.kind !== "text" ? (
                  <p className="workflow-connection-note">
                    <WorkflowIcon size={18} />
                    You can save and edit this plan.{" "}
                    {draft.kind === "image" ? "Image" : "Video"} generation
                    needs a connected service, so this workflow stays paused.
                  </p>
                ) : !capabilities.ai ? (
                  <p className="workflow-connection-note">
                    <Sparkles size={18} />
                    Save and assign your workflow now. Agents can run its text
                    instructions when the AI connection is ready.
                  </p>
                ) : (
                  <p className="workflow-instruction-note">
                    These steps guide one text reply per responding agent. They
                    do not automatically run tools, render media, or publish a
                    site.
                  </p>
                )}
                <div className="workflow-step-heading">
                  <h3>The steps</h3>
                  <span>{draft.steps.length} / 8</span>
                </div>
                <ol className="workflow-steps">
                  {draft.steps.map((step, index) => (
                    <li className="workflow-step" key={step.id}>
                      <span className="workflow-step-number">{index + 1}</span>
                      <div className="workflow-step-body">
                        <label className="workflow-field">
                          Step title
                          <input
                            required
                            maxLength={100}
                            value={step.title}
                            onChange={(event) =>
                              update({
                                steps: draft.steps.map((item) =>
                                  item.id === step.id
                                    ? { ...item, title: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="workflow-field">
                          Instructions
                          <textarea
                            required
                            rows={3}
                            maxLength={2000}
                            placeholder="Tell the agent what to do, what to use, and how to present the result."
                            value={step.instructions}
                            onChange={(event) =>
                              update({
                                steps: draft.steps.map((item) =>
                                  item.id === step.id
                                    ? {
                                        ...item,
                                        instructions: event.target.value,
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="workflow-step-tools">
                        <button
                          type="button"
                          className="workflow-icon-button"
                          disabled={index === 0}
                          aria-label={`Move step ${index + 1} up`}
                          onClick={() => moveStep(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="workflow-icon-button"
                          disabled={index === draft.steps.length - 1}
                          aria-label={`Move step ${index + 1} down`}
                          onClick={() => moveStep(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          className="workflow-icon-button"
                          disabled={draft.steps.length === 1}
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() =>
                            update({
                              steps: draft.steps.filter(
                                (item) => item.id !== step.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="workflow-add-step"
                  disabled={draft.steps.length >= 8}
                  onClick={() =>
                    update({
                      steps: [
                        ...draft.steps,
                        {
                          id: crypto.randomUUID(),
                          title: "",
                          instructions: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Add a step
                </button>
              </fieldset>
              <section
                className="workflow-apply"
                aria-labelledby="workflow-apply-title"
              >
                <div>
                  <h3 id="workflow-apply-title">Give it to your cast</h3>
                  <p>
                    Agents use assigned workflows when their steps fit your
                    request.
                  </p>
                </div>
                <label className="workflow-toggle">
                  <input
                    type="checkbox"
                    checked={applyAll}
                    disabled={busy}
                    onChange={(event) => setApplyAll(event.target.checked)}
                  />
                  <span>
                    <strong>Apply to all my agents</strong>
                    <small>Preserve each agent's identity and memory</small>
                  </span>
                </label>
                {!applyAll && (
                  <div className="workflow-agent-picker">
                    {liveAgents.map((agent) => (
                      <label
                        key={agent.id}
                        className={`workflow-agent-choice ${chosenAgents.includes(agent.id) ? "workflow-agent-chosen" : ""}`}
                      >
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={chosenAgents.includes(agent.id)}
                          onChange={(event) =>
                            setChosenAgents((old) =>
                              event.target.checked
                                ? [...old, agent.id]
                                : old.filter((id) => id !== agent.id),
                            )
                          }
                        />
                        <span className="workflow-agent-dot" />
                        {agent.name}
                        {chosenAgents.includes(agent.id) && <Check size={14} />}
                      </label>
                    ))}
                    {!liveAgents.length && (
                      <p className="workflow-empty-note">
                        Create an agent before applying a workflow.
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="workflow-apply-button"
                  disabled={
                    busy ||
                    draft.kind !== "text" ||
                    !draft.enabled ||
                    !liveAgents.length ||
                    (!applyAll && !chosenAgents.length)
                  }
                  onClick={() => {
                    const form = dialog.current?.querySelector("form");
                    if (form?.reportValidity()) void applyWorkflow();
                  }}
                >
                  <Check size={17} />
                  {dirty || !draft.id
                    ? "Save & apply workflow"
                    : "Apply workflow"}
                </button>
              </section>
              <footer className="workflow-editor-footer">
                <div className="workflow-footer-tools">
                  <button
                    type="button"
                    className="workflow-text-button"
                    disabled={busy}
                    onClick={exportWorkflow}
                  >
                    <Download size={16} />
                    Export
                  </button>
                  {draft.id && (
                    <button
                      type="button"
                      className="workflow-text-button workflow-danger"
                      disabled={busy}
                      onClick={() => setDeleteConfirm((old) => !old)}
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  )}
                </div>
                <button
                  className="workflow-primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 size={17} className="workflow-spinning" />
                  ) : (
                    <Check size={17} />
                  )}
                  Save workflow
                </button>
              </footer>
              {deleteConfirm && (
                <div className="workflow-delete-confirm" role="alert">
                  <p>
                    Delete this workflow? It will be removed from your library
                    and your agents.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="workflow-danger"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await api(`workflows/${draft.id}`, {
                          method: "DELETE",
                        });
                        setLibrary((old) =>
                          old.filter((item) => item.id !== draft.id),
                        );
                        setDraft(null);
                        setDeleteConfirm(false);
                        await onChanged?.();
                        setNotice("Workflow deleted.");
                      })
                    }
                  >
                    Delete workflow
                  </button>
                </div>
              )}
            </form>
          )}
        </main>
      </div>
    </dialog>
  );
}
