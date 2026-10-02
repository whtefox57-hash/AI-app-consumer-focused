export type AgentConfig = {
  role?: string;
  beliefs?: string;
  origin?: string;
  story?: string;
  emotions?: string[];
  capabilities?: string[];
  tools?: string[];
  responseStyle?: "balanced" | "concise" | "thorough";
  examples?: { prompt: string; response: string }[];
  document_ids?: string[];
  workflow_ids?: string[];
};
export type Workflow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  kind: "text" | "image" | "video";
  steps: { id: string; title: string; instructions: string }[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};
export type Agent = {
  id: string;
  user_id: string;
  name: string;
  avatar: string;
  personality: string;
  worldview: string;
  background: string;
  expertise: string;
  instructions: string;
  voice: string;
  memories: string;
  permissions: {
    documents: boolean;
    memory: boolean;
    search: boolean;
    scheduled: boolean;
  };
  project_scope: string[];
  archived: boolean;
  config?: AgentConfig;
};
export type Project = {
  id: string;
  name: string;
  archived: boolean;
  summary: string;
};
export type Message = {
  id: string;
  project_id: string;
  agent_id: string | null;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
  request_id: string | null;
};
export type Source = {
  id: string;
  title: string;
  snippet: string;
  url?: string;
};
export type Document = {
  id: string;
  project_id: string;
  name: string;
  storage_path: string | null;
  status: string;
  error: string | null;
  chunks: { id: string; text: string }[];
};
export type Job = {
  id: string;
  title: string;
  kind: "reminder" | "ideas" | "research";
  agent_id: string | null;
  project_id: string;
  topic: string;
  cron: string;
  timezone: string;
  next_run: string;
  enabled: boolean;
  notify: boolean;
  allowance: number;
  last_error: string | null;
};
export type InboxItem = {
  id: string;
  job_id: string;
  title: string;
  body: string;
  why: string;
  sources: Source[];
  created_at: string;
  read: boolean;
};
export type Boot = {
  user: { id: string; email: string };
  agents: Agent[];
  workflows?: Workflow[];
  projects: Project[];
  memberships: { project_id: string; agent_id: string }[];
  messages: Message[];
  documents: Document[];
  jobs: Job[];
  inbox: InboxItem[];
  profile: { settings: Record<string, unknown> };
  usage: {
    kind: string;
    status: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    duration_ms: number | null;
    created_at: string;
  }[];
  capabilities: {
    ai: boolean;
    speech: boolean;
    search: boolean;
    music: boolean;
    owner: boolean;
    model: string;
    strongModel: string;
    strong: boolean;
  };
};
