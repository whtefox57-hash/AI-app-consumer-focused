import { z } from "zod";
export const id = z.string().uuid();
const short = z.string().trim().min(1).max(100);
export const agentSchema = z.object({
  name: short,
  avatar: z.string().max(500).default("amber"),
  personality: z.string().max(2000).default(""),
  worldview: z.string().max(2000).default(""),
  background: z.string().max(2000).default(""),
  expertise: z.string().max(2000).default(""),
  instructions: z.string().max(3000).default(""),
  voice: z
    .enum(["Kore", "Puck", "Aoede", "Charon", "Fenrir", "Leda"])
    .default("Kore"),
  memories: z.string().max(6000).default(""),
  permissions: z.object({
    documents: z.boolean(),
    memory: z.boolean(),
    search: z.boolean(),
    scheduled: z.boolean(),
  }),
  project_scope: z.array(id).max(100).default([]),
  archived: z.boolean().default(false),
});
export const projectSchema = z.object({
  name: short,
  summary: z.string().max(4000).default(""),
  archived: z.boolean().default(false),
});
export const chatSchema = z
  .object({
    projectId: id,
    agentIds: z.array(id).min(1).max(3),
    text: z.string().trim().min(1).max(12000),
    requestId: id,
    strong: z.boolean().default(false),
  })
  .refine(
    (v) => new Set(v.agentIds).size === v.agentIds.length,
    "Duplicate participants",
  );
export const jobSchema = z.object({
  title: short,
  kind: z.enum(["reminder", "ideas", "research"]),
  project_id: id,
  agent_id: id.nullable(),
  topic: z.string().min(1).max(3000),
  cron: z.string().max(100),
  timezone: z.string().max(100),
  enabled: z.boolean(),
  notify: z.boolean(),
  allowance: z.number().int().min(1).max(30),
});
export function inScope(
  agent: { project_scope: string[]; archived: boolean },
  project: string,
) {
  return (
    !agent.archived &&
    (!agent.project_scope.length || agent.project_scope.includes(project))
  );
}
