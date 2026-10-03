import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Boot } from "../../src/lib/types";
import { PREVIEW_STORAGE_KEY } from "../../src/lib/preview-store";

const origin =
  process.env.PREVIEW_URL || "http://127.0.0.1:4173/AI-app-consumer-focused/";
test.use({ baseURL: origin });
async function previewBoot(page: Page): Promise<Boot> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).boot,
    PREVIEW_STORAGE_KEY,
  );
}
async function start(page: Page) {
  await page.goto(origin);
  await expect(page.locator(".scene-preview-badge")).toBeVisible();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
}

test("damaged saved previews show recovery and temporary mode preserves the original data", async ({
  page,
}) => {
  await start(page);
  const saved = await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    delete value.boot.memberships;
    const damaged = JSON.stringify(value);
    localStorage.setItem(key, damaged);
    localStorage.setItem("unrelated-preview-data", "keep");
    return damaged;
  }, PREVIEW_STORAGE_KEY);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let’s reopen your preview." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "saved preview could not be read",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Open a temporary preview", exact: true })
    .click();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
  await expect(page.locator(".scene-preview-badge")).toHaveText(
    /Temporary preview/,
  );
  await page.getByLabel("Message your cast").fill("My temporary thought");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".message-text").filter({ hasText: "My temporary thought" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PREVIEW_STORAGE_KEY,
    ),
  ).toBe(saved);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-preview-data")),
  ).toBe("keep");
  await page.reload();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
  await expect(
    page.getByText("My temporary thought", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PREVIEW_STORAGE_KEY,
    ),
  ).toBe(saved);
});

test("temporary preview works with browser storage blocked, including actual files and custom backgrounds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const key of ["localStorage", "indexedDB"])
      Object.defineProperty(window, key, {
        get() {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      });
  });
  await page.goto(origin);
  await expect(
    page.getByRole("heading", { name: "Let’s reopen your preview." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open a temporary preview", exact: true })
    .click();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
  await page
    .getByRole("button", { name: "Project knowledge", exact: true })
    .click();
  const original = "An actual file in the temporary workspace.";
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "temporary-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(original),
    });
  const file = page
    .locator(".document-list>div")
    .filter({ hasText: "temporary-evidence.txt" });
  await expect(file).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await file
    .getByRole("button", { name: "Download original", exact: true })
    .click();
  expect(await readFile((await (await downloaded).path())!, "utf8")).toBe(
    original,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize scene", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "temporary-background.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByRole("status")).toContainText(
    "Background applied for this temporary preview",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "World map", exact: true }).click();
  await expect(page.locator(".map-country")).toHaveCount(242);
  await page.getByLabel("Search places and historical events").fill("Kyoto");
  await expect(
    page.getByRole("listbox", { name: "Search results" }),
  ).toContainText("Kyoto");
  expect(errors).toEqual([]);
});

test("failed app downloads keep a visible retry screen and recover when the bundle becomes available", async ({
  page,
}) => {
  await page.route("**/assets/app-*.js", (route) => route.abort());
  await page.goto(origin);
  await expect(page.locator("#cast-startup-title")).toHaveText(
    "Let’s reopen your preview.",
  );
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open in your browser", exact: true }),
  ).toBeVisible();
  await page.unroute("**/assets/app-*.js");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
  await expect(page.locator("#cast-startup")).toBeHidden();
});

test("unexpected render failures display recovery rather than an empty root", async ({
  page,
}) => {
  await start(page);
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.boot.agents[0].avatar = null;
    localStorage.setItem(key, JSON.stringify(value));
  }, PREVIEW_STORAGE_KEY);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let’s reopen your preview." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Something interrupted this preview",
  );
  await page
    .getByRole("link", { name: "Open a temporary preview", exact: true })
    .click();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
});

test("static preview preserves actual messages, repeated agent edits, and selected workflow assignments without generating replies", async ({
  page,
}) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await start(page);
  await page
    .getByLabel("Message your cast")
    .fill("My real preview message, with no simulated AI answer.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(async () => (await previewBoot(page)).messages.length)
    .toBe(1);
  await page.reload();
  await expect(
    page.getByText("My real preview message, with no simulated AI answer.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await previewBoot(page)).messages.every(
      (message) => message.role === "user",
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mira");
  await page
    .getByLabel("Personality", { exact: true })
    .fill("Patient, precise, and candid.");
  await page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await previewBoot(page)).agents.filter(
          (agent) => agent.name === "Mira",
        ).length,
    )
    .toBe(1);
  await page.getByLabel("Name", { exact: true }).fill("Mira revised");
  await page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect
    .poll(async () =>
      (await previewBoot(page)).agents.some(
        (agent) => agent.name === "Mira revised",
      ),
    )
    .toBe(true);
  expect((await previewBoot(page)).agents).toHaveLength(7);
  await page
    .getByRole("button", { name: "Close agent studio", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "View all", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Edit Mira revised", exact: true })
    .click();
  await expect(page.getByLabel("Personality", { exact: true })).toHaveValue(
    "Patient, precise, and candid.",
  );
  await page
    .getByRole("button", { name: "Close agent studio", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Templates & workflows", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create a workflow", exact: true })
    .click();
  await page
    .getByLabel("Workflow name", { exact: true })
    .fill("Careful review");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Review only the supplied facts and list any unknowns.");
  await page
    .getByRole("checkbox", { name: "Mira revised", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save & apply workflow", exact: true })
    .click();
  await expect
    .poll(async () => (await previewBoot(page)).workflows?.length)
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await previewBoot(page)).agents.find(
          (agent) => agent.name === "Mira revised",
        )?.config?.workflow_ids?.length,
    )
    .toBe(1);
  const result = await previewBoot(page);
  const mira = result.agents.find((agent) => agent.name === "Mira revised")!;
  expect(mira.personality).toBe("Patient, precise, and candid.");
  expect(
    result.agents
      .filter((agent) => agent.id !== mira.id)
      .every((agent) => !agent.config?.workflow_ids?.length),
  ).toBe(true);
  expect(result.usage).toHaveLength(0);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("static preview uploads real document originals, restores extracted text, exports local records, and clears only its own dataset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await page.evaluate(() =>
    localStorage.setItem("sb-unrelated-production-profile", "keep-me"),
  );
  await page
    .getByRole("button", { name: "Project knowledge", exact: true })
    .click();
  const originalText =
    "The actual launch budget is 4200 dollars. Mira owns the launch.";
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "real-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(originalText),
    });
  await expect(
    page.getByText("real-evidence.txt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Project knowledge", exact: true })
    .click();
  const record = page
    .locator(".document-list>div")
    .filter({ hasText: "real-evidence.txt" });
  await record.getByText("Inspect extracted text", { exact: true }).click();
  await expect(record.locator("pre")).toHaveText(originalText);
  const downloadPromise = page.waitForEvent("download");
  await record
    .getByRole("button", { name: "Download original", exact: true })
    .click();
  const downloaded = await downloadPromise;
  expect(await readFile((await downloaded.path())!, "utf8")).toBe(originalText);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Settings & usage", exact: true })
    .click();
  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data", exact: true }).click();
  const exported = JSON.parse(
    await readFile((await (await exportPromise).path())!, "utf8"),
  );
  expect(exported.preview).toBe(true);
  expect(exported.data.documents[0].chunks[0].text).toBe(originalText);
  expect(exported.files[0].signedUrl).toMatch(/^blob:/);
  await page
    .getByText("Delete account and private data", { exact: true })
    .click();
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect
    .poll(async () => (await previewBoot(page)).documents.length)
    .toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sb-unrelated-production-profile"),
    ),
  ).toBe("keep-me");
  await page.reload();
  await expect(page.getByLabel("Message your cast")).toBeVisible();
  expect((await previewBoot(page)).documents).toEqual([]);
  expect(errors).toEqual([]);
});

test("scene uploads persist and mobile chat, feed, networks and map fit the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await page
    .getByRole("button", { name: "Customize scene", exact: true })
    .click();
  await page
    .getByLabel("Choose your own image or video")
    .setInputFiles("public/scenes/home.png");
  await expect
    .poll(
      async () => (await previewBoot(page)).profile.settings.backgroundScene,
    )
    .toBe("custom");
  await expect(
    page.getByText("Background saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.locator(".scene-backdrop img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  await noOverflow();
  for (const name of ["Home feed", "Networks", "World map"]) {
    const drawer = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await drawer.count()) await drawer.click();
    await page.getByRole("button", { name, exact: true }).first().click();
    await expect
      .poll(async () => (await previewBoot(page)).profile.settings.activeView)
      .toBe(
        name === "Home feed"
          ? "feed"
          : name === "Networks"
            ? "networks"
            : "map",
      );
    await noOverflow();
  }
  expect(errors).toEqual([]);
});
