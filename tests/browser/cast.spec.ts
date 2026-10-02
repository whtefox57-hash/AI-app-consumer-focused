import { spawn } from "node:child_process";
import { once } from "node:events";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localEnv } from "../../scripts/local-stack";
const service = createClient(
  localEnv.NEXT_PUBLIC_SUPABASE_URL,
  localEnv.SUPABASE_SERVICE_ROLE_KEY,
);
const email = `cast-${Date.now()}@example.test`;
const password = "Local-test-password-2026";
test("sign up, agents, touch invitations, persistent settings, knowledge, jobs, errors, account isolation, and deletion", async ({
  page,
  request,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("YOUR CAST", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Launch room");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bring your cast together" }),
  ).toBeVisible();
  const product = page
    .locator(".invite-list>div")
    .filter({ hasText: "Product engineer" });
  await product.getByRole("button", { name: "Invite", exact: true }).click();
  const researcher = page
    .locator(".invite-list>div")
    .filter({ has: page.getByText("Researcher", { exact: true }) });
  await researcher.getByRole("button", { name: "Invite", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".participants .participant")).toHaveCount(2);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mira");
  await page
    .getByRole("textbox", { name: "Personality", exact: true })
    .fill("Carefully reason, offer two options, stay warm and concise.");
  await page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(page.getByText("Agent saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.locator(".agent-tile").filter({ hasText: "Mira" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".agent-tile").filter({ hasText: "Mira" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Project knowledge/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("Launch facts");
  await page
    .getByLabel("Note", { exact: true })
    .fill("Mira owns the launch. The approved budget is 4200 dollars.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Launch facts", { exact: true })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("The launch review is scheduled for October 19, 2026."),
  });
  await expect(page.getByText("evidence.txt", { exact: true })).toBeVisible();
  await expect(page.getByText("ready · 1 text sections").first()).toBeVisible();
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content =
    "BT /F1 12 Tf 72 720 Td (The launch budget is 4200 dollars.) Tj ET";
  pdfObjects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < pdfObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.locator("input[type=file]").setInputFiles({
    name: "launch.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  await expect(
    page
      .locator(".document-list>div")
      .filter({ hasText: "launch.pdf" })
      .getByText("ready · 1 text sections", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Message your cast").fill("What is the launch budget?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".toast.error")).toContainText(
    "AI is not connected",
  );
  await expect(page.getByLabel("Message your cast")).toHaveValue(
    "What is the launch budget?",
  );
  await page
    .getByRole("button", { name: "Settings & usage", exact: true })
    .click();
  await page.getByLabel("Timezone", { exact: true }).fill("Europe/London");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Settings & usage", exact: true })
    .click();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    "Europe/London",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const boot = await page.evaluate(
    async () => await (await fetch("/api/boot")).json(),
  );
  const uid = boot.user.id;
  const oversized = await page.evaluate(
    async () =>
      (
        await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "x".repeat(50001) }),
        })
      ).status,
  );
  expect(oversized).toBe(413);
  const exported = await page.evaluate(async () =>
    (await fetch("/api/export")).json(),
  );
  expect(
    exported.data.agents.some((a: { name: string }) => a.name === "Mira"),
  ).toBe(true);
  expect(exported.files).toHaveLength(2);
  const original = await request.get(exported.files[0].signedUrl);
  expect(original.ok()).toBe(true);
  const project = boot.projects.find(
    (p: { name: string }) => p.name === "Launch room",
  );
  // Use the real auth/storage/database services with a second identity, not a mocked API.
  const other = createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const otherEmail = `other-${Date.now()}@example.test`;
  const { data: otherAccount, error } = await other.auth.signUp({
    email: otherEmail,
    password,
  });
  expect(error).toBeNull();
  expect(
    (await other.from("projects").select("*").eq("id", project.id)).data,
  ).toEqual([]);
  expect(
    (
      await other
        .from("messages")
        .insert({ project_id: project.id, role: "user", content: "intrusion" })
    ).error,
  ).toBeTruthy();
  const document = boot.documents.find(
    (d: { storage_path?: string }) => d.storage_path,
  );
  expect(
    (await other.storage.from("cast-private").download(document.storage_path))
      .error,
  ).toBeTruthy();
  // Durable conversation persistence is tested without inventing a model response.
  await service.from("messages").insert({
    user_id: uid,
    project_id: project.id,
    role: "user",
    content: "A saved user note, not a model response.",
  });
  await page.reload();
  await expect(
    page.getByText("A saved user note, not a model response.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Proactive inbox/ }).click();
  await page.getByRole("button", { name: "Schedule something" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Review launch");
  await page
    .getByLabel("Topic or reminder")
    .fill("Review the launch checklist.");
  await page
    .getByRole("button", { name: "Enable schedule", exact: true })
    .click();
  await expect(page.getByText("Review launch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const j = await service.from("jobs").select("*").eq("user_id", uid).single();
  expect(j.error).toBeNull();
  await service
    .from("jobs")
    .update({ next_run: new Date(Date.now() - 10000).toISOString() })
    .eq("id", j.data!.id);
  // Close the browser before processing the scheduled reminder.
  const cookies = await page.context().cookies();
  await page.close();
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/worker.ts"],
    { env: { ...process.env, ...localEnv }, stdio: "ignore" },
  );
  try {
    await expect
      .poll(
        async () =>
          (await service.from("inbox").select("*").eq("user_id", uid)).data
            ?.length,
      )
      .toBe(1);
  } finally {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    await exited;
  }
  const inbox = await service.from("inbox").select("*").eq("user_id", uid);
  expect(inbox.data?.[0]?.body).toBe("Review the launch checklist.");
  const duplicate = await request.get("/api/cron", {
    headers: { Authorization: `Bearer ${localEnv.CRON_SECRET}` },
  });
  expect(duplicate.status()).toBe(200);
  expect(
    (await service.from("inbox").select("*").eq("user_id", uid)).data,
  ).toHaveLength(1);
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const resumed = await context.newPage();
  await resumed.goto("/");
  await expect(
    resumed.getByText("A saved user note, not a model response.", {
      exact: true,
    }),
  ).toBeVisible();
  await resumed.getByRole("button", { name: /Proactive inbox/ }).click();
  await expect(
    resumed.getByText("Review the launch checklist.", { exact: true }),
  ).toBeVisible();
  await resumed
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await resumed.screenshot({ path: "/tmp/cast-desktop.png", fullPage: true });
  await resumed.setViewportSize({ width: 390, height: 844 });
  await resumed.screenshot({ path: "/tmp/cast-mobile.png", fullPage: true });
  expect(
    await resumed.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await resumed
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await resumed
    .getByRole("button", { name: "Settings & usage", exact: true })
    .click();
  await resumed
    .getByText("Delete account and private data", { exact: true })
    .click();
  await resumed.getByLabel("Type DELETE to confirm").fill("DELETE");
  await resumed
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    resumed.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    (await service.from("projects").select("*").eq("user_id", uid)).data,
  ).toEqual([]);
  expect(
    (await service.storage.from("cast-private").list(`${uid}/documents`)).data,
  ).toEqual([]);
  await service.auth.admin.deleteUser(otherAccount.user!.id);
  await context.close();
  expect(errors).toEqual([]);
});
test("anonymous API calls and foreign origins are rejected; health is honest", async ({
  request,
}) => {
  expect((await request.get("/api/boot")).status()).toBe(401);
  expect((await request.get("/api/cron")).status()).toBe(401);
  expect(
    (
      await request.post("/api/agents", {
        headers: { Origin: "https://untrusted.example" },
        data: { name: "intruder" },
      })
    ).status(),
  ).toBe(403);
  const health = await (await request.get("/api/health")).json();
  expect(health.accounts).toBe(true);
  expect(health.ai).toBe(false);
});
test("password recovery arrives in local mail and establishes a real reset session", async ({
  page,
}) => {
  const email = `recovery-${Date.now()}@example.test`;
  const created = await service.auth.admin.createUser({
    email,
    password: "Local-old-password-2026",
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await page.getByLabel("Email address").fill(email);
    await page
      .getByRole("button", { name: "Send recovery link", exact: true })
      .click();
    await expect(
      page.getByText("Check your email for the password recovery link.", {
        exact: true,
      }),
    ).toBeVisible();
    let messageId = "";
    await expect
      .poll(async () => {
        const result = await (
          await fetch("http://127.0.0.1:54324/api/v1/messages")
        ).json();
        messageId =
          result.messages.find((m: { ID: string; To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email),
          )?.ID || "";
        return !!messageId;
      })
      .toBe(true);
    const message = await (
      await fetch(`http://127.0.0.1:54324/api/v1/message/${messageId}`)
    ).json();
    const link = (message.Text || message.HTML)
      .match(/https?:\/\/[^\s"<>]+\/verify\?[^\s"<>]+/)?.[0]
      ?.replaceAll("&amp;", "&");
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(
      page.getByRole("heading", { name: "A fresh start.", exact: true }),
    ).toBeVisible();
    await page.getByLabel("New password").fill("Local-new-password-2026");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      page.getByText("Password updated. You can return to Cast.", {
        exact: true,
      }),
    ).toBeVisible();
    const user = createClient(
      localEnv.NEXT_PUBLIC_SUPABASE_URL,
      localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    expect(
      (
        await user.auth.signInWithPassword({
          email,
          password: "Local-new-password-2026",
        })
      ).error,
    ).toBeNull();
  } finally {
    await service.auth.admin.deleteUser(created.data.user!.id);
  }
});
