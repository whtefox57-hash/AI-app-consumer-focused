import { CronExpressionParser } from "cron-parser";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  ready,
  provider,
  systemPrompt,
  boundedContext,
  model,
  strongModel,
} from "./ai";
import { admin, checked } from "./supabase";
import { chatSchema, inScope } from "./validation";
import { retrieve, citedSources } from "./retrieval";
import type { Agent, Document, Message, Job, Source } from "./types";
export function nextRun(cron: string, timezone: string, after = new Date()) {
  try {
    const a = CronExpressionParser.parse(cron, {
      tz: timezone,
      currentDate: after,
    });
    const first = a.next().toDate();
    const second = a.next().toDate();
    if (second.getTime() - first.getTime() < 3600000)
      throw new Error("too frequent");
    return first.toISOString();
  } catch {
    throw new AppError(
      400,
      "Use a valid timezone and cron schedule, at most once per hour.",
    );
  }
}
export async function reserve(
  user: string,
  kind: string,
  selected: string,
  count = 1,
) {
  const result = await admin().rpc("reserve_usage", {
    p_user: user,
    p_kind: kind,
    p_model: selected,
    p_count: count,
  });
  if (result.error)
    throw new AppError(
      429,
      "Your allowance is reached, or the owner has paused AI.",
    );
  return result.data as string[];
}
export async function finish(
  id: string,
  result: {
    model?: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    duration?: number;
  },
  status = "done",
) {
  checked(
    await admin()
      .from("usage")
      .update({
        status,
        model: result.model,
        input_tokens: result.inputTokens ?? null,
        output_tokens: result.outputTokens ?? null,
        duration_ms: result.duration ?? null,
      })
      .eq("id", id),
  );
}
export async function chat(
  supabase: SupabaseClient,
  user: string,
  body: unknown,
  signal: AbortSignal,
  onDelta?: (agent: string, text: string) => void,
) {
  const input = chatSchema.parse(body);
  if (!ready())
    throw new AppError(
      503,
      "AI is not connected. Add the owner’s billed Gemini credential through secure settings.",
    );
  const privileged = admin();
  const { data: existing } = await privileged
    .from("requests")
    .select("status")
    .eq("id", input.requestId)
    .eq("user_id", user)
    .maybeSingle();
  if (existing) {
    if (existing.status === "done")
      return checked(
        await supabase
          .from("messages")
          .select("*")
          .eq("request_id", input.requestId),
      );
    throw new AppError(
      409,
      "This turn is already running or completed. Retry using a new turn.",
    );
  }
  const project = checked(
    await supabase
      .from("projects")
      .select("*")
      .eq("id", input.projectId)
      .single(),
  );
  if (!project || project.archived)
    throw new AppError(404, "Project is unavailable.");
  const agents = checked(
    await supabase.from("agents").select("*").in("id", input.agentIds),
  ) as Agent[];
  const members = checked(
    await supabase
      .from("memberships")
      .select("agent_id")
      .eq("project_id", input.projectId),
  );
  if (
    agents.length !== input.agentIds.length ||
    agents.some(
      (a) =>
        !inScope(a, input.projectId) ||
        !members.some((m) => m.agent_id === a.id),
    )
  )
    throw new AppError(
      403,
      "One or more agents no longer have access to this project.",
    );
  await privileged
    .from("requests")
    .update({ status: "failed" })
    .eq("project_id", input.projectId)
    .eq("user_id", user)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 180000).toISOString());
  const inserted = await privileged.from("requests").insert({
    id: input.requestId,
    user_id: user,
    project_id: input.projectId,
  });
  if (inserted.error)
    throw new AppError(409, "A response is already running in this project.");
  let reservations: string[] = [];
  try {
    reservations = await reserve(
      user,
      "text",
      input.strong ? strongModel : model,
      agents.length,
    );
    const history = (
      checked(
        await supabase
          .from("messages")
          .select("*")
          .eq("project_id", input.projectId)
          .order("created_at", { ascending: false })
          .limit(12),
      ) as Message[]
    ).reverse();
    const docs = checked(
      await supabase
        .from("documents")
        .select("*")
        .eq("project_id", input.projectId)
        .eq("status", "ready"),
    ) as Document[];
    checked(
      await supabase.from("messages").insert({
        project_id: input.projectId,
        role: "user",
        content: input.text,
        request_id: input.requestId,
      }),
    );
    const replies: Message[] = [];
    for (let i = 0; i < agents.length; i++) {
      const agent = agents.find((a) => a.id === input.agentIds[i])!;
      const sources = agent.permissions.documents
        ? retrieve(docs, input.text)
        : [];
      const result = await provider.generate({
        system: systemPrompt(agent),
        prompt:
          JSON.stringify({
            projectSummary: project.summary || "",
            conversation: JSON.parse(
              boundedContext([...history, ...replies], sources, input.text),
            ),
          }) +
          (agents.length > 1
            ? "\nYou are in a moderated roundtable. Give one distinct contribution; no further turns will run."
            : ""),
        strong: input.strong,
        signal,
        onDelta: onDelta ? (text) => onDelta(agent.id, text) : undefined,
      });
      await finish(reservations[i], result);
      const latest = checked(
        await supabase.from("agents").select("*").eq("id", agent.id).single(),
      ) as Agent;
      const membership = checked(
        await supabase
          .from("memberships")
          .select("agent_id")
          .eq("project_id", input.projectId)
          .eq("agent_id", agent.id)
          .maybeSingle(),
      );
      const request = checked(
        await privileged
          .from("requests")
          .select("status")
          .eq("id", input.requestId)
          .eq("user_id", user)
          .single(),
      );
      if (signal.aborted || request.status !== "pending")
        throw new AppError(499, "Response cancelled.");
      if (
        !membership ||
        !inScope(latest, input.projectId) ||
        JSON.stringify(latest.permissions) !==
          JSON.stringify(agent.permissions) ||
        latest.memories !== agent.memories
      )
        throw new AppError(
          403,
          "Agent access or memory changed during this request. The response was discarded.",
        );
      const message = checked(
        await supabase
          .from("messages")
          .insert({
            project_id: input.projectId,
            agent_id: agent.id,
            role: "assistant",
            content: result.text,
            sources: citedSources(result.text, sources),
            request_id: input.requestId,
          })
          .select("*")
          .single(),
      ) as Message;
      replies.push(message);
    }
    checked(
      await privileged
        .from("requests")
        .update({ status: "done" })
        .eq("id", input.requestId)
        .eq("user_id", user)
        .eq("status", "pending"),
    );
    return replies;
  } catch (error) {
    for (const reservation of reservations)
      await privileged
        .from("usage")
        .update({ status: signal.aborted ? "cancelled" : "failed" })
        .eq("id", reservation)
        .eq("status", "reserved");
    await privileged
      .from("requests")
      .update({ status: signal.aborted ? "cancelled" : "failed" })
      .eq("id", input.requestId)
      .eq("user_id", user)
      .eq("status", "pending");
    throw error;
  }
}
export async function runJobs() {
  const store = admin();
  const runs = checked(await store.rpc("claim_jobs")) as {
    id: string;
    job_id: string;
    user_id: string;
    scheduled_at: string;
    attempts: number;
  }[];
  const outcomes = [];
  for (const run of runs) {
    let reservation: string | undefined;
    try {
      const job = checked(
        await store.from("jobs").select("*").eq("id", run.job_id).single(),
      ) as Job;
      nextRun(job.cron, job.timezone);
      if (!job.enabled) throw new AppError(409, "Job was paused.");
      const project = checked(
        await store
          .from("projects")
          .select("archived")
          .eq("id", job.project_id)
          .eq("user_id", run.user_id)
          .single(),
      );
      if (project.archived) throw new AppError(409, "Project was archived.");
      let text = job.topic;
      let sources: Source[] = [];
      if (job.kind !== "reminder") {
        const agent = checked(
          await store
            .from("agents")
            .select("*")
            .eq("id", job.agent_id)
            .eq("user_id", run.user_id)
            .single(),
        ) as Agent;
        const member = checked(
          await store
            .from("memberships")
            .select("agent_id")
            .eq("agent_id", agent.id)
            .eq("project_id", job.project_id)
            .eq("user_id", run.user_id)
            .maybeSingle(),
        );
        if (
          !member ||
          !inScope(agent, job.project_id) ||
          !agent.permissions.scheduled ||
          (job.kind === "research" && !agent.permissions.search)
        )
          throw new AppError(
            403,
            "Agent lacks scheduled-work or search permission.",
          );
        [reservation] = await reserve(
          run.user_id,
          job.kind === "research" ? "search" : "text",
          model,
        );
        const result = await provider.generate({
          system: systemPrompt(agent),
          prompt: boundedContext(
            [],
            agent.permissions.documents
              ? retrieve(
                  checked(
                    await store
                      .from("documents")
                      .select("*")
                      .eq("project_id", job.project_id)
                      .eq("user_id", run.user_id)
                      .eq("status", "ready"),
                  ) as Document[],
                  job.topic,
                )
              : [],
            job.topic,
          ),
          search: job.kind === "research",
        });
        await finish(reservation, result);
        text = result.text;
        sources = result.sources;
        const latest = checked(
          await store
            .from("agents")
            .select("*")
            .eq("id", agent.id)
            .eq("user_id", run.user_id)
            .single(),
        ) as Agent;
        if (
          !inScope(latest, job.project_id) ||
          !latest.permissions.scheduled ||
          (job.kind === "research" && !latest.permissions.search)
        )
          throw new AppError(403, "Agent permission was revoked.");
      }
      const active = checked(
        await store.from("jobs").select("enabled").eq("id", job.id).single(),
      );
      if (!active.enabled)
        throw new AppError(409, "Job was paused during generation.");
      checked(
        await store.from("inbox").upsert(
          {
            user_id: run.user_id,
            job_id: job.id,
            run_id: run.id,
            title: job.title,
            body: text,
            sources,
            why: `You enabled ${job.kind} for this project, scheduled ${job.cron} (${job.timezone}).`,
          },
          { onConflict: "run_id" },
        ),
      );
      checked(
        await store
          .from("job_runs")
          .update({ status: "done", error: null })
          .eq("id", run.id),
      );
      checked(
        await store
          .from("jobs")
          .update({
            next_run: nextRun(job.cron, job.timezone, new Date()),
            last_error: null,
          })
          .eq("id", job.id),
      );
      outcomes.push({ id: run.id, status: "done" });
    } catch (e) {
      const message =
        e instanceof AppError
          ? e.message
          : "The job could not complete. Check provider and database configuration.";
      if (reservation)
        await store
          .from("usage")
          .update({ status: "failed" })
          .eq("id", reservation)
          .eq("status", "reserved");
      await store
        .from("job_runs")
        .update({
          status: run.attempts >= 3 ? "failed" : "retry",
          error: message,
          lease_until: new Date(
            Date.now() + run.attempts * 120000,
          ).toISOString(),
        })
        .eq("id", run.id);
      await store
        .from("jobs")
        .update({
          last_error: message,
          ...(run.attempts >= 3 ? { enabled: false } : {}),
        })
        .eq("id", run.job_id);
      outcomes.push({ id: run.id, status: "error" });
    }
  }
  return outcomes;
}
