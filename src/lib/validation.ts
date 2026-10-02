import { z } from "zod";
export const id = z.string().uuid();
const short = z.string().trim().min(1).max(100);
const distinctIds = (maximum: number) =>
  z
    .array(id)
    .max(maximum)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate selections",
    );
export const agentConfigSchema = z
  .object({
    role: z.string().max(100).optional(),
    beliefs: z.string().max(2000).optional(),
    origin: z.string().max(1000).optional(),
    story: z.string().max(2000).optional(),
    emotions: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    capabilities: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    tools: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    responseStyle: z.enum(["balanced", "concise", "thorough"]).optional(),
    examples: z
      .array(
        z
          .object({
            prompt: z.string().min(1).max(500),
            response: z.string().min(1).max(1500),
          })
          .strict(),
      )
      .max(6)
      .optional(),
    document_ids: distinctIds(20).optional(),
    workflow_ids: distinctIds(20).optional(),
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 23000,
    "Character preferences are too large.",
  );
export const workflowSchema = z
  .object({
    name: short,
    description: z.string().max(1000).default(""),
    kind: z.enum(["text", "image", "video"]).default("text"),
    steps: z
      .array(
        z
          .object({
            id,
            title: short,
            instructions: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine(
    (workflow) => workflow.kind === "text" || !workflow.enabled,
    "Image and video workflows require an unavailable executor; save them disabled.",
  )
  .refine(
    (workflow) =>
      new TextEncoder().encode(JSON.stringify(workflow.steps)).length <= 19000,
    "Workflow steps are too large.",
  )
  .refine(
    (workflow) =>
      new Set(workflow.steps.map((step) => step.id)).size ===
      workflow.steps.length,
    "Duplicate workflow steps",
  );
export const applyWorkflowSchema = z
  .object({
    applyToAll: z.boolean().default(false),
    agentIds: distinctIds(500).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.applyToAll ? !value.agentIds.length : value.agentIds.length > 0,
    "Choose agents or apply to all.",
  );
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
  config: agentConfigSchema.default({}),
});
export const projectSchema = z.object({
  name: short,
  summary: z.string().max(4000).default(""),
  archived: z.boolean().default(false),
});
export const chatSchema = z
  .object({
    projectId: id,
    agentIds: z.array(id).min(1).max(10),
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
