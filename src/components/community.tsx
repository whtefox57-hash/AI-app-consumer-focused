"use client";

import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  Globe2,
  GripVertical,
  Heart,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { Agent, InboxItem, Job, Project } from "@/lib/types";
import {
  type CommunityBoot,
  type CommunityPost,
  type PanelState,
} from "@/lib/community-types";
import { api } from "@/lib/browser-db";
import { previewApi } from "@/lib/preview-store";
import { assetPath } from "@/lib/assets";
import "./community.css";

const Graph = lazy(() => import("./community-graph"));
type Props = {
  view: "networks" | "feed";
  user: { id: string; email: string };
  agents: Agent[];
  jobs?: Job[];
  inbox?: InboxItem[];
  projects?: Project[];
  onOpenMap?: () => void;
  onInviteAgent?: (id: string) => void;
  preview?: boolean;
};
type DialogName =
  | "network"
  | "profile"
  | "invite"
  | "event"
  | "resource"
  | "members"
  | "post"
  | "integrations";
const emptyBoot = (user: Props["user"]): CommunityBoot => ({
  profile: {
    user_id: user.id,
    display_name: user.email.split("@")[0] || "You",
    bio: "",
    interests: [],
    discoverable: false,
  },
  profiles: [],
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
});
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const panelDefaults = (view: Props["view"]): PanelState[] =>
  (view === "feed"
    ? [
        "automations",
        "connections",
        "networks",
        "projects",
        "interests",
        "events",
        "map",
        "graph",
      ]
    : ["agents", "events", "map", "graph", "resources", "connections"]
  ).map((id) => ({ id, collapsed: false, hidden: false }));
const stamp = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Phoenix",
  }).format(new Date(date));
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Phoenix",
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}
function CastAvatar({ agent }: { agent: Agent }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (agent.avatar.includes("/"))
      api<{ url: string }>(`files?path=${encodeURIComponent(agent.avatar)}`)
        .then((value) => {
          if (active) setUrl(value.url);
        })
        .catch(() => {
          if (active) setUrl("");
        });
    return () => {
      active = false;
    };
  }, [agent.avatar]);
  const animal =
    (
      {
        violet: "🐈",
        blue: "🐶",
        rose: "🐰",
        sage: "🐼",
        amber: "🦊",
        slate: "🤖",
      } as Record<string, string>
    )[agent.avatar] ||
    (/\p{Extended_Pictographic}/u.test(agent.avatar) ? agent.avatar : "🐈");
  return (
    <span className="cm-cast-avatar">
      {url ? <img src={url} alt="" /> : animal}
    </span>
  );
}

export function CommunityView({
  view,
  user,
  agents,
  jobs = [],
  inbox = [],
  projects = [],
  onOpenMap,
  onInviteAgent,
  preview = false,
}: Props) {
  const [data, setData] = useState<CommunityBoot>(() => emptyBoot(user));
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("For you");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [audience, setAudience] =
    useState<CommunityPost["audience"]>("connections");
  const [openReplies, setOpenReplies] = useState<string[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [networkEdit, setNetworkEdit] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [customize, setCustomize] = useState(false);
  const [dragPanel, setDragPanel] = useState("");
  const [panels, setPanels] = useState<PanelState[]>(() => panelDefaults(view));
  const modal = useRef<HTMLDialogElement>(null);
  const network = data.networks.find((n) => n.id === selected);
  const membership = data.members.find(
    (m) => m.network_id === selected && m.user_id === user.id,
  );
  const canManage =
    membership?.role === "owner" || membership?.role === "moderator";
  const profileName = (id: string) =>
    id === user.id
      ? data.profile.display_name
      : data.profiles.find((p) => p.user_id === id)?.display_name ||
        "Community member";

  async function refresh() {
    setLoading(true);
    try {
      const value = await (preview
        ? previewApi<CommunityBoot>("community/boot")
        : api<CommunityBoot>("community/boot", { cache: "no-store" }));
      setData(value);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open your community.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // Only account changes reset the adapter; view changes share the same community.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, user.id]);
  useEffect(() => {
    const saved = data.layouts.find((l) => l.view === view);
    setPanels(saved?.panels || panelDefaults(view));
  }, [data.layouts, view]);
  useEffect(() => {
    setTab("For you");
    setDraft("");
    setLink("");
  }, [view]);
  useEffect(() => {
    if (!data.profile.discoverable && audience === "public")
      setAudience("connections");
  }, [data.profile.discoverable, audience]);
  useEffect(() => {
    if (!selected && data.networks.length) setSelected(data.networks[0].id);
    else if (selected && !data.networks.some((n) => n.id === selected))
      setSelected(data.networks[0]?.id || "");
  }, [data.networks, selected]);
  useEffect(() => {
    if (dialog && modal.current && !modal.current.open)
      modal.current.showModal();
    else if (!dialog && modal.current?.open) modal.current.close();
  }, [dialog]);

  async function mutate(path: string, method: string, value?: unknown) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const options = {
        method,
        body: value === undefined ? undefined : JSON.stringify(value),
      };
      await (preview
        ? previewApi(`community/${path}`, options)
        : api(`community/${path}`, options));
      await refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The change could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function savePanels(next: PanelState[]) {
    setPanels(next);
    if (!(await mutate("layout", "PATCH", { view, panels: next })))
      setPanels(panels);
  }
  function movePanel(id: string, direction: number) {
    const next = [...panels];
    const from = next.findIndex((p) => p.id === id);
    const to = Math.max(0, Math.min(next.length - 1, from + direction));
    [next[from], next[to]] = [next[to], next[from]];
    void savePanels(next);
  }
  function open(name: DialogName, title: string) {
    setDialogTitle(title);
    setDialog(name);
  }
  function integration(title: string) {
    open("integrations", title);
  }
  async function publish() {
    if (!draft.trim()) return;
    if (view === "networks" && !membership) {
      setError("Join this network before posting.");
      return;
    }
    if (
      await mutate("posts", "POST", {
        content: draft.trim(),
        link_url: link.trim(),
        network_id: view === "networks" ? selected : null,
        audience,
      })
    ) {
      setDraft("");
      setLink("");
      setShowLink(false);
    }
  }
  const myConnections = data.connections.filter((c) => c.status === "accepted");
  const connectionIds = myConnections.map((c) =>
    c.sender_id === user.id ? c.target_id : c.sender_id,
  );
  const incoming = data.invitations.filter(
    (i) =>
      i.target_id === user.id &&
      i.status === "pending" &&
      new Date(i.expires_at).getTime() > Date.now(),
  );
  const incomingConnections = data.connections.filter(
    (c) => c.target_id === user.id && c.status === "pending",
  );
  const networkEvents = data.events
    .filter((e) => view !== "networks" || e.network_id === selected)
    .filter((e) => new Date(e.starts_at).getTime() > Date.now())
    .slice(0, 5);
  const feedPosts = data.posts
    .filter((p) => view !== "networks" || p.network_id === selected)
    .filter((p) =>
      tab === "Saved"
        ? data.reactions.some(
            (r) =>
              r.post_id === p.id &&
              r.user_id === user.id &&
              r.kind === "bookmark",
          )
        : tab === "Networks" && view === "feed"
          ? !!p.network_id
          : tab === "Connections"
            ? connectionIds.includes(p.user_id) || p.user_id === user.id
            : true,
    )
    .filter(
      (p) =>
        !search ||
        `${p.content} ${profileName(p.user_id)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function panel(id: string): {
    title: string;
    icon: ReactNode;
    body: ReactNode;
    action?: () => void;
  } {
    if (id === "automations")
      return {
        title: "Automations",
        icon: <Zap size={15} />,
        action: () => integration("Your automations"),
        body: (
          <>
            <div className="cm-segments">
              <span className="active">Completed</span>
              <span>Scheduled</span>
            </div>
            {inbox.length ? (
              inbox.slice(0, 5).map((item) => (
                <div key={item.id} className="cm-automation">
                  <Check size={13} />
                  <span>{item.title}</span>
                  <small>{stamp(item.created_at).split(",")[0]}</small>
                </div>
              ))
            ) : (
              <div className="cm-small-empty">
                <div className="cm-status-orb">
                  <Check size={17} />
                </div>
                <p>A little help in the background.</p>
                <small>
                  {jobs.length
                    ? `${jobs.filter((j) => j.enabled).length} schedules enabled. Completed work will appear here.`
                    : "Create a schedule to make room for what matters."}
                </small>
              </div>
            )}
          </>
        ),
      };
    if (id === "connections")
      return {
        title: "Connections",
        icon: <Users size={15} />,
        action: () => open("profile", "Your discovery profile"),
        body: (
          <>
            {myConnections.length > 0 && (
              <div className="cm-friends">
                {connectionIds.slice(0, 6).map((id) => (
                  <div key={id}>
                    <span className="cm-avatar">
                      {initials(profileName(id))}
                    </span>
                    <small>{profileName(id)}</small>
                  </div>
                ))}
              </div>
            )}
            {incomingConnections.map((c) => (
              <div className="cm-invite-card" key={c.id}>
                <p>{profileName(c.sender_id)} wants to connect.</p>
                <div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`connections/${c.id}/accept`, "POST")
                    }
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`connections/${c.id}/decline`, "POST")
                    }
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            <div className="cm-discovery">
              <strong>Find people with shared interests</strong>
              <p>
                {data.profile.discoverable
                  ? "Suggestions match the interests people choose to share."
                  : "Choose your interests and opt into discovery when you’re ready."}
              </p>
              {data.suggestions.slice(0, 3).map((p) => (
                <div className="cm-person" key={p.user_id}>
                  <span className="cm-avatar">{initials(p.display_name)}</span>
                  <span>
                    {p.display_name}
                    <small>{p.shared_interests.join(" · ")}</small>
                  </span>
                  <button
                    aria-label={`Connect with ${p.display_name}`}
                    disabled={busy}
                    onClick={() =>
                      void mutate("connections", "POST", {
                        target_id: p.user_id,
                      })
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
              <button
                className="cm-soft-button"
                onClick={() => open("profile", "Your discovery profile")}
              >
                {data.profile.discoverable
                  ? "Edit interests"
                  : "Find & connect"}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </>
        ),
      };
    if (id === "networks")
      return {
        title: "Your networks",
        icon: <Globe2 size={15} />,
        action: () => {
          setNetworkEdit(false);
          open("network", "Create a network");
        },
        body: (
          <div className="cm-network-tiles">
            {data.networks.slice(0, 6).map((n) => (
              <button
                key={n.id}
                className={selected === n.id ? "selected" : ""}
                onClick={() => {
                  setSelected(n.id);
                  setTab("Networks");
                }}
              >
                <span className="cm-network-tile-art">
                  <Globe2 size={22} />
                </span>
                <strong>{n.name}</strong>
                <small>{n.member_count || 0} members</small>
              </button>
            ))}
            <button
              className="cm-add-tile"
              onClick={() => {
                setNetworkEdit(false);
                open("network", "Create a network");
              }}
            >
              <span>
                <Plus size={21} />
              </span>
              <strong>
                {data.networks.length ? "Create" : "Start a network"}
              </strong>
              <small>Ideas find company.</small>
            </button>
          </div>
        ),
      };
    if (id === "projects")
      return {
        title: "Your projects",
        icon: <BookOpen size={15} />,
        body: projects.length ? (
          <div className="cm-resource-list">
            {projects
              .filter((p) => !p.archived)
              .slice(0, 4)
              .map((p) => (
                <div key={p.id}>
                  <span className="cm-resource-icon">
                    <BookOpen size={17} />
                  </span>
                  <span>
                    {p.name}
                    <small>Private project · visible to you</small>
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="cm-small-empty">
            <BookOpen size={25} />
            <p>A place for your next idea.</p>
            <small>Your projects will be collected here.</small>
          </div>
        ),
      };
    if (id === "agents")
      return {
        title: "Your cast",
        icon: <Sparkles size={15} />,
        body: (
          <>
            <div className="cm-agent-rail">
              {agents
                .filter((a) => !a.archived)
                .map((agent, index) => (
                  <button
                    key={agent.id}
                    onClick={() =>
                      onInviteAgent
                        ? onInviteAgent(agent.id)
                        : integration(`${agent.name} · your personal agent`)
                    }
                    title={agent.name}
                  >
                    <span
                      style={{
                        background: [
                          "#eee1ff",
                          "#dcf1fc",
                          "#ffebe7",
                          "#fff0ca",
                        ][index % 4],
                      }}
                    >
                      <CastAvatar agent={agent} />
                    </span>
                    <small>{agent.name}</small>
                  </button>
                ))}
            </div>
            <small className="cm-muted">
              Your personal agents. Private conversations stay in your
              workspace.
            </small>
          </>
        ),
      };
    if (id === "events")
      return {
        title: "Events & schedule",
        icon: <CalendarDays size={15} />,
        action: () => open("event", "Create an event"),
        body: (
          <>
            {networkEvents.length ? (
              networkEvents.map((event) => (
                <div className="cm-event" key={event.id}>
                  <div className="cm-event-date">
                    <small>
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        timeZone: "America/Phoenix",
                      }).format(new Date(event.starts_at))}
                    </small>
                    <strong>
                      {new Intl.DateTimeFormat("en-US", {
                        day: "numeric",
                        timeZone: "America/Phoenix",
                      }).format(new Date(event.starts_at))}
                    </strong>
                  </div>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{stamp(event.starts_at)} · Arizona</small>
                    <small>
                      {event.location || "Location to be confirmed"}
                    </small>
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open event <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                  {(event.user_id === user.id || canManage) && (
                    <button
                      className="cm-icon-button"
                      aria-label={`Delete ${event.title}`}
                      disabled={busy}
                      onClick={() =>
                        void mutate(`events/${event.id}`, "DELETE")
                      }
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="cm-small-empty">
                <CalendarDays size={24} />
                <p>Make time for good company.</p>
                <small>
                  Upcoming events you create or can access will appear here.
                </small>
                <button onClick={() => open("event", "Create an event")}>
                  Plan something <Plus size={12} />
                </button>
              </div>
            )}
          </>
        ),
      };
    if (id === "map")
      return {
        title: "Explore the world",
        icon: <MapPin size={15} />,
        body: (
          <button
            className="cm-mini-map"
            onClick={() =>
              onOpenMap ? onOpenMap() : integration("Map explorer")
            }
          >
            <div className="cm-map-contours" />
            <Globe2 size={55} />
            <span>
              Places worth discovering <ArrowUpRight size={15} />
            </span>
            <small>Your precise location is never shared.</small>
          </button>
        ),
      };
    if (id === "graph")
      return {
        title: "Related networks",
        icon: <Globe2 size={15} />,
        body: (
          <Suspense
            fallback={
              <div className="cm-graph-loading" role="status">
                Opening your network constellation…
              </div>
            }
          >
            <Graph
              networks={data.networks}
              selected={selected}
              onSelect={setSelected}
            />
          </Suspense>
        ),
      };
    if (id === "resources")
      return {
        title: "Projects & resources",
        icon: <BookOpen size={15} />,
        action: () => open("resource", "Add a resource"),
        body: (
          <>
            {data.resources.filter(
              (r) => view !== "networks" || r.network_id === selected,
            ).length ? (
              <div className="cm-resource-list">
                {data.resources
                  .filter(
                    (r) => view !== "networks" || r.network_id === selected,
                  )
                  .map((r) => (
                    <div key={r.id}>
                      <span className="cm-resource-icon">
                        {r.kind === "game" ? (
                          <Gamepad2 size={17} />
                        ) : (
                          <BookOpen size={17} />
                        )}
                      </span>
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        {r.title}
                        <small>
                          {r.kind} <ArrowUpRight size={11} />
                        </small>
                      </a>
                      {canManage && (
                        <button
                          aria-label={`Delete ${r.title}`}
                          disabled={busy}
                          onClick={() =>
                            void mutate(`resources/${r.id}`, "DELETE")
                          }
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="cm-small-empty">
                <BookOpen size={25} />
                <p>Build a shared bookshelf.</p>
                <small>
                  Add useful links, public projects, and games your group can
                  open.
                </small>
              </div>
            )}
          </>
        ),
      };
    return {
      title: "Made for your interests",
      icon: <Heart size={15} />,
      action: () => open("profile", "Your discovery profile"),
      body: (
        <>
          <div className="cm-interest-cards">
            {[
              {
                title: "Music",
                sub: "Find your focus",
                cls: "music",
                icon: "♫",
              },
              {
                title: "Reading",
                sub: "Make room for ideas",
                cls: "reading",
                icon: "Aa",
              },
              {
                title: "Film",
                sub: "A different perspective",
                cls: "film",
                icon: "▷",
              },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => integration(`${item.title} for you`)}
              >
                <span className={item.cls}>{item.icon}</span>
                <strong>{item.title}</strong>
                <small>{item.sub}</small>
              </button>
            ))}
          </div>
          <p className="cm-muted">
            Choose an integration to get real recommendations. Nothing is
            playing or purchasing automatically.
          </p>
          {data.profile.interests.length > 0 && (
            <div className="cm-tags">
              {data.profile.interests.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
        </>
      ),
    };
  }
  function renderPanel(state: PanelState) {
    if (state.hidden) return null;
    const item = panel(state.id);
    return (
      <section
        className={`cm-panel ${state.collapsed ? "collapsed" : ""}`}
        key={state.id}
        draggable={customize}
        onDragStart={() => setDragPanel(state.id)}
        onDragOver={(e) => {
          if (customize) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const next = [...panels];
          const from = next.findIndex((p) => p.id === dragPanel);
          const to = next.findIndex((p) => p.id === state.id);
          if (from >= 0 && from !== to) {
            next.splice(to, 0, next.splice(from, 1)[0]);
            void savePanels(next);
          }
          setDragPanel("");
        }}
      >
        <header>
          <button
            className="cm-panel-heading"
            onClick={() =>
              void savePanels(
                panels.map((p) =>
                  p.id === state.id ? { ...p, collapsed: !p.collapsed } : p,
                ),
              )
            }
            aria-expanded={!state.collapsed}
          >
            {item.icon}
            <strong>{item.title}</strong>
            <ChevronDown size={13} />
          </button>
          {item.action && (
            <button
              className="cm-icon-button"
              aria-label={`Manage ${item.title}`}
              onClick={item.action}
            >
              <Plus size={14} />
            </button>
          )}
        </header>
        {customize && (
          <div className="cm-panel-controls">
            <GripVertical size={13} />
            <span>Move panel</span>
            <button
              aria-label={`Move ${item.title} up`}
              disabled={busy || panels[0].id === state.id}
              onClick={() => movePanel(state.id, -1)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              aria-label={`Move ${item.title} down`}
              disabled={busy || panels.at(-1)?.id === state.id}
              onClick={() => movePanel(state.id, 1)}
            >
              <ArrowDown size={13} />
            </button>
            <button
              aria-label={`Hide ${item.title}`}
              disabled={busy}
              onClick={() =>
                void savePanels(
                  panels.map((p) =>
                    p.id === state.id ? { ...p, hidden: true } : p,
                  ),
                )
              }
            >
              <X size={13} />
            </button>
          </div>
        )}
        {!state.collapsed && <div className="cm-panel-body">{item.body}</div>}
      </section>
    );
  }
  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const val = (key: string) => String(form.get(key) || "").trim();
    let saved = false;
    if (dialog === "network")
      saved = await mutate(
        networkEdit && network ? `networks/${network.id}` : "networks",
        networkEdit ? "PATCH" : "POST",
        {
          name: val("name"),
          purpose: val("purpose"),
          visibility: val("visibility"),
          topics: val("topics")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        },
      );
    if (dialog === "profile")
      saved = await mutate("profile", "PATCH", {
        display_name: val("display_name"),
        bio: val("bio"),
        interests: val("interests")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        discoverable: form.get("discoverable") === "on",
      });
    if (dialog === "post" && editingPost)
      saved = await mutate(`posts/${editingPost.id}`, "PATCH", {
        network_id: editingPost.network_id,
        content: val("content"),
        link_url: val("link_url"),
        audience: editingPost.network_id
          ? editingPost.audience
          : val("audience"),
      });
    if (dialog === "invite")
      saved = await mutate(`networks/${selected}/invitations`, "POST", {
        target_id: val("target_id"),
        role: val("role"),
      });
    if (dialog === "event") {
      const date = new Date(val("starts_at"));
      if (!Number.isFinite(date.getTime())) {
        setError("Choose a valid event date and time.");
        return;
      }
      saved = await mutate("events", "POST", {
        network_id: val("network_id") || null,
        title: val("title"),
        starts_at: date.toISOString(),
        location: val("location"),
        url: val("url"),
      });
    }
    if (dialog === "resource")
      saved = await mutate("resources", "POST", {
        network_id: val("network_id"),
        title: val("title"),
        url: val("url"),
        kind: val("kind"),
      });
    if (saved) setDialog(null);
  }

  return (
    <div className={`cm-community cm-${view}`}>
      <section
        className="cm-cover"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(14,30,30,.55),rgba(14,30,30,.05) 72%,rgba(14,30,30,.28)),url('${assetPath(`scenes/${view === "feed" ? "home" : "network"}.png`)}')`,
        }}
      >
        <div className="cm-cover-top">
          <span className="cm-eyebrow">
            {view === "feed"
              ? "YOUR EVERYDAY, WITH POSSIBILITY"
              : "IDEAS FIND COMPANY"}
          </span>
          <span className="cm-cover-quote">
            {view === "feed"
              ? "“A disciplined mind builds extraordinary freedom.”"
              : "“A better tomorrow is a group project.”"}
          </span>
        </div>
        <div className="cm-cover-main">
          <div>
            {view === "networks" ? (
              <>
                <div className="cm-network-title">
                  <Globe2 size={39} />
                  <h1>{network?.name || "Build something together."}</h1>
                </div>
                <p>
                  {network?.purpose ||
                    "A place for doers, thinkers, and friends. Bring the people and ideas that matter to you."}
                </p>
                <div className="cm-cover-stats">
                  <span>
                    <Users size={14} />
                    {network
                      ? `${network.member_count || 0} members`
                      : "Your next circle starts here"}
                  </span>
                  {network && (
                    <span>
                      <Globe2 size={14} />
                      {network.visibility === "public"
                        ? "Discoverable network"
                        : "Private network"}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1>
                  {greeting()}, {data.profile.display_name.split(" ")[0]}
                </h1>
                <p>Ideas. People. Projects. A better tomorrow.</p>
                <div className="cm-cover-stats">
                  <span>
                    Arizona time ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "America/Phoenix",
                    }).format(new Date())}
                  </span>
                </div>
              </>
            )}
          </div>
          {view === "networks" && (
            <div className="cm-cover-actions">
              {network ? (
                <>
                  {membership ? (
                    <button
                      className="cm-join"
                      onClick={() =>
                        canManage
                          ? open("invite", "Invite someone to your network")
                          : open("members", "Network members")
                      }
                    >
                      <Users size={15} />
                      {canManage ? "Invite people" : "Joined network"}
                    </button>
                  ) : (
                    network.visibility === "public" && (
                      <button
                        className="cm-join"
                        disabled={busy}
                        onClick={() =>
                          void mutate(`networks/${network.id}/join`, "POST")
                        }
                      >
                        <Users size={15} />
                        Join network
                      </button>
                    )
                  )}
                  <button
                    onClick={() => {
                      setTab("Projects");
                      document
                        .getElementById("cm-community-feed")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  >
                    <BookOpen size={15} />
                    Projects
                  </button>
                  <button
                    onClick={() => {
                      setTab("Resources");
                    }}
                  >
                    <Gamepad2 size={15} />
                    Games & resources
                  </button>
                  {canManage && (
                    <button
                      onClick={() => {
                        setNetworkEdit(true);
                        open("network", "Edit network");
                      }}
                    >
                      <Settings2 size={15} />
                      Edit network
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="cm-join"
                  onClick={() => {
                    setNetworkEdit(false);
                    open("network", "Create a network");
                  }}
                >
                  <Plus size={15} />
                  Create a network
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      <div className="cm-workspace-tools">
        {view === "networks" && data.networks.length > 0 && (
          <label className="cm-network-select">
            <Globe2 size={15} />
            <select
              aria-label="Select network"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="cm-search">
          <Search size={15} />
          <input
            aria-label="Search community posts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a conversation…"
          />
        </label>
        <button
          className={customize ? "active" : ""}
          onClick={() => setCustomize(!customize)}
        >
          <Settings2 size={15} />
          Arrange your space
        </button>
        <button
          aria-label="Edit your community profile"
          onClick={() => open("profile", "Your discovery profile")}
        >
          <span className="cm-avatar small">
            {initials(data.profile.display_name)}
          </span>
        </button>
      </div>
      {preview && (
        <div className="cm-preview-note">
          <Sparkles size={13} />
          Interactive preview · your changes are saved in this browser.
          Invitations and other people’s activity require connected accounts.
        </div>
      )}
      {customize && (
        <div className="cm-customize-banner">
          <GripVertical size={15} />
          <span>Drag panels or use their arrows. Hidden panels:</span>
          {panels
            .filter((p) => p.hidden)
            .map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  void savePanels(
                    panels.map((item) =>
                      item.id === p.id ? { ...item, hidden: false } : item,
                    ),
                  )
                }
              >
                {panel(p.id).title}
                <Plus size={12} />
              </button>
            ))}
          <button onClick={() => void savePanels(panelDefaults(view))}>
            Restore layout
          </button>
        </div>
      )}
      {error && (
        <div className="cm-error" role="alert">
          {error}
          <button
            aria-label="Dismiss community error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(incoming.length > 0 || incomingConnections.length > 0) && (
        <div className="cm-invitations">
          <Bell size={15} />
          {incoming.map((invite) => (
            <div key={invite.id}>
              <span>
                You’re invited to{" "}
                {data.networks.find((n) => n.id === invite.network_id)?.name ||
                  "a network"}{" "}
                as a {invite.role}.
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(`invitations/${invite.id}/accept`, "POST")
                }
              >
                Accept invitation
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(`invitations/${invite.id}/decline`, "POST")
                }
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="cm-columns">
        {view === "feed" && (
          <aside className="cm-left-widgets">
            {panels.slice(0, 4).map(renderPanel)}
          </aside>
        )}
        <main className="cm-feed-column" id="cm-community-feed">
          {view === "networks" && (
            <section className="cm-network-cast">
              <Sparkles size={16} />
              <span>Think it through with your cast</span>
              <div>
                {agents
                  .filter((a) => !a.archived)
                  .slice(0, 6)
                  .map((agent, index) => (
                    <button
                      key={agent.id}
                      title={agent.name}
                      onClick={() =>
                        onInviteAgent
                          ? onInviteAgent(agent.id)
                          : integration(`${agent.name} · personal chat`)
                      }
                    >
                      <CastAvatar agent={agent} />
                    </button>
                  ))}
              </div>
              <small>Private agents</small>
            </section>
          )}
          <section className="cm-composer">
            <div className="cm-composer-row">
              <span className="cm-avatar">
                {initials(data.profile.display_name)}
              </span>
              <textarea
                aria-label="Write a community post"
                placeholder={
                  view === "networks"
                    ? "Bring an idea to the conversation…"
                    : "What’s on your mind?"
                }
                value={draft}
                maxLength={10000}
                onChange={(e) => setDraft(e.target.value)}
                rows={draft.includes("\n") ? 3 : 1}
              />
              <button
                className="cm-post-button"
                disabled={
                  busy || !draft.trim() || (view === "networks" && !membership)
                }
                onClick={() => void publish()}
              >
                Post <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="cm-composer-tools">
              <button
                aria-label="Add a link to your post"
                className={showLink ? "active" : ""}
                onClick={() => setShowLink(!showLink)}
              >
                <Link2 size={16} />
                <span>Add a link</span>
              </button>
              {view === "feed" && (
                <label>
                  <Users size={13} />
                  <select
                    aria-label="Post audience"
                    value={audience}
                    onChange={(e) =>
                      setAudience(e.target.value as CommunityPost["audience"])
                    }
                  >
                    <option value="connections">Connections</option>
                    <option value="private">Only me</option>
                    {data.profile.discoverable && (
                      <option value="public">Discoverable</option>
                    )}
                  </select>
                </label>
              )}
              {view === "networks" && !membership && (
                <small>
                  {network
                    ? "Join this network to share a post."
                    : "Create a network to begin."}
                </small>
              )}
            </div>
            {showLink && (
              <input
                className="cm-link-input"
                aria-label="Post link URL"
                type="url"
                placeholder="https://…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            )}
          </section>
          <nav className="cm-feed-tabs" aria-label="Community feed filter">
            {(view === "feed"
              ? ["For you", "Connections", "Networks", "Saved"]
              : ["For you", "Projects", "Resources", "Saved"]
            ).map((name) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name === "For you" && view === "networks" ? "All posts" : name}
              </button>
            ))}
            <span>
              Latest <ChevronDown size={12} />
            </span>
          </nav>
          {loading && (
            <div className="cm-loading" role="status">
              Opening your community…
            </div>
          )}
          {!loading &&
          view === "networks" &&
          ["Projects", "Resources"].includes(tab) ? (
            <section className="cm-post cm-resources-view">
              <h2>
                {tab === "Projects" ? "Shared projects" : "Resources & games"}
              </h2>
              <p>Links your network has chosen to share.</p>
              {data.resources
                .filter(
                  (r) =>
                    r.network_id === selected &&
                    (tab === "Projects"
                      ? r.kind === "project"
                      : r.kind !== "project"),
                )
                .map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <BookOpen size={20} />
                    <span>
                      {r.title}
                      <small>{r.kind}</small>
                    </span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              {canManage && (
                <button
                  className="cm-soft-button"
                  onClick={() => open("resource", "Add a resource")}
                >
                  <Plus size={14} />
                  Add a link
                </button>
              )}
            </section>
          ) : (
            <>
              {feedPosts.map((post) => {
                const likes = data.reactions.filter(
                  (r) => r.post_id === post.id && r.kind === "like",
                );
                const liked = likes.some((r) => r.user_id === user.id);
                const saved = data.reactions.some(
                  (r) =>
                    r.post_id === post.id &&
                    r.kind === "bookmark" &&
                    r.user_id === user.id,
                );
                const replies = data.replies
                  .filter((r) => r.post_id === post.id)
                  .sort((a, b) => a.created_at.localeCompare(b.created_at));
                return (
                  <article className="cm-post" key={post.id}>
                    <header>
                      <span className="cm-avatar">
                        {initials(profileName(post.user_id))}
                      </span>
                      <div>
                        <strong>{profileName(post.user_id)}</strong>
                        {post.user_id === user.id && <Check size={12} />}
                        <small>
                          {stamp(post.created_at)}
                          {post.network_id && view === "feed"
                            ? ` · ${data.networks.find((n) => n.id === post.network_id)?.name || "Network"}`
                            : post.network_id
                              ? ""
                              : post.audience === "private"
                                ? " · Only you"
                                : post.audience === "connections"
                                  ? " · Connections"
                                  : " · Discoverable"}
                        </small>
                      </div>
                      {post.user_id === user.id && (
                        <button
                          className="cm-icon-button"
                          aria-label="Edit post"
                          onClick={() => {
                            setEditingPost(post);
                            open("post", "Edit your post");
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {(post.user_id === user.id ||
                        (view === "networks" && canManage)) && (
                        <button
                          className="cm-icon-button"
                          aria-label="Delete post"
                          disabled={busy}
                          onClick={() =>
                            void mutate(`posts/${post.id}`, "DELETE")
                          }
                        >
                          <X size={14} />
                        </button>
                      )}
                    </header>
                    <p>{post.content}</p>
                    {post.link_url && (
                      <a
                        className="cm-post-link"
                        href={post.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Link2 size={20} />
                        <span>
                          {new URL(post.link_url).hostname}
                          <small>{post.link_url}</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </a>
                    )}
                    <footer>
                      <button
                        className={liked ? "liked" : ""}
                        disabled={busy}
                        onClick={() =>
                          void mutate("reactions", "POST", {
                            post_id: post.id,
                            kind: "like",
                            active: !liked,
                          })
                        }
                        aria-label={liked ? "Unlike post" : "Like post"}
                        aria-pressed={liked}
                      >
                        <Heart
                          size={15}
                          fill={liked ? "currentColor" : "none"}
                        />
                        <span>{likes.length}</span>
                      </button>
                      <button
                        aria-expanded={openReplies.includes(post.id)}
                        onClick={() =>
                          setOpenReplies(
                            openReplies.includes(post.id)
                              ? openReplies.filter((id) => id !== post.id)
                              : [...openReplies, post.id],
                          )
                        }
                      >
                        <MessageCircle size={15} />
                        <span>{replies.length}</span>
                        <span className="cm-action-label">Reply</span>
                      </button>
                      <button
                        className={saved ? "saved" : ""}
                        disabled={busy}
                        aria-label={saved ? "Remove bookmark" : "Bookmark post"}
                        aria-pressed={saved}
                        onClick={() =>
                          void mutate("reactions", "POST", {
                            post_id: post.id,
                            kind: "bookmark",
                            active: !saved,
                          })
                        }
                      >
                        <Bookmark
                          size={15}
                          fill={saved ? "currentColor" : "none"}
                        />
                      </button>
                    </footer>
                    {openReplies.includes(post.id) && (
                      <section className="cm-replies">
                        {replies.map((reply) => (
                          <div className="cm-reply" key={reply.id}>
                            <span className="cm-avatar small">
                              {initials(profileName(reply.user_id))}
                            </span>
                            <div>
                              <strong>{profileName(reply.user_id)}</strong>
                              <p>{reply.content}</p>
                              <small>{stamp(reply.created_at)}</small>
                            </div>
                            {(reply.user_id === user.id || canManage) && (
                              <button
                                aria-label="Delete reply"
                                disabled={busy}
                                onClick={() =>
                                  void mutate(`replies/${reply.id}`, "DELETE")
                                }
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void mutate("replies", "POST", {
                              post_id: post.id,
                              content: replyDrafts[post.id] || "",
                            }).then((ok) => {
                              if (ok)
                                setReplyDrafts({
                                  ...replyDrafts,
                                  [post.id]: "",
                                });
                            });
                          }}
                        >
                          <input
                            aria-label="Write a reply"
                            value={replyDrafts[post.id] || ""}
                            maxLength={3000}
                            onChange={(e) =>
                              setReplyDrafts({
                                ...replyDrafts,
                                [post.id]: e.target.value,
                              })
                            }
                            placeholder="Add to the conversation…"
                          />
                          <button
                            type="submit"
                            disabled={busy || !replyDrafts[post.id]?.trim()}
                          >
                            <ArrowUpRight size={15} />
                          </button>
                        </form>
                      </section>
                    )}
                  </article>
                );
              })}
              {!loading && !feedPosts.length && (
                <section className="cm-feed-empty">
                  <div className="cm-feed-empty-art">
                    <span className="cm-leaf leaf-one" />
                    <span className="cm-leaf leaf-two" />
                    <span className="cm-leaf leaf-three" />
                    <MessageCircle size={38} />
                  </div>
                  <span className="cm-eyebrow">
                    A LITTLE SPACE FOR SOMETHING GOOD
                  </span>
                  <h2>
                    {search
                      ? "No conversations match yet."
                      : tab === "Saved"
                        ? "Keep the ideas you want to return to."
                        : "Your next conversation starts here."}
                  </h2>
                  <p>
                    {search
                      ? "Try another word or start a new conversation."
                      : "Share a thought, gather your people, and make room for what comes next."}
                  </p>
                  <div>
                    <button
                      className="cm-soft-button"
                      onClick={() =>
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".cm-composer textarea",
                          )
                          ?.focus()
                      }
                    >
                      Share a thought <ArrowUpRight size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setNetworkEdit(false);
                        open("network", "Create a network");
                      }}
                    >
                      Create a network <Plus size={14} />
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
        <aside className="cm-right-widgets">
          {(view === "feed" ? panels.slice(4) : panels).map(renderPanel)}
        </aside>
      </div>
      <dialog
        ref={modal}
        className="cm-dialog"
        onClose={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      >
        <header>
          <div>
            <span className="cm-eyebrow">YOUR SPACE, YOUR CHOICE</span>
            <h2>{dialogTitle}</h2>
          </div>
          <button
            aria-label="Close community dialog"
            onClick={() => setDialog(null)}
          >
            <X size={19} />
          </button>
        </header>
        {dialog === "integrations" ? (
          <div className="cm-dialog-body">
            <div className="cm-integration-art">
              <Sparkles size={31} />
            </div>
            <p>
              {dialogTitle === "Your automations"
                ? "Schedules you create run from the app’s scheduler and save completed work to your inbox."
                : "Connect a supported provider to bring real results into your workspace. Recommendations, market prices, and live calls are shown only when their sources are connected."}
            </p>
            <p className="cm-muted">
              Your private cast, projects, and saved community posts work
              independently of these integrations.
            </p>
            <button className="cm-soft-button" onClick={() => setDialog(null)}>
              Got it <Check size={14} />
            </button>
          </div>
        ) : dialog === "members" ? (
          <div className="cm-dialog-body">
            <p>
              {network?.name} · {network?.member_count || 0} members
            </p>
            {data.members
              .filter((m) => m.network_id === selected)
              .map((member) => (
                <div className="cm-member" key={member.user_id}>
                  <span className="cm-avatar">
                    {initials(profileName(member.user_id))}
                  </span>
                  <strong>{profileName(member.user_id)}</strong>
                  {membership?.role === "owner" && member.role !== "owner" ? (
                    <select
                      aria-label={`Role for ${profileName(member.user_id)}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(e) =>
                        void mutate(
                          `members/${selected}/${member.user_id}`,
                          "PATCH",
                          { role: e.target.value },
                        )
                      }
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                    </select>
                  ) : (
                    <small>{member.role}</small>
                  )}
                  {member.role !== "owner" &&
                    (member.user_id === user.id ||
                      membership?.role === "owner" ||
                      (membership?.role === "moderator" &&
                        member.role === "member")) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `members/${selected}/${member.user_id}`,
                            "DELETE",
                          )
                        }
                      >
                        {member.user_id === user.id ? "Leave" : "Remove"}
                      </button>
                    )}
                </div>
              ))}
          </div>
        ) : (
          <form
            className="cm-dialog-body"
            onSubmit={(e) => void submitDialog(e)}
          >
            {dialog === "network" && (
              <>
                <label>
                  Name
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={networkEdit ? network?.name : ""}
                    placeholder="The Builders"
                  />
                </label>
                <label>
                  Purpose
                  <textarea
                    name="purpose"
                    maxLength={2000}
                    defaultValue={networkEdit ? network?.purpose : ""}
                    placeholder="The ideas and people you want to bring together."
                    rows={3}
                  />
                </label>
                <label>
                  Visibility
                  <select
                    name="visibility"
                    defaultValue={networkEdit ? network?.visibility : "private"}
                  >
                    <option value="private">
                      Private · invitation required
                    </option>
                    <option value="public">
                      Discoverable · anyone signed in can join
                    </option>
                  </select>
                </label>
                <label>
                  Topics
                  <input
                    name="topics"
                    defaultValue={networkEdit ? network?.topics.join(", ") : ""}
                    placeholder="Design, clean energy, building"
                    maxLength={600}
                  />
                </label>
                <p className="cm-muted">
                  Topics connect networks on the graph. You own this network and
                  decide who can moderate it.
                </p>
                {networkEdit && (
                  <button
                    type="button"
                    className="cm-member-link"
                    onClick={() => open("members", "Network members")}
                  >
                    <Users size={15} />
                    Manage members and roles
                  </button>
                )}
              </>
            )}
            {dialog === "post" && editingPost && (
              <>
                <label>
                  Your thought
                  <textarea
                    autoFocus
                    name="content"
                    required
                    maxLength={10000}
                    defaultValue={editingPost.content}
                    rows={6}
                  />
                </label>
                <label>
                  Link
                  <input
                    name="link_url"
                    type="url"
                    pattern="https://.*"
                    maxLength={2000}
                    defaultValue={editingPost.link_url}
                    placeholder="https://… (optional)"
                  />
                </label>
                {!editingPost.network_id && (
                  <label>
                    Audience
                    <select name="audience" defaultValue={editingPost.audience}>
                      <option value="private">Only me</option>
                      <option value="connections">Connections</option>
                      {data.profile.discoverable && (
                        <option value="public">Discoverable</option>
                      )}
                    </select>
                  </label>
                )}
                {editingPost.network_id && (
                  <p className="cm-muted">
                    Network posts stay visible under the network’s access
                    settings.
                  </p>
                )}
              </>
            )}
            {dialog === "profile" && (
              <>
                <label>
                  Display name
                  <input
                    autoFocus
                    name="display_name"
                    required
                    defaultValue={data.profile.display_name}
                    maxLength={80}
                  />
                </label>
                <label>
                  A little about you
                  <textarea
                    name="bio"
                    defaultValue={data.profile.bio}
                    maxLength={1000}
                    rows={3}
                  />
                </label>
                <label>
                  Interests, separated by commas
                  <input
                    name="interests"
                    defaultValue={data.profile.interests.join(", ")}
                    maxLength={1000}
                    placeholder="Architecture, music, aviation"
                  />
                </label>
                <label className="cm-checkbox">
                  <input
                    name="discoverable"
                    type="checkbox"
                    defaultChecked={data.profile.discoverable}
                  />
                  <span>
                    Let other signed-in people discover my profile and shared
                    interests.
                  </span>
                </label>
                <p className="cm-muted">
                  Discovery is optional. Suggestions compare interests people
                  explicitly share. Your location, conversations, and private
                  projects are never included.
                </p>
              </>
            )}
            {dialog === "invite" && (
              <>
                <p>
                  The person you invite accepts the invitation from their own
                  account. Adding a name never creates an account or grants
                  access automatically.
                </p>
                <label>
                  Invite a discoverable person
                  <select autoFocus name="target_id" required defaultValue="">
                    <option value="" disabled>
                      Choose a person
                    </option>
                    {data.profiles
                      .filter(
                        (p) =>
                          p.user_id !== user.id &&
                          p.discoverable &&
                          !data.members.some(
                            (m) =>
                              m.network_id === selected &&
                              m.user_id === p.user_id,
                          ),
                      )
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.display_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="member">Member · post and reply</option>
                    {membership?.role === "owner" && (
                      <option value="moderator">
                        Moderator · manage posts, events, resources, and member
                        invitations
                      </option>
                    )}
                  </select>
                </label>
                <p className="cm-muted">
                  No people listed yet? They can create an account and opt into
                  profile discovery. Invitations expire after seven days.
                </p>
              </>
            )}
            {dialog === "event" && (
              <>
                <label>
                  Event name
                  <input
                    autoFocus
                    name="title"
                    maxLength={160}
                    required
                    placeholder="A little time to build"
                  />
                </label>
                <label>
                  Where does it belong?
                  <select
                    name="network_id"
                    defaultValue={canManage ? selected : ""}
                  >
                    <option value="">Your private calendar</option>
                    {data.networks
                      .filter((n) =>
                        data.members.some(
                          (m) =>
                            m.network_id === n.id &&
                            m.user_id === user.id &&
                            m.role !== "member",
                        ),
                      )
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Date and time (your browser’s timezone)
                  <input name="starts_at" type="datetime-local" required />
                </label>
                <label>
                  Place or online venue
                  <input
                    name="location"
                    maxLength={200}
                    placeholder="Online, or a general venue"
                  />
                </label>
                <label>
                  Event link
                  <input
                    name="url"
                    type="url"
                    pattern="https://.*"
                    maxLength={2000}
                    placeholder="https://… (optional)"
                  />
                </label>
                <p className="cm-muted">
                  The feed displays events in Arizona time. An event doesn’t
                  send external invitations or turn on location sharing.
                </p>
              </>
            )}
            {dialog === "resource" && (
              <>
                <label>
                  Title
                  <input autoFocus name="title" required maxLength={160} />
                </label>
                <label>
                  Network
                  <select
                    name="network_id"
                    required
                    defaultValue={canManage ? selected : ""}
                  >
                    <option value="" disabled>
                      Choose a network you manage
                    </option>
                    {data.networks
                      .filter((n) =>
                        data.members.some(
                          (m) =>
                            m.network_id === n.id &&
                            m.user_id === user.id &&
                            m.role !== "member",
                        ),
                      )
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Link
                  <input
                    name="url"
                    required
                    type="url"
                    pattern="https://.*"
                    maxLength={2000}
                    placeholder="https://…"
                  />
                </label>
                <label>
                  Kind
                  <select name="kind">
                    <option value="resource">Resource</option>
                    <option value="project">Public project</option>
                    <option value="game">Game</option>
                  </select>
                </label>
                <p className="cm-muted">
                  Links should already be shareable. Adding a project link
                  doesn’t change access to your private Cast projects.
                </p>
              </>
            )}
            <div className="cm-dialog-footer">
              <button type="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="cm-soft-button" type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : dialog === "invite"
                    ? "Send invitation"
                    : "Save"}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="cm-error" role="alert">
            {error}
          </div>
        )}
      </dialog>
    </div>
  );
}
