"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Plus,
  Settings,
  Inbox,
  Folder,
  ChevronDown,
  Copy,
  RotateCcw,
  X,
  MoreHorizontal,
  FileText,
  LogOut,
  Archive,
  Trash2,
  Check,
  Headphones,
  Loader2,
  PanelLeft,
  Download,
  Shield,
} from "lucide-react";
import { api, browserDb } from "@/lib/browser-db";
import { presets, voices } from "@/lib/presets";
import type { Agent, Boot, Job, Project } from "@/lib/types";
import { Voice } from "./voice";
function Avatar({
  agent,
  size = "normal",
}: {
  agent: Pick<Agent, "avatar" | "name">;
  size?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (agent.avatar.includes("/"))
      api<{ url: string }>(`files?path=${encodeURIComponent(agent.avatar)}`)
        .then((v) => setUrl(v.url))
        .catch(() => setUrl(""));
  }, [agent.avatar]);
  return (
    <span
      className={`avatar ${agent.avatar.includes("/") ? "amber" : agent.avatar} ${size}`}
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <svg viewBox="0 0 64 64">
          <ellipse
            cx="32"
            cy="32"
            rx="22"
            ry="24"
            fill="currentColor"
            opacity=".35"
          />
          <path d="M14 23Q32 3 50 23L45 17Q32 10 19 17Z" fill="currentColor" />
          <path
            d="M23 30h3m12 0h3"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M26 42Q32 47 38 42"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path d="M16 60Q32 42 48 60" fill="currentColor" opacity=".6" />
        </svg>
      )}
    </span>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="dialog">
      <div className="dialog-head">
        <h2>{title}</h2>
        <button onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Cast({ configured }: { configured: boolean }) {
  const [data, setData] = useState<Boot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [panel, setPanel] = useState("");
  const [edit, setEdit] = useState<Agent | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [strong, setStrong] = useState(false);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState(false);
  const [archived, setArchived] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [music, setMusic] = useState<
    {
      id: number;
      track: string;
      artist: string;
      url: string;
      explanation: string;
      context: string;
    }[]
  >([]);
  const [history, setHistory] = useState<
    { id: string; status: string; error: string | null; created_at: string }[]
  >([]);
  const [owner, setOwner] = useState<{
    config: {
      ai_enabled: boolean;
      user_daily_limit: number;
      global_daily_limit: number;
    };
    usage: Boot["usage"];
    health: { configured: boolean; model: string };
  } | null>(null);
  const participantProject = useRef("");
  const abort = useRef<AbortController | null>(null);
  const turn = useRef("");
  const end = useRef<HTMLDivElement>(null);
  async function reload() {
    try {
      let value = await api<Boot>("boot");
      if (!value.profile.settings.onboarded) {
        await api("seed", { method: "POST" });
        value = await api<Boot>("boot");
      }
      setData(value);
      setSelected((old) =>
        value.projects.some((p) => p.id === old)
          ? old
          : value.projects.find(
              (p) => p.id === value.profile.settings.activeProjectId,
            )?.id ||
            value.projects.find((p) => !p.archived)?.id ||
            "",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to load Cast.";
      if (!message.includes("Sign in")) setError(message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).has("authError"))
      setError(
        "This sign-in link could not be verified. Request a new link and try again.",
      );
    if (configured) void reload();
    else setLoading(false);
  }, [configured]);
  useEffect(() => {
    if (data && selected)
      void api("selection", {
        method: "POST",
        body: JSON.stringify({ projectId: selected }),
      }).catch((e) => setError(e.message));
  }, [selected, data?.user.id]);
  useEffect(() => {
    end.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [data?.messages.length, selected, busy]);
  const project = data?.projects.find((p) => p.id === selected);
  const members =
    data?.memberships
      .filter((m) => m.project_id === selected)
      .map((m) => m.agent_id) || [];
  const agents = data?.agents.filter((a) => !a.archived) || [];
  const active = agents.filter((a) => members.includes(a.id));
  const messages = (
    data?.messages.filter((m) => m.project_id === selected) || []
  ).sort((a, b) => a.created_at.localeCompare(b.created_at));
  useEffect(() => {
    if (participantProject.current !== selected) {
      participantProject.current = selected;
      setParticipants(active.length ? [active[0].id] : []);
    } else
      setParticipants((old) => {
        const kept = old.filter((id) => active.some((a) => a.id === id));
        return kept.length ? kept : active.length ? [active[0].id] : [];
      });
    if (selected)
      void api<Boot["messages"]>(`messages?projectId=${selected}`)
        .then((rows) =>
          setData((old) =>
            old
              ? {
                  ...old,
                  messages: [
                    ...old.messages.filter((m) => m.project_id !== selected),
                    ...rows,
                  ],
                }
              : old,
          ),
        )
        .catch((e) => setError(e.message));
  }, [selected, data?.memberships.length]);
  async function action(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "This action failed.");
    }
  }
  async function send(value = text): Promise<string> {
    if (!project) throw new Error("Create a project first.");
    if (!participants.length)
      throw new Error("Invite and select an agent first.");
    if (busy) throw new Error("Wait for the current response.");
    setBusy(true);
    setError("");
    setText("");
    turn.current = crypto.randomUUID();
    abort.current = new AbortController();
    try {
      setPartial({});
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          projectId: selected,
          agentIds: participants,
          text: value,
          requestId: turn.current,
          strong,
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error || "Response failed.");
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let replies: { content: string }[] = [];
      let completed = false;
      while (true) {
        const part = await reader.read();
        pending += decoder.decode(part.value, { stream: !part.done });
        let separator;
        while ((separator = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, separator);
          pending = pending.slice(separator + 2);
          if (!frame.startsWith("data: ")) continue;
          const event = JSON.parse(frame.slice(6));
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "delta")
            setPartial((old) => ({
              ...old,
              [event.agent]: (old[event.agent] || "") + event.text,
            }));
          if (event.type === "done") {
            replies = event.messages;
            completed = true;
          }
        }
        if (part.done) break;
      }
      if (!completed)
        throw new Error(
          "The connection ended before the response was saved. Retry your message.",
        );
      await reload();
      return replies.map((r) => r.content).join("\n\n");
    } catch (e) {
      await reload();
      const message =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Response cancelled."
            : e.message
          : "Response failed.";
      setError(message);
      setText(value);
      throw new Error(message);
    } finally {
      setBusy(false);
      setPartial({});
    }
  }
  async function cancel() {
    abort.current?.abort();
    await action(() =>
      api("cancel", {
        method: "POST",
        body: JSON.stringify({ requestId: turn.current }),
      }),
    );
  }
  async function membership(agentId: string, remove = false) {
    await action(() =>
      api("memberships", {
        method: remove ? "DELETE" : "POST",
        body: JSON.stringify({ project_id: selected, agent_id: agentId }),
      }),
    );
  }
  function createAgent() {
    setEdit({
      ...presets[0],
      id: "",
      user_id: data!.user.id,
      name: "New agent",
    });
    setPanel("agent");
  }
  async function upload(file: File, kind = "document") {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("projectId", selected);
    return await api<{ path?: string }>("files", {
      method: "POST",
      body: form,
    });
  }
  const alert = (
    <>
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
  if (loading)
    return (
      <main className="auth-wrap">
        <Loader2 className="spin" />
        <p>Opening your workspace…</p>
      </main>
    );
  if (!data)
    return (
      <main className="auth-wrap">
        <div className="auth-art">
          <div className="wordmark">
            cast<span>✳︎</span>
          </div>
          <span className="eyebrow">
            A LITTLE COMPANY. A LOT OF POSSIBILITY.
          </span>
          <h1>
            Good thinking
            <br />
            has company.
          </h1>
          <p>
            A researcher for the unknown.
            <br />
            An organizer for the everyday.
            <br />A cast that makes room for you.
          </p>
          <div className="orbit">
            {presets.slice(0, 5).map((a, i) => (
              <div
                key={a.name}
                style={{
                  transform: `rotate(${i * 72}deg) translate(115px) rotate(-${i * 72}deg)`,
                }}
              >
                <Avatar agent={a} />
              </div>
            ))}
            <span>✳︎</span>
          </div>
          <small>Every member of your cast is AI. Always.</small>
        </div>
        <form
          className="auth-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (!configured)
                throw new Error(
                  "Supabase account access is not configured yet. See the setup instructions.",
                );
              const form = new FormData(e.currentTarget);
              const email = String(form.get("email"));
              const password = String(form.get("password") || "");
              const db = browserDb();
              const { error } =
                authMode === "recover"
                  ? await db.auth.resetPasswordForEmail(email, {
                      redirectTo: `${location.origin}/auth/callback?reset=1`,
                    })
                  : authMode === "signup"
                    ? await db.auth.signUp({
                        email,
                        password,
                        options: {
                          emailRedirectTo: `${location.origin}/auth/callback`,
                        },
                      })
                    : await db.auth.signInWithPassword({ email, password });
              if (error) throw error;
              if (authMode === "recover")
                setNotice("Check your email for the password recovery link.");
              else if (authMode === "signup") {
                setNotice(
                  "If confirmation is enabled, check your email before signing in.",
                );
                await reload();
              } else await reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">YOUR OWN ROOM FOR IDEAS</span>
          <h2>
            {authMode === "signup"
              ? "Meet your cast."
              : authMode === "recover"
                ? "Find your way back."
                : "Welcome back."}
          </h2>
          <p>
            {authMode === "signup"
              ? "Create your private workspace."
              : "A familiar place for your next thought."}
          </p>
          {!configured && (
            <div className="setup-note">
              Accounts await Supabase configuration. No demo account or
              simulated AI is enabled.
            </div>
          )}
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          {authMode !== "recover" && (
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                minLength={10}
                required
                placeholder="At least 10 characters"
              />
            </label>
          )}
          <button className="primary" disabled={busy || !configured}>
            {busy
              ? "Please wait…"
              : authMode === "signup"
                ? "Create account"
                : authMode === "recover"
                  ? "Send recovery link"
                  : "Sign in"}{" "}
            <ArrowUp size={17} />
          </button>
          <div className="auth-links">
            <button
              type="button"
              onClick={() =>
                setAuthMode(authMode === "signup" ? "signin" : "signup")
              }
            >
              {authMode === "signup"
                ? "Already have an account?"
                : "Create an account"}
            </button>
            <button
              type="button"
              onClick={() =>
                setAuthMode(authMode === "recover" ? "signin" : "recover")
              }
            >
              {authMode === "recover" ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>
          <small>
            Private by default. You choose what each agent can access.
          </small>
        </form>
        {alert}
      </main>
    );
  return (
    <main className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="wordmark" href="/">
          cast<span>✳︎</span>
        </a>
        <div className="side-section">
          <span className="eyebrow">YOUR SPACE</span>
          <button
            className={panel === "inbox" ? "nav active" : "nav"}
            onClick={() => setPanel("inbox")}
          >
            <Inbox size={18} />
            Proactive inbox
            <span className="count">
              {data.inbox.filter((i) => !i.read).length}
            </span>
          </button>
          {data.capabilities.music && (
            <button className="nav" onClick={() => setPanel("music")}>
              <Headphones size={18} />A little music
            </button>
          )}
        </div>
        <div className="side-section projects">
          <div className="section-title">
            <span className="eyebrow">
              {archived ? "ARCHIVED PROJECTS" : "PROJECTS"}
            </span>
            <button
              onClick={() => setPanel("project-new")}
              aria-label="Create project"
            >
              <Plus size={16} />
            </button>
          </div>
          {data.projects
            .filter((p) => p.archived === archived)
            .map((p) => (
              <button
                key={p.id}
                className={`nav ${selected === p.id ? "active" : ""}`}
                onClick={() => {
                  setSelected(p.id);
                  setMenu(false);
                }}
              >
                <Folder size={17} />
                <span>{p.name}</span>
              </button>
            ))}
          {!data.projects.some((p) => p.archived === archived) && (
            <p className="muted small">A place for your next idea.</p>
          )}
          <button className="small-link" onClick={() => setArchived(!archived)}>
            <Archive size={14} />
            {archived ? "Active projects" : "View archive"}
          </button>
        </div>
        <div className="sidebar-foot">
          <div className="private-note">
            <Shield size={15} />
            <span>Your conversations are private.</span>
          </div>
          <button className="nav" onClick={() => setPanel("settings")}>
            <Settings size={18} />
            Settings & usage
          </button>
          <button className="profile" onClick={() => setPanel("settings")}>
            <span className="initial">
              {data.user.email?.[0]?.toUpperCase()}
            </span>
            <span>
              {data.user.email}
              <small>Personal workspace</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <PanelLeft size={20} />
          </button>
          <div className="breadcrumb">
            Your space <span>/</span>{" "}
            <b>{project?.name || "A new beginning"}</b>
          </div>
          <div className="top-actions">
            <span className="private-badge">
              <span />
              PRIVATE
            </span>
            <button aria-label="Open inbox" onClick={() => setPanel("inbox")}>
              <Inbox size={19} />
            </button>
            <button
              aria-label="Project options"
              onClick={() => setPanel("project-options")}
              disabled={!project}
            >
              <MoreHorizontal size={21} />
            </button>
          </div>
        </header>
        <div className="shelf">
          <div className="shelf-title">
            <span className="eyebrow">YOUR CAST</span>
            <span>Different minds. Shared possibilities.</span>
            <button onClick={createAgent}>
              <Plus size={14} /> Create agent
            </button>
          </div>
          <div className="agent-row">
            {agents.map((a) => (
              <div
                draggable
                key={a.id}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                className="agent-tile"
              >
                <button
                  className="agent-face"
                  aria-label={`Talk with ${a.name}`}
                  onClick={() =>
                    void action(async () => {
                      if (!project) throw new Error("Create a project first.");
                      if (
                        a.project_scope.length &&
                        !a.project_scope.includes(selected)
                      )
                        throw new Error(
                          "This agent is restricted to other projects. Edit its access scope first.",
                        );
                      if (!members.includes(a.id))
                        await api("memberships", {
                          method: "POST",
                          body: JSON.stringify({
                            project_id: selected,
                            agent_id: a.id,
                          }),
                        });
                      setParticipants([a.id]);
                    })
                  }
                >
                  <Avatar agent={a} />
                </button>
                <button
                  className="agent-name"
                  aria-label={`Edit ${a.name}`}
                  onClick={() => {
                    setEdit(a);
                    setPanel("agent");
                  }}
                >
                  <b>{a.name}</b>
                </button>
                <span>AI · {a.expertise.split(",")[0].slice(0, 23)}</span>
              </div>
            ))}
            <button className="agent-tile add-agent" onClick={createAgent}>
              <span className="avatar">
                <Plus size={25} />
              </span>
              <b>Make someone new</b>
              <span>Your idea, their perspective.</span>
            </button>
          </div>
        </div>
        <div
          className="project-strip"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const agent = e.dataTransfer.getData("text/plain");
            if (project && agents.some((a) => a.id === agent))
              void membership(agent);
          }}
        >
          <div>
            <span className="eyebrow">IN THIS PROJECT</span>
            <div className="participants">
              {active.map((a) => (
                <button
                  key={a.id}
                  className={`participant ${participants.includes(a.id) ? "selected" : ""}`}
                  onClick={() =>
                    setParticipants((old) =>
                      old.includes(a.id)
                        ? old.filter((v) => v !== a.id)
                        : old.length < 3
                          ? [...old, a.id]
                          : old,
                    )
                  }
                  aria-pressed={participants.includes(a.id)}
                  title="Select responding agent"
                >
                  <Avatar agent={a} size="mini" />
                  {a.name}
                  {participants.includes(a.id) && <Check size={12} />}
                </button>
              ))}
              <button
                className="invite"
                disabled={!project || project.archived}
                onClick={() => setPanel("invite")}
              >
                <Plus size={15} />
                Invite
              </button>
            </div>
          </div>
          <button
            className="knowledge-button"
            onClick={() => setPanel("knowledge")}
            disabled={!project}
          >
            <FileText size={16} />
            Project knowledge
            <span>
              {data.documents.filter((d) => d.project_id === selected).length}
            </span>
          </button>
        </div>
        <div className="conversation">
          <div className="conversation-inner">
            {messages.length >= 100 && (
              <button
                className="small-link"
                onClick={() =>
                  void api<Boot["messages"]>(
                    `messages?projectId=${selected}&before=${encodeURIComponent(messages[0].created_at)}`,
                  )
                    .then((rows) => {
                      if (!rows.length)
                        setNotice(
                          "You’re at the beginning of this conversation.",
                        );
                      setData((old) =>
                        old
                          ? {
                              ...old,
                              messages: [
                                ...old.messages,
                                ...rows.filter(
                                  (m) =>
                                    !old.messages.some((o) => o.id === m.id),
                                ),
                              ],
                            }
                          : old,
                      );
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Load earlier messages
              </button>
            )}
            {!messages.length ? (
              <div className="welcome">
                <div className="spark">✳︎</div>
                <span className="eyebrow">ROOM TO THINK</span>
                <h1>
                  {project
                    ? "What’s on your mind?"
                    : "Make room for your next idea."}
                </h1>
                <p>
                  {project
                    ? "Bring a question, a half-formed idea, or something you want to untangle. Your cast is here to help."
                    : "Create a project, invite an agent, and begin a conversation that stays with you."}
                </p>
                {!project ? (
                  <button
                    className="primary"
                    onClick={() => setPanel("project-new")}
                  >
                    <Plus size={16} />
                    Create your first project
                  </button>
                ) : (
                  <div className="suggestions">
                    {[
                      "Help me think through an idea",
                      "Turn my goal into a plan",
                      "Look at this from a new angle",
                    ].map((s) => (
                      <button key={s} onClick={() => setText(s)}>
                        {s}
                        <ArrowUp size={15} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((m) => {
                const agent = data.agents.find((a) => a.id === m.agent_id);
                return (
                  <article className={`message ${m.role}`} key={m.id}>
                    {m.role === "assistant" && agent ? (
                      <Avatar agent={agent} size="small" />
                    ) : (
                      <span className="user-avatar">
                        {data.user.email?.[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="message-body">
                      <div className="message-meta">
                        <b>
                          {m.role === "assistant"
                            ? agent?.name || "Archived AI agent"
                            : "You"}
                        </b>
                        {m.role === "assistant" && <span>AI</span>}
                        <time>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="message-text">{m.content}</div>
                      {m.sources?.length > 0 && (
                        <div className="sources">
                          {m.sources.map((s) =>
                            s.url ? (
                              <a
                                href={s.url}
                                key={s.id}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {s.title} ↗
                              </a>
                            ) : (
                              <details key={s.id}>
                                <summary>
                                  {s.title} · source {s.id.split(":").at(-1)}
                                </summary>
                                {s.snippet}
                              </details>
                            ),
                          )}
                        </div>
                      )}
                      <div className="message-tools">
                        <button
                          aria-label="Copy response"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(m.content)
                              .then(() => setNotice("Copied."))
                              .catch(() =>
                                setError("Clipboard access was denied."),
                              )
                          }
                        >
                          <Copy size={13} />
                          Copy
                        </button>
                        {m.role === "user" && (
                          <button
                            disabled={busy}
                            onClick={() => void send(m.content).catch(() => {})}
                          >
                            <RotateCcw size={13} />
                            Retry
                          </button>
                        )}
                        {m.role === "assistant" && (
                          <button
                            onClick={() => {
                              const spoken = new SpeechSynthesisUtterance(
                                m.content,
                              );
                              window.speechSynthesis.speak(spoken);
                              setNotice(
                                "Playing with this device’s browser voice. Voices vary by device.",
                              );
                            }}
                          >
                            <Headphones size={13} />
                            Read aloud
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
            {busy &&
              Object.entries(partial).map(([agent, text]) => (
                <article className="message assistant" key={agent}>
                  <div className="message-body">
                    <div className="message-meta">
                      <b>{data.agents.find((a) => a.id === agent)?.name}</b>
                      <span>AI · responding</span>
                    </div>
                    <div className="message-text">{text}</div>
                  </div>
                </article>
              ))}
            {busy && (
              <div className="pending" role="status">
                <Loader2 className="spin" size={17} />
                Your cast is thinking. Replies are saved after each agent
                completes.
              </div>
            )}
            <div ref={end} />
          </div>
        </div>
        <footer className="composer-area">
          <div className="composer">
            <textarea
              aria-label="Message your cast"
              placeholder={
                project
                  ? "Say what you’re thinking…"
                  : "Create a project to get started…"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={12000}
              disabled={!project || project.archived}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) void send().catch(() => {});
                }
              }}
            />
            <div className="composer-tools">
              <Voice
                key={selected + participants.join(",")}
                enabled={
                  data.capabilities.speech &&
                  !!project &&
                  participants.length === 1 &&
                  !project.archived
                }
                voice={
                  active.find((a) => a.id === participants[0])?.voice || "Kore"
                }
                send={send}
                onError={setError}
              />
              <div>
                <label className="model-toggle">
                  <input
                    type="checkbox"
                    disabled={!data.capabilities.strong}
                    checked={strong}
                    onChange={(e) => setStrong(e.target.checked)}
                  />
                  Deeper thinking
                </label>
                {busy ? (
                  <button
                    className="send"
                    aria-label="Cancel response"
                    onClick={() => void cancel()}
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <button
                    className="send"
                    aria-label="Send message"
                    disabled={
                      !text.trim() || !participants.length || project?.archived
                    }
                    onClick={() => void send().catch(() => {})}
                  >
                    <ArrowUp size={19} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="composer-caption">
            <span>
              {participants.length > 1
                ? `${participants.length} agents · one turn each`
                : participants.length === 1
                  ? "One thoughtful reply at a time."
                  : "Invite an agent to begin."}
            </span>
            <span>AI can make mistakes. Check important details.</span>
          </div>
          {!data.capabilities.ai && (
            <p className="connection-note">
              AI awaits the owner’s billed provider configuration. Messages are
              never simulated.
            </p>
          )}
        </footer>
      </section>
      {alert}
      {panel === "project-new" && (
        <Dialog title="A home for an idea" close={() => setPanel("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name");
              void action(async () => {
                const p = await api<Project>("projects", {
                  method: "POST",
                  body: JSON.stringify({ name, archived: false }),
                });
                setSelected(p.id);
                setPanel("invite");
              });
            }}
          >
            <label>
              Project name
              <input
                autoFocus
                name="name"
                required
                maxLength={100}
                placeholder="The next chapter"
              />
            </label>
            <button className="primary">Create project</button>
          </form>
        </Dialog>
      )}
      {panel === "project-options" && project && (
        <Dialog title="Project settings" close={() => setPanel("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                api(`projects/${selected}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    ...project,
                    name: new FormData(e.currentTarget).get("name"),
                    summary: new FormData(e.currentTarget).get("summary"),
                  }),
                }),
              );
              setPanel("");
            }}
          >
            <label>
              Name
              <input
                name="name"
                defaultValue={project.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              Editable conversation summary
              <textarea
                name="summary"
                defaultValue={project.summary}
                maxLength={4000}
              />
              <small>
                This project memory is separate from personal agent memory.
                Clear it to delete it.
              </small>
            </label>
            <button className="primary">Save name</button>
            <button
              type="button"
              className="outline"
              onClick={() =>
                void action(async () => {
                  await api("summarize", {
                    method: "POST",
                    body: JSON.stringify({ projectId: selected }),
                  });
                  setNotice(
                    "Summary saved. Inspect or edit it in project settings.",
                  );
                  setPanel("");
                })
              }
            >
              Create a deliberate summary · 1 AI call
            </button>
          </form>
          <div className="actions">
            <button
              onClick={() =>
                void action(() =>
                  api(`projects/${selected}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      ...project,
                      archived: !project.archived,
                    }),
                  }),
                )
              }
            >
              <Archive size={16} />
              {project.archived ? "Restore" : "Archive"}
            </button>
            <button
              className="danger"
              onClick={() => {
                if (
                  confirm(
                    "Delete this project, its conversations, documents, and jobs?",
                  )
                )
                  void action(async () => {
                    await api(`projects/${selected}`, { method: "DELETE" });
                    setPanel("");
                  });
              }}
            >
              <Trash2 size={16} />
              Delete project
            </button>
          </div>
        </Dialog>
      )}
      {panel === "invite" && (
        <Dialog title="Bring your cast together" close={() => setPanel("")}>
          <p className="muted">
            Invite here, or drag an avatar from the shelf. Select up to three
            responding agents in the project bar.
          </p>
          <div className="invite-list">
            {agents.map((a) => (
              <div key={a.id}>
                <Avatar agent={a} size="small" />
                <div>
                  <b>{a.name}</b>
                  <small>{a.expertise}</small>
                </div>
                <button
                  className={members.includes(a.id) ? "outline" : "primary"}
                  onClick={() => void membership(a.id, members.includes(a.id))}
                >
                  {members.includes(a.id) ? "Remove" : "Invite"}
                </button>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {panel === "agent" && edit && (
        <Dialog
          title={edit.id ? edit.name : "Create an AI agent"}
          close={() => setPanel("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const saved = await api<Agent>(
                  edit.id ? `agents/${edit.id}` : "agents",
                  {
                    method: edit.id ? "PATCH" : "POST",
                    body: JSON.stringify(edit),
                  },
                );
                setEdit(saved);
                setNotice("Agent saved.");
              });
            }}
          >
            <div className="agent-editor-top">
              <Avatar agent={edit} />
              <label className="upload">
                Upload avatar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void action(async () => {
                        const v = await upload(file, "avatar");
                        setEdit({ ...edit, avatar: v.path! });
                      });
                  }}
                />
              </label>
              <div className="swatches">
                {["amber", "sage", "slate", "rose", "blue", "violet"].map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`${color} avatar`}
                      className={`swatch ${color}`}
                      onClick={() => setEdit({ ...edit, avatar: color })}
                    />
                  ),
                )}
              </div>
            </div>
            {(
              [
                "name",
                "personality",
                "worldview",
                "background",
                "expertise",
                "instructions",
                "memories",
              ] as const
            ).map((key) => (
              <label key={key}>
                {key === "worldview"
                  ? "Beliefs & worldview"
                  : key === "memories"
                    ? "Personal memory (editable)"
                    : key === "instructions"
                      ? "Working instructions"
                      : key[0].toUpperCase() + key.slice(1)}
                {key === "name" ? (
                  <input
                    value={edit[key]}
                    required
                    maxLength={100}
                    onChange={(e) =>
                      setEdit({ ...edit, [key]: e.target.value })
                    }
                  />
                ) : (
                  <textarea
                    value={edit[key]}
                    maxLength={key === "memories" ? 6000 : 2000}
                    onChange={(e) =>
                      setEdit({ ...edit, [key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
            <label>
              Assigned server voice
              <select
                value={edit.voice}
                onChange={(e) => setEdit({ ...edit, voice: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Explicit permissions</legend>
              {(["documents", "memory", "search", "scheduled"] as const).map(
                (key) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={edit.permissions[key]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          permissions: {
                            ...edit.permissions,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    {key === "documents"
                      ? "Read invited project documents"
                      : key === "memory"
                        ? "Use personal memory"
                        : key === "search"
                          ? "Use grounded search for enabled research jobs"
                          : "Generate enabled scheduled work"}
                  </label>
                ),
              )}
              <label>
                Project scope
                <select
                  multiple
                  value={edit.project_scope}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      project_scope: [...e.target.selectedOptions].map(
                        (o) => o.value,
                      ),
                    })
                  }
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <small>
                  No selection allows any project you explicitly invite this
                  agent into.
                </small>
              </label>
            </fieldset>
            <button className="primary">Save agent</button>
          </form>
          {edit.id && (
            <div className="actions wrap">
              <button
                onClick={() =>
                  void action(async () => {
                    const p = await api<Project>("projects", {
                      method: "POST",
                      body: JSON.stringify({
                        name: `Studio · ${edit.name}`,
                        archived: false,
                      }),
                    });
                    await api("memberships", {
                      method: "POST",
                      body: JSON.stringify({
                        project_id: p.id,
                        agent_id: edit.id,
                      }),
                    });
                    setSelected(p.id);
                    setPanel("");
                    setNotice(
                      "Studio created. Send a message to preview this agent with the real provider.",
                    );
                  })
                }
              >
                Open real preview
              </button>
              <button
                onClick={() =>
                  void action(() =>
                    api("agents", {
                      method: "POST",
                      body: JSON.stringify({
                        ...edit,
                        name: `${edit.name} copy`.slice(0, 100),
                      }),
                    }),
                  )
                }
              >
                Duplicate
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await api(`agents/${edit.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        ...edit,
                        archived: !edit.archived,
                      }),
                    });
                    setPanel("");
                  })
                }
              >
                {edit.archived ? "Restore" : "Archive"}
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm("Delete this agent and its personal memory?"))
                    void action(async () => {
                      await api(`agents/${edit.id}`, { method: "DELETE" });
                      setPanel("");
                    });
                }}
              >
                Delete
              </button>
            </div>
          )}
        </Dialog>
      )}
      {panel === "knowledge" && (
        <Dialog title="Project knowledge" close={() => setPanel("")}>
          <p className="muted">
            PDF with selectable text, TXT, and Markdown. 5 MB per file, 20
            documents per project. Scanned PDFs require OCR and are unsupported.
          </p>
          <label className="upload wide">
            {busy ? "Processing…" : "Upload a document"}
            <input
              disabled={busy}
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setBusy(true);
                  void action(() => upload(file)).finally(() => setBusy(false));
                }
              }}
            />
          </label>
          <div className="document-list">
            {data.documents
              .filter((d) => d.project_id === selected)
              .map((d) => (
                <div key={d.id}>
                  <FileText size={20} />
                  <div>
                    <b>{d.name}</b>
                    <small>
                      {d.status}
                      {d.error
                        ? ` · ${d.error}`
                        : ` · ${d.chunks.length} text sections`}
                    </small>
                    <details>
                      <summary>Inspect extracted text</summary>
                      <pre>{d.chunks.map((c) => c.text).join("\n\n")}</pre>
                    </details>
                    {d.storage_path && (
                      <button
                        className="small-link"
                        onClick={() =>
                          void action(async () => {
                            const file = await api<{ url: string }>(
                              `files?path=${encodeURIComponent(d.storage_path!)}`,
                            );
                            const response = await fetch(file.url);
                            if (!response.ok)
                              throw new Error(
                                "The original file could not be downloaded.",
                              );
                            const url = URL.createObjectURL(
                              await response.blob(),
                            );
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = d.name;
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          })
                        }
                      >
                        Download original
                      </button>
                    )}
                  </div>
                  <button
                    aria-label={`Delete ${d.name}`}
                    onClick={() =>
                      void action(() =>
                        api(`documents/${d.id}`, { method: "DELETE" }),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const target = e.currentTarget;
              void action(async () => {
                await api("notes", {
                  method: "POST",
                  body: JSON.stringify({
                    projectId: selected,
                    title: form.get("title"),
                    text: form.get("text"),
                  }),
                });
                target.reset();
              });
            }}
          >
            <h3>Leave a note</h3>
            <label>
              Title
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Note
              <textarea name="text" required maxLength={20000} />
            </label>
            <button className="primary">Save note</button>
          </form>
        </Dialog>
      )}
      {panel === "inbox" && (
        <Dialog title="A thought for later" close={() => setPanel("")}>
          <p className="muted">
            Work you explicitly enabled, delivered here even when the browser is
            closed. Push notifications are not connected.
          </p>
          <button className="outline" onClick={() => setPanel("job")}>
            <Plus size={15} />
            Schedule something
          </button>
          <div className="inbox-list">
            {!data.inbox.length && (
              <div className="empty-card">
                Nothing waiting. Good things can take their time.
              </div>
            )}
            {data.inbox.map((i) => (
              <article key={i.id}>
                <small>{new Date(i.created_at).toLocaleString()}</small>
                <h3>{i.title}</h3>
                <p className="message-text">{i.body}</p>
                <small>{i.why}</small>
                {i.sources.map(
                  (s) =>
                    s.url && (
                      <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.title} ↗
                      </a>
                    ),
                )}
                {!i.read && (
                  <button
                    className="small-link"
                    onClick={() =>
                      void action(() =>
                        api(`inbox/${i.id}`, { method: "PATCH" }),
                      )
                    }
                  >
                    Mark read
                  </button>
                )}
              </article>
            ))}
          </div>
          <h3>Your schedules</h3>
          {data.jobs.map((j) => (
            <div className="job-row" key={j.id}>
              <div>
                <b>{j.title}</b>
                <small>
                  {j.cron} · {j.timezone} · {j.enabled ? "Active" : "Paused"}
                </small>
                {j.last_error && (
                  <small className="danger">{j.last_error}</small>
                )}
              </div>
              <button
                onClick={() =>
                  void action(() =>
                    api(`jobs/${j.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ ...j, enabled: !j.enabled }),
                    }),
                  )
                }
              >
                {j.enabled ? "Pause" : "Resume"}
              </button>
              <button
                aria-label={`Delete ${j.title}`}
                onClick={() =>
                  void action(() => api(`jobs/${j.id}`, { method: "DELETE" }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="small-link"
            onClick={() =>
              void api<typeof history>("history")
                .then(setHistory)
                .catch((e) => setError(e.message))
            }
          >
            Load job history
          </button>
          {history.map((h) => (
            <p className="small" key={h.id}>
              {new Date(h.created_at).toLocaleString()} · {h.status} {h.error}
            </p>
          ))}
        </Dialog>
      )}
      {panel === "job" && (
        <Dialog title="Give a thought a time" close={() => setPanel("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                await api("jobs", {
                  method: "POST",
                  body: JSON.stringify({
                    title: f.get("title"),
                    kind: f.get("kind"),
                    project_id: f.get("project"),
                    agent_id: f.get("agent") || null,
                    topic: f.get("topic"),
                    cron: f.get("cron"),
                    timezone: f.get("timezone"),
                    allowance: Number(f.get("allowance")),
                    enabled: true,
                    notify: false,
                  }),
                });
                setPanel("inbox");
              });
            }}
          >
            <label>
              Title
              <input name="title" required maxLength={100} />
            </label>
            <label>
              Work type
              <select name="kind">
                <option value="reminder">Reminder · no model call</option>
                <option value="ideas">Interest-based ideas</option>
                <option value="research" disabled={!data.capabilities.search}>
                  Research · requires verified search
                </option>
              </select>
            </label>
            <label>
              Project
              <select name="project" defaultValue={selected}>
                {data.projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Agent
              <select name="agent">
                <option value="">None (reminders only)</option>
                {agents
                  .filter((a) => a.permissions.scheduled)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Topic or reminder
              <textarea name="topic" required maxLength={3000} />
            </label>
            <label>
              Schedule (cron, once per hour at most)
              <input name="cron" defaultValue="0 9 * * *" required />
              <small>
                0 9 * * * means every day at 9:00 AM in your timezone.
              </small>
            </label>
            <label>
              Timezone
              <input
                name="timezone"
                defaultValue={String(
                  data.profile.settings.timezone || "America/Phoenix",
                )}
                required
              />
            </label>
            <label>
              Maximum completed runs per month
              <input
                name="allowance"
                type="number"
                defaultValue={10}
                min={1}
                max={30}
                required
              />
            </label>
            <p className="muted small">
              Results always appear in your inbox. Delivery to a device is not
              enabled. Quiet hours are saved in settings for future notification
              delivery.
            </p>
            <button
              className="primary"
              disabled={!data.projects.some((p) => !p.archived)}
            >
              Enable schedule
            </button>
          </form>
        </Dialog>
      )}
      {panel === "music" && (
        <Dialog title="A soundtrack for this moment" close={() => setPanel("")}>
          <p className="muted">
            A small, deliberate recommendation from the Apple catalog. No
            autoplay, location tracking, or copied audio.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              void api<typeof music>("music", {
                method: "POST",
                body: JSON.stringify({
                  context: f.get("context"),
                  moment: f.get("moment"),
                  taste: f.get("taste"),
                }),
              })
                .then(setMusic)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              What are you doing?
              <select name="context">
                {[
                  "working",
                  "walking",
                  "cooking",
                  "traveling",
                  "reflecting",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Describe the moment
              <input
                name="moment"
                maxLength={500}
                placeholder="Rain at the window, an hour to think"
              />
            </label>
            <label>
              Your musical taste
              <input
                name="taste"
                required
                maxLength={150}
                placeholder="An artist, a genre, a sound you love"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Checking the catalog…" : "Find a soundtrack"}
            </button>
          </form>
          {music.map((t) => (
            <article className="music-card" key={t.id}>
              <span>♪</span>
              <h3>{t.track}</h3>
              <b>{t.artist}</b>
              <p>{t.explanation}</p>
              <a href={t.url} target="_blank" rel="noopener noreferrer">
                Open verified catalog link ↗
              </a>
              <div className="actions">
                {["liked", "disliked", "wrong moment"].map((v) => (
                  <button
                    key={v}
                    onClick={() =>
                      void action(async () => {
                        await api("music-feedback", {
                          method: "POST",
                          body: JSON.stringify({
                            track_id: t.id,
                            context: t.context,
                            feedback: v,
                          }),
                        });
                        setNotice("Feedback saved.");
                      })
                    }
                  >
                    {v}
                  </button>
                ))}
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${t.track} — ${t.artist}\n${t.url}`)
                      .then(() => setNotice("Recommendation copied."));
                  }}
                >
                  Share recommendation
                </button>
              </div>
            </article>
          ))}
        </Dialog>
      )}
      {panel === "settings" && (
        <Dialog title="Your workspace, your rules" close={() => setPanel("")}>
          <div className="connection-card">
            <span className={data.capabilities.ai ? "dot connected" : "dot"} />
            <div>
              <b>
                {data.capabilities.ai
                  ? "Provider configured · live validation pending"
                  : "AI connection pending"}
              </b>
              <small>{data.capabilities.model} · paid project required</small>
            </div>
          </div>
          <h3>Usage</h3>
          <p>
            {
              data.usage.filter(
                (u) =>
                  u.created_at.slice(0, 10) ===
                  new Date().toISOString().slice(0, 10),
              ).length
            }{" "}
            reserved calls today, including failed attempts. UTC daily reset.
          </p>
          <div className="usage-table">
            {data.usage.slice(0, 10).map((u, i) => (
              <div key={i}>
                <span>
                  {u.kind} · {u.status}
                </span>
                <small>
                  {u.input_tokens === null
                    ? "Tokens unreported"
                    : `${u.input_tokens} in / ${u.output_tokens ?? "unknown"} out`}
                </small>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                await api("settings", {
                  method: "PATCH",
                  body: JSON.stringify({
                    timezone: f.get("timezone"),
                    quietStart: f.get("quietStart"),
                    quietEnd: f.get("quietEnd"),
                  }),
                });
                setNotice("Settings saved across your devices.");
              });
            }}
          >
            <label>
              Timezone
              <input
                name="timezone"
                defaultValue={String(
                  data.profile.settings.timezone || "America/Phoenix",
                )}
              />
            </label>
            <div className="columns">
              <label>
                Quiet hours begin
                <input
                  type="time"
                  name="quietStart"
                  defaultValue={String(
                    data.profile.settings.quietStart || "22:00",
                  )}
                />
              </label>
              <label>
                Quiet hours end
                <input
                  type="time"
                  name="quietEnd"
                  defaultValue={String(
                    data.profile.settings.quietEnd || "08:00",
                  )}
                />
              </label>
            </div>
            <button className="outline">Save settings</button>
          </form>
          <h3>Archived agents</h3>
          {data.agents
            .filter((a) => a.archived)
            .map((a) => (
              <button
                className="nav"
                key={a.id}
                onClick={() => {
                  setEdit(a);
                  setPanel("agent");
                }}
              >
                {a.name} · inspect or restore
              </button>
            ))}
          <div className="actions wrap">
            <button
              onClick={() =>
                void action(async () => {
                  const value = await api("export");
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(value, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "cast-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              <Download size={16} />
              Export data
            </button>
            <button
              onClick={async () => {
                await browserDb().auth.signOut();
                setData(null);
                setPanel("");
                setAuthMode("signin");
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
            {data.capabilities.owner && (
              <button
                onClick={() => {
                  setPanel("owner");
                  void api<typeof owner>("owner")
                    .then(setOwner)
                    .catch((e) => setError(e.message));
                }}
              >
                Owner dashboard
              </button>
            )}
          </div>
          <p className="muted small">
            Exports include your records, extracted text, and links to original
            uploads. Download those files within one hour, before deleting your
            account.
          </p>
          <details className="delete-account">
            <summary>Delete account and private data</summary>
            <p>
              This removes your agents, projects, conversations, files,
              schedules, and settings permanently.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api("account", {
                    method: "DELETE",
                    body: JSON.stringify({
                      confirmation: new FormData(e.currentTarget).get(
                        "confirmation",
                      ),
                    }),
                  });
                  setData(null);
                  setPanel("");
                  setAuthMode("signin");
                });
              }}
            >
              <label>
                Type DELETE to confirm
                <input name="confirmation" pattern="DELETE" required />
              </label>
              <button className="danger outline">Delete my account</button>
            </form>
          </details>
        </Dialog>
      )}
      {panel === "owner" && (
        <Dialog title="Owner controls" close={() => setPanel("settings")}>
          {owner ? (
            <>
              <p>
                Provider configuration:{" "}
                {owner.health.configured ? "present" : "missing"}. A successful
                deployed probe is still required.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void api<typeof owner>("owner", {
                    method: "PATCH",
                    body: JSON.stringify({
                      ai_enabled: f.get("enabled") === "on",
                      user_daily_limit: Number(f.get("user")),
                      global_daily_limit: Number(f.get("global")),
                    }),
                  })
                    .then(setOwner)
                    .catch((e) => setError(e.message));
                }}
              >
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={owner.config.ai_enabled}
                  />
                  Enable expensive AI calls
                </label>
                <label>
                  Per-user daily calls
                  <input
                    name="user"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={owner.config.user_daily_limit}
                  />
                </label>
                <label>
                  App-wide daily calls
                  <input
                    name="global"
                    type="number"
                    min={1}
                    max={100000}
                    defaultValue={owner.config.global_daily_limit}
                  />
                </label>
                <button className="primary">Apply limits</button>
              </form>
              <p>
                {owner.usage.length} recent usage records. Failed reservations
                count toward limits.
              </p>
            </>
          ) : (
            <p>Loading owner controls…</p>
          )}
        </Dialog>
      )}
    </main>
  );
}
