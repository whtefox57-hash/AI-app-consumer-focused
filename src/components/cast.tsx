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
  Home,
  MessageCircle,
  Users,
  Map as MapIcon,
  Globe,
  Paperclip,
  Puzzle,
  CalendarDays,
  Sparkles,
  Image as ImageIcon,
  Heart,
  Mic,
  ChevronRight,
} from "lucide-react";
import { api, browserDb, setDesignPreview } from "@/lib/browser-db";
import { presets, voices } from "@/lib/presets";
import type { Agent, Boot, Job, Project } from "@/lib/types";
import { Voice } from "./voice";
import { AgentStudio } from "./agent-studio";
import { WorkflowStudio } from "./workflow-studio";
import { CommunityView } from "./community";
import WorldMap from "./world-map";
import { assetPath } from "@/lib/assets";
import { isTemporaryPreview } from "@/lib/preview-mode";
import { PreviewRecovery } from "./preview-recovery";
import {
  getBackground,
  removeBackground,
  saveBackground,
  type CustomBackground,
} from "@/lib/background-store";
import "./scene.css";
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
        <span className="pet-avatar">
          {(
            {
              violet: "🐈",
              blue: "🐶",
              rose: "🐰",
              sage: "🐼",
              amber: "🦊",
              slate: "🤖",
            } as Record<string, string>
          )[agent.avatar] ||
            (/\p{Extended_Pictographic}/u.test(agent.avatar)
              ? agent.avatar
              : "🐈")}
        </span>
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
export function Cast({
  configured,
  designPreview = false,
}: {
  configured: boolean;
  designPreview?: boolean;
}) {
  const temporaryPreview = designPreview && isTemporaryPreview();
  const [data, setData] = useState<Boot | null>(null);
  const [view, setView] = useState<"chat" | "feed" | "networks" | "map">(
    "chat",
  );
  const [libraryTab, setLibraryTab] = useState<"files" | "plugins">("files");
  const [customBackground, setCustomBackground] = useState<{
    url: string;
    name: string;
    type: "image" | "video";
  } | null>(null);
  const backgroundUrl = useRef("");
  const restoredView = useRef("");
  const [petVisiting, setPetVisiting] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [pluginInfo, setPluginInfo] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  function installBackground(value: CustomBackground | null) {
    if (backgroundUrl.current) URL.revokeObjectURL(backgroundUrl.current);
    backgroundUrl.current = value ? URL.createObjectURL(value.blob) : "";
    setCustomBackground(
      value
        ? { url: backgroundUrl.current, name: value.name, type: value.type }
        : null,
    );
  }
  async function saveSettings(patch: Record<string, unknown>) {
    await api("settings", { method: "PATCH", body: JSON.stringify(patch) });
    setData((old) =>
      old
        ? {
            ...old,
            profile: {
              ...old.profile,
              settings: { ...old.profile.settings, ...patch },
            },
          }
        : old,
    );
  }
  function navigate(next: "chat" | "feed" | "networks" | "map") {
    setView(next);
    setMenu(false);
    setVoiceOpen(false);
    void saveSettings({ activeView: next }).catch((e) => setError(e.message));
  }
  useEffect(() => {
    const uid = data?.user.id;
    if (!uid) return;
    if (restoredView.current !== uid) {
      restoredView.current = uid;
      const saved = data.profile.settings.activeView;
      if (saved === "feed" || saved === "networks" || saved === "map")
        setView(saved);
    }
    let live = true;
    void getBackground(uid)
      .then((value) => {
        if (live) installBackground(value || null);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (backgroundUrl.current) URL.revokeObjectURL(backgroundUrl.current);
      backgroundUrl.current = "";
    };
  }, [data?.user.id]);
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    const timer = setInterval(
      () => setGreetingIndex((i) => (i + 1) % 4),
      45000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      !data?.profile.settings.catVisits ||
      view === "chat" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => setPetVisiting(true), 60000);
    return () => clearInterval(timer);
  }, [data?.profile.settings.catVisits, view]);
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
  const [archivedAgents, setArchivedAgents] = useState(false);
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
    setDesignPreview(designPreview);
    if (configured || designPreview) void reload();
    else setLoading(false);
  }, [configured, designPreview]);
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
      if (designPreview) {
        await api("preview-message", {
          method: "POST",
          body: JSON.stringify({
            projectId: selected,
            text: value,
            requestId: turn.current,
            agentIds: participants,
          }),
        });
        await reload();
        throw new Error(
          `${temporaryPreview ? "Your message was added to this temporary preview; it lasts until reload." : "Your message is saved in this design preview."} Real AI replies need the connected app; no answer has been simulated.`,
        );
      }
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
    if (!remove && !members.includes(agentId) && active.length >= 10) {
      setError(
        "A chat can contain up to 10 agents. Remove one before adding another.",
      );
      return;
    }
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
  if (designPreview && !data) return <PreviewRecovery message={error} />;
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
          <a className="preview-entry" href={assetPath("preview")}>
            Explore the new design <ChevronRight size={16} />
          </a>
        </form>
        {alert}
      </main>
    );
  return (
    <main
      className={`app scene-app scene-${view} ${messages.length ? "scene-has-messages" : ""}`}
    >
      {view === "chat" && (
        <div className="scene-backdrop" aria-hidden="true">
          {data.profile.settings.backgroundScene === "custom" &&
          customBackground?.type === "video" ? (
            <video
              src={customBackground.url}
              autoPlay={
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches
              }
              muted
              loop
              playsInline
              controls={
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
              }
              poster={assetPath("scenes/home.png")}
            />
          ) : (
            <img
              src={
                data.profile.settings.backgroundScene === "custom" &&
                customBackground?.type === "image"
                  ? customBackground.url
                  : assetPath(
                      data.profile.settings.backgroundScene === "network"
                        ? "scenes/network.png"
                        : "scenes/home.png",
                    )
              }
              alt=""
              onError={() =>
                setError(
                  "This background could not be displayed. Choose another file in Scene settings.",
                )
              }
            />
          )}
        </div>
      )}
      {view === "chat" ? (
        <aside className={`sidebar scene-sidebar ${menu ? "open" : ""}`}>
          <div className="scene-brand">
            <button
              onClick={() => navigate("chat")}
              className="wordmark"
              aria-label="Cast chat"
            >
              cast<span>✳</span>
            </button>
            <button aria-label="Open inbox" onClick={() => setPanel("inbox")}>
              <Inbox size={16} />
            </button>
          </div>
          <div className="scene-projects">
            <div className="section-title">
              <b>Projects</b>
              <button
                aria-label="Create project"
                onClick={() => setPanel("project-new")}
              >
                <Plus size={15} />
              </button>
            </div>
            {data.projects
              .filter((p) => p.archived === archived)
              .map((p, i) => (
                <button
                  key={p.id}
                  className={`nav ${selected === p.id ? "active" : ""}`}
                  onClick={() => {
                    setSelected(p.id);
                    setMenu(false);
                  }}
                >
                  <span className={`project-color color-${i % 6}`} />
                  <span>{p.name}</span>
                </button>
              ))}
            <button
              className="scene-archive"
              onClick={() => setArchived(!archived)}
            >
              <Archive size={12} />
              {archived ? "Active projects" : "View archive"}
            </button>
          </div>
          <div className="scene-section">
            <div className="section-title">
              <b>YOUR CAST</b>
              <button onClick={() => setPanel("cast-library")}>
                View all <ChevronRight size={12} />
              </button>
            </div>
            <div className="scene-cast-row">
              {agents.slice(0, 6).map((a) => (
                <div
                  draggable
                  key={a.id}
                  className="agent-tile"
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-cast-agent", a.id);
                    e.dataTransfer.setData("text/plain", a.id);
                  }}
                >
                  <button
                    className="agent-face"
                    aria-label={`Edit ${a.name}`}
                    onClick={() => {
                      setEdit(a);
                      setPanel("agent");
                    }}
                  >
                    <Avatar agent={a} />
                  </button>
                  <button
                    className="agent-name"
                    aria-label={`Edit ${a.name} details`}
                    onClick={() => {
                      setEdit(a);
                      setPanel("agent");
                    }}
                  >
                    {a.name
                      .replace("Legal researcher", "Legal")
                      .replace("Product engineer", "Builder")}
                  </button>
                </div>
              ))}
            </div>
            <button
              className="scene-create-agent"
              aria-label="Create agent"
              onClick={createAgent}
            >
              <Plus size={12} />
              Create agent
            </button>
          </div>
          <div className="scene-section">
            <div className="section-title">
              <b>Plugins</b>
              <button
                onClick={() => {
                  setLibraryTab("plugins");
                  setPanel("library");
                }}
              >
                View all <ChevronRight size={12} />
              </button>
            </div>
            <div className="scene-plugin-row">
              {[
                { id: "Gmail", icon: "M", color: "#e2473c" },
                { id: "Notion", icon: "N", color: "#283231" },
                { id: "Slack", icon: "✣", color: "#3ca588" },
                { id: "Drive", icon: "△", color: "#4285f4" },
              ].map((p) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/x-cast-plugin", p.id)
                  }
                  onClick={() => setPluginInfo(p.id)}
                  aria-label={`Configure ${p.id}`}
                >
                  <span style={{ color: p.color }}>{p.icon}</span>
                  <small>{p.id}</small>
                </button>
              ))}
            </div>
          </div>
          <button className="scene-side-link" onClick={() => setPanel("inbox")}>
            <CalendarDays size={14} />
            Schedule <ChevronDown size={12} />
            {data.inbox.filter((i) => !i.read).length > 0 && (
              <span className="count">
                {data.inbox.filter((i) => !i.read).length}
              </span>
            )}
          </button>
          <button
            className="scene-side-link"
            onClick={() => setPanel("workflows")}
          >
            <Sparkles size={14} />
            Templates & workflows <ChevronRight size={12} />
          </button>
          <div className="scene-side-pages">
            <button onClick={() => navigate("feed")}>
              <Home size={15} />
              Home feed
            </button>
            <button onClick={() => navigate("networks")}>
              <Users size={15} />
              Networks
            </button>
            <button onClick={() => navigate("map")}>
              <MapIcon size={15} />
              World map
            </button>
          </div>
          <div className="sidebar-foot">
            <button
              className="nav"
              aria-label="Settings & usage"
              onClick={() => setPanel("settings")}
            >
              <Settings size={15} />
              <span>Settings & usage</span>
            </button>
            <button className="profile" onClick={() => setPanel("settings")}>
              <span className="initial">
                {designPreview ? "C" : data.user.email?.[0]?.toUpperCase()}
              </span>
              <span>
                {designPreview ? "Your workspace" : data.user.email}
                <small>
                  {designPreview ? "Design preview" : "Personal workspace"}
                </small>
              </span>
            </button>
          </div>
        </aside>
      ) : (
        <aside className="scene-rail">
          <button
            className="rail-logo"
            onClick={() => navigate("chat")}
            aria-label="Cast chat"
          >
            ✳
          </button>
          {[
            { id: "feed", label: "Home feed", icon: Home },
            { id: "chat", label: "Chat", icon: MessageCircle },
            { id: "networks", label: "Networks", icon: Users },
            { id: "map", label: "World map", icon: MapIcon },
          ].map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "selected" : ""}
              aria-label={n.label}
              title={n.label}
              onClick={() => navigate(n.id as typeof view)}
            >
              <n.icon size={19} />
              <small>
                {n.label.replace("World ", "").replace(" feed", "")}
              </small>
            </button>
          ))}
          <button
            aria-label="Templates and workflows"
            title="Templates and workflows"
            onClick={() => setPanel("workflows")}
          >
            <Sparkles size={19} />
          </button>
          <button
            aria-label="Open inbox"
            title="Open inbox"
            onClick={() => setPanel("inbox")}
          >
            <Inbox size={19} />
          </button>
          <button
            className="rail-settings"
            aria-label="Settings & usage"
            onClick={() => setPanel("settings")}
          >
            <Settings size={19} />
          </button>
        </aside>
      )}
      {view === "chat" ? (
        <section
          className="workspace scene-workspace"
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setDropActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            const plugin = e.dataTransfer.getData("application/x-cast-plugin");
            if (plugin) {
              setPluginInfo(plugin);
              return;
            }
            const id =
              e.dataTransfer.getData("application/x-cast-agent") ||
              e.dataTransfer.getData("text/plain");
            if (project && agents.some((a) => a.id === id)) void membership(id);
          }}
        >
          <header className="scene-topbar">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <PanelLeft size={19} />
            </button>
            <span className="scene-project-caption">{project?.name}</span>
            <div>
              <button
                className="scene-customize"
                aria-label="Customize scene"
                onClick={() => setPanel("scene")}
              >
                <ImageIcon size={15} />
                <span>Make it yours</span>
              </button>
              <button
                aria-label="Project options"
                onClick={() => setPanel("project-options")}
                disabled={!project}
              >
                <MoreHorizontal size={20} />
              </button>
            </div>
          </header>
          {dropActive && (
            <div className="scene-drop-hint">
              <Plus size={22} />
              Drop an agent into this chat
            </div>
          )}
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
                <div className="mascot-scene">
                  {(data.profile.settings.heroCharacter || "cat") !==
                    "none" && (
                    <>
                      <div className="mascot-greeting">
                        {
                          [
                            "What can I help you with today?",
                            project
                              ? `A little progress on ${project.name}?`
                              : "Where should we start today?",
                            "Your ideas called. They’d like a little company.",
                            "One small step. I’m right here.",
                          ][greetingIndex]
                        }{" "}
                        <Heart size={18} />
                      </div>
                      {data.profile.settings.heroCharacter === "agent" ? (
                        <div className="hero-agent">
                          <Avatar
                            agent={
                              agents.find(
                                (a) =>
                                  a.id === data.profile.settings.heroAgentId,
                              ) ||
                              active[0] ||
                              agents[0] || { name: "Your cast", avatar: "blue" }
                            }
                          />
                        </div>
                      ) : (
                        <img
                          className="hero-kitten"
                          src={assetPath("scenes/cat.png")}
                          alt="A friendly tabby kitten walking across your desk"
                          draggable={false}
                        />
                      )}
                    </>
                  )}
                  {!project && (
                    <button
                      className="primary first-project"
                      onClick={() => setPanel("project-new")}
                    >
                      <Plus size={16} />
                      Create your first project
                    </button>
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
                              onClick={() =>
                                void send(m.content).catch(() => {})
                              }
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

          <footer className="composer-area scene-composer-area">
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
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (text.trim()) void send().catch(() => {});
                  }
                }}
              />
              <div className="composer-tools">
                <div className="scene-composer-left">
                  <button
                    aria-label="Choose files or plugins"
                    title="Choose files or plugins"
                    onClick={() => {
                      setLibraryTab("files");
                      setPanel("library");
                    }}
                  >
                    <Paperclip size={20} />
                  </button>
                  <button
                    aria-label="Project knowledge"
                    title="Project knowledge"
                    onClick={() => setPanel("knowledge")}
                    disabled={!project}
                  >
                    <Globe size={19} />
                  </button>
                  <button
                    className="speech-trigger"
                    aria-label="Speak to your cast"
                    title="Speak to your cast"
                    onClick={() => {
                      if (!data.capabilities.speech) {
                        setError(
                          "Server voice is not connected yet. You can use your keyboard’s dictation to fill the message; no simulated recording is enabled.",
                        );
                        return;
                      }
                      setVoiceOpen((v) => !v);
                    }}
                  >
                    <Mic size={19} />
                  </button>
                </div>
                <div className="participants scene-participants">
                  {active.map((a) => (
                    <button
                      key={a.id}
                      className={`participant ${participants.includes(a.id) ? "selected" : ""}`}
                      aria-label={`Select ${a.name} to respond`}
                      aria-pressed={participants.includes(a.id)}
                      title={`${a.name}: ${participants.includes(a.id) ? "will respond" : "click to respond"}`}
                      onClick={() =>
                        setParticipants((old) =>
                          old.includes(a.id)
                            ? old.filter((v) => v !== a.id)
                            : old.length < 10
                              ? [...old, a.id]
                              : old,
                        )
                      }
                    >
                      <Avatar agent={a} size="mini" />
                      <span className="sr-only">{a.name}</span>
                    </button>
                  ))}
                  <button
                    className="scene-invite-agent"
                    aria-label="Invite an agent"
                    title="Invite an agent"
                    onClick={() => setPanel("invite")}
                    disabled={!project || project.archived}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="scene-send-group">
                  <button
                    className="scene-invite-friends"
                    onClick={() => {
                      navigate("networks");
                      setNotice(
                        "Create or open a network to invite members by their account ID. Invitations require their acceptance.",
                      );
                    }}
                  >
                    <Users size={15} />
                    <span>Invite friends</span>
                  </button>
                  {data.capabilities.strong && (
                    <label
                      className="model-toggle"
                      title="Use the stronger configured model"
                    >
                      <input
                        type="checkbox"
                        checked={strong}
                        onChange={(e) => setStrong(e.target.checked)}
                      />
                      <Sparkles size={15} />
                    </label>
                  )}
                  {busy ? (
                    <button
                      className="send"
                      aria-label="Cancel response"
                      onClick={() => void cancel()}
                    >
                      <X size={20} />
                    </button>
                  ) : (
                    <button
                      className="send"
                      aria-label="Send message"
                      disabled={
                        !text.trim() ||
                        !participants.length ||
                        project?.archived
                      }
                      onClick={() => void send().catch(() => {})}
                    >
                      <ArrowUp size={22} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {voiceOpen && (
              <div className="scene-voice">
                <Voice
                  key={selected + participants.join(",")}
                  enabled={
                    data.capabilities.speech &&
                    !!project &&
                    participants.length === 1 &&
                    !project.archived
                  }
                  voice={
                    active.find((a) => a.id === participants[0])?.voice ||
                    "Kore"
                  }
                  send={send}
                  onError={setError}
                />
                <button
                  aria-label="Close voice controls"
                  onClick={() => setVoiceOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <div className="composer-caption">
              <span>
                {participants.length
                  ? `${participants.length} ${participants.length === 1 ? "agent" : "agents"} selected · one reply each`
                  : "Choose the agents you want to respond"}
              </span>
              <span>
                {designPreview
                  ? temporaryPreview
                    ? "Temporary: changes last until reload"
                    : "Preview: edits stay on this device"
                  : "AI can make mistakes. Check important details."}
              </span>
            </div>
          </footer>
        </section>
      ) : (
        <section className="scene-page">
          {view === "map" ? (
            <WorldMap
              ownerId={data.user.id}
              settings={data.profile.settings}
              onSaveSettings={saveSettings}
              preview={designPreview}
            />
          ) : (
            <CommunityView
              view={view}
              user={data.user}
              agents={agents}
              jobs={data.jobs}
              inbox={data.inbox}
              projects={data.projects}
              onOpenMap={() => navigate("map")}
              onInviteAgent={(id) => {
                navigate("chat");
                if (
                  !data.memberships.some(
                    (m) => m.project_id === selected && m.agent_id === id,
                  )
                )
                  void membership(id);
              }}
              preview={designPreview}
            />
          )}
        </section>
      )}
      {designPreview && (
        <button
          className="scene-preview-badge"
          onClick={() => setPanel("preview-info")}
        >
          <span />
          {temporaryPreview ? "Temporary preview" : "Design preview"}{" "}
          <ChevronRight size={12} />
        </button>
      )}
      {petVisiting && (
        <div
          className="pet-visitor"
          onAnimationEnd={() => setPetVisiting(false)}
          aria-hidden="true"
        >
          <img src={assetPath("scenes/cat.png")} alt="" />
          {active[0] && (
            <span className="pet-carry">
              <Avatar agent={active[0]} size="mini" />
            </span>
          )}
        </div>
      )}
      {alert}
      {panel === "preview-info" && (
        <Dialog
          title="A place to try the new design"
          close={() => setPanel("")}
        >
          <p>
            Create agents, projects, notes, workflows, networks, posts, and map
            places.{" "}
            {temporaryPreview
              ? "Changes in this temporary preview last until you reload or close the page. Export anything you want to keep."
              : "Your changes are saved in this browser and survive refresh."}
          </p>
          <p>
            Real AI responses, account sign-in, background jobs, voice calls,
            and external connectors require the connected app. This preview does
            not simulate their results or send your messages to a model.
          </p>
          <button className="primary" onClick={() => setPanel("")}>
            Keep exploring
          </button>
        </Dialog>
      )}
      {panel === "scene" && (
        <Dialog title="Make this space yours" close={() => setPanel("")}>
          <p className="muted">
            A view you love. A little company. Room for your next idea.
          </p>
          <div className="scene-picker">
            {[
              { id: "home", label: "A sunny desk", image: "home.png" },
              {
                id: "network",
                label: "A bigger horizon",
                image: "network.png",
              },
            ].map((v) => (
              <button
                key={v.id}
                className={
                  data.profile.settings.backgroundScene === v.id
                    ? "selected"
                    : ""
                }
                onClick={() =>
                  void saveSettings({ backgroundScene: v.id }).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                <img src={assetPath(`scenes/${v.image}`)} alt="" />
                <span>{v.label}</span>
              </button>
            ))}
          </div>
          <label className="upload wide scene-background-upload">
            Choose your own image or video
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void (async () => {
                  try {
                    const value = await saveBackground(data.user.id, file);
                    installBackground(value);
                    await saveSettings({ backgroundScene: "custom" });
                    setNotice(
                      temporaryPreview
                        ? "Background applied for this temporary preview."
                        : "Background saved on this device.",
                    );
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Background could not be saved.",
                    );
                  }
                })();
                e.currentTarget.value = "";
              }}
            />
          </label>
          <p className="small">
            Up to 25 MB.{" "}
            {temporaryPreview
              ? "Temporary backgrounds last until reload."
              : "Custom backgrounds stay on this device."}{" "}
            Videos play muted; reduced-motion mode shows playback controls.
          </p>
          {customBackground && (
            <div className="scene-uploaded">
              <span>{customBackground.name}</span>
              <button
                onClick={() =>
                  void (async () => {
                    await removeBackground(data.user.id);
                    installBackground(null);
                    await saveSettings({ backgroundScene: "home" });
                  })().catch((e) => setError(e.message))
                }
              >
                <Trash2 size={14} />
                Remove custom background
              </button>
            </div>
          )}
          <h3>Your welcome companion</h3>
          <div className="scene-character-picker">
            {[
              { id: "cat", label: "The cat", icon: "🐈" },
              { id: "agent", label: "An agent", icon: "🤖" },
              { id: "none", label: "Just the view", icon: "✳" },
            ].map((v) => (
              <button
                key={v.id}
                aria-pressed={
                  (data.profile.settings.heroCharacter || "cat") === v.id
                }
                onClick={() =>
                  void saveSettings({ heroCharacter: v.id }).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                <span>{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>
          {data.profile.settings.heroCharacter === "agent" && (
            <label>
              Choose a character
              <select
                value={String(
                  data.profile.settings.heroAgentId ||
                    active[0]?.id ||
                    agents[0]?.id ||
                    "",
                )}
                onChange={(e) =>
                  void saveSettings({ heroAgentId: e.target.value }).catch(
                    (error) => setError(error.message),
                  )
                }
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!data.profile.settings.catVisits}
              onChange={(e) =>
                void saveSettings({ catVisits: e.target.checked }).catch(
                  (error) => setError(error.message),
                )
              }
            />
            Let the cat visit other pages
          </label>
        </Dialog>
      )}
      {panel === "cast-library" && (
        <Dialog title="Your cast" close={() => setPanel("")}>
          <p className="muted">
            Drag an agent into chat, invite them, or open their studio to make
            them yours.
          </p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={archivedAgents}
              onChange={(event) => setArchivedAgents(event.target.checked)}
            />
            Show archived agents
          </label>
          <div className="scene-cast-library">
            {data.agents
              .filter((a) => archivedAgents || !a.archived)
              .map((a) => (
                <div
                  key={a.id}
                  className="agent-tile"
                  draggable={!a.archived}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/x-cast-agent", a.id)
                  }
                >
                  <button
                    aria-label={`Edit ${a.name}`}
                    onClick={() => {
                      setEdit(a);
                      setPanel("agent");
                    }}
                  >
                    <Avatar agent={a} />
                    <b>{a.name}</b>
                  </button>
                  <p>{a.expertise}</p>
                  {a.archived && (
                    <small className="muted">
                      Archived · open the studio to restore
                    </small>
                  )}
                  <button
                    className="outline"
                    onClick={() => void membership(a.id)}
                    disabled={
                      a.archived ||
                      members.includes(a.id) ||
                      active.length >= 10
                    }
                  >
                    {members.includes(a.id) ? "In this chat" : "Invite"}
                  </button>
                </div>
              ))}
          </div>
          <button className="primary" onClick={createAgent}>
            <Plus size={16} />
            Create agent
          </button>
        </Dialog>
      )}
      {panel === "library" && (
        <Dialog title="Files & plugins" close={() => setPanel("")}>
          <div className="library-tabs">
            <button
              className={libraryTab === "files" ? "active" : ""}
              onClick={() => setLibraryTab("files")}
            >
              <Paperclip size={16} />
              Files
            </button>
            <button
              className={libraryTab === "plugins" ? "active" : ""}
              onClick={() => setLibraryTab("plugins")}
            >
              <Puzzle size={16} />
              Plugins
            </button>
          </div>
          {libraryTab === "files" ? (
            <>
              <p className="muted">
                Give your cast knowledge from this project. Each agent’s
                document permission and selected files still control access.
              </p>
              <div className="scene-files-list">
                {data.documents
                  .filter((d) => d.project_id === selected)
                  .map((d) => (
                    <button key={d.id} onClick={() => setPanel("knowledge")}>
                      <FileText size={18} />
                      <span>
                        {d.name}
                        <small>{d.status}</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
              </div>
              <button
                className="primary"
                onClick={() => setPanel("knowledge")}
                disabled={!project}
              >
                <Plus size={16} />
                Add files or notes
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                Add instructions with templates now. External plugins need a
                connected service and your explicit permission.
              </p>
              <button
                className="scene-plugin-card"
                onClick={() => setPanel("workflows")}
              >
                <Sparkles size={25} />
                <span>
                  <b>Templates & workflows</b>
                  <small>
                    Morning briefs, tables, diagrams, documents, and your own
                    styles
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
              {[
                "Gmail",
                "Notion",
                "Slack",
                "Drive",
                "Image generation",
                "Video generation",
              ].map((name) => (
                <button
                  className="scene-plugin-card"
                  key={name}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/x-cast-plugin", name)
                  }
                  onClick={() => setPluginInfo(name)}
                >
                  <Puzzle size={22} />
                  <span>
                    <b>{name}</b>
                    <small>Requires a connected provider</small>
                  </span>
                  <span className="integration-status">Not connected</span>
                </button>
              ))}
            </>
          )}
        </Dialog>
      )}
      {pluginInfo && (
        <Dialog title={pluginInfo} close={() => setPluginInfo("")}>
          <div className="plugin-connection-note">
            <Puzzle size={34} />
            <h3>Connect before using this plugin</h3>
            <p>
              {pluginInfo} is not connected to this app yet. No external
              accounts are accessed or actions performed. You can save related
              instructions in your agent’s Tools tab.
            </p>
            <button
              className="primary"
              onClick={() => {
                setPluginInfo("");
                if (active[0]) {
                  setEdit(active[0]);
                  setPanel("agent");
                } else setPanel("cast-library");
              }}
            >
              Open agent studio
            </button>
          </div>
        </Dialog>
      )}
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
            Invite here, or drag an avatar from the shelf. A chat can hold up to
            10 agents. Blue circles show who will respond.
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
        <AgentStudio
          agent={edit}
          projects={data.projects}
          documents={data.documents}
          agents={data.agents}
          capabilities={data.capabilities}
          onClose={() => setPanel("")}
          onDelete={async (id) => {
            await api(`agents/${id}`, { method: "DELETE" });
            await reload();
            setPanel("");
          }}
          onSave={async (draft, applyAll) => {
            const value = draft as Agent;
            const saved = await api<Agent>(
              value.id ? `agents/${value.id}` : "agents",
              {
                method: value.id ? "PATCH" : "POST",
                body: JSON.stringify(value),
              },
            );
            if (applyAll)
              for (const workflow of value.config?.workflow_ids || [])
                await api(`workflows/${workflow}/apply`, {
                  method: "POST",
                  body: JSON.stringify({ applyToAll: true }),
                });
            await reload();
            setEdit(saved);
            setNotice("Agent saved.");
          }}
        />
      )}
      {panel === "workflows" && (
        <WorkflowStudio
          agents={data.agents}
          capabilities={data.capabilities}
          onClose={() => setPanel("")}
          onChanged={reload}
        />
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
                setNotice(
                  designPreview
                    ? temporaryPreview
                      ? "Settings applied until reload."
                      : "Settings saved on this device."
                    : "Settings saved across your devices.",
                );
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
                if (designPreview) {
                  setPanel("");
                  setNotice(
                    "This is a device-only design preview. No account is signed in.",
                  );
                  return;
                }
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
            uploads.{" "}
            {designPreview
              ? "Download these browser links before closing this page or deleting preview data."
              : "Download those files within one hour, before deleting your account."}
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
