import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
// PUBLIC, TEST-ONLY FIXTURES. Bound to loopback. Never use these bindings in a deployment.
const signing = "cast-local-fixture-only-not-valid-for-any-external-service";
const password = "cast-local-fixture-password";
export function fixtureKey(role: string) {
  const b = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const payload = b({
    role,
    iss: "supabase",
    iat: 1700000000,
    exp: 2100000000,
  });
  const header = b({ alg: "HS256", typ: "JWT" });
  return `${header}.${payload}.${createHmac("sha256", signing).update(`${header}.${payload}`).digest("base64url")}`;
}
export const localEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey("anon"),
  SUPABASE_SERVICE_ROLE_KEY: fixtureKey("service_role"),
  APP_URL: "http://localhost:3000",
  CRON_SECRET: "cast-local-scheduler-fixture",
};
function docker(args: string[], input?: string) {
  return execFileSync("docker", args, {
    input,
    stdio: ["pipe", "pipe", "pipe"],
  })
    .toString()
    .trim();
}
async function wait(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Local service failed readiness: ${url}`);
}
function container(
  name: string,
  image: string,
  ports: string[],
  env: Record<string, string>,
  volumes: string[] = [],
) {
  try {
    const current = JSON.parse(docker(["inspect", name]))[0];
    let expectedImage;
    try {
      expectedImage = JSON.parse(docker(["image", "inspect", image]))[0].Id;
    } catch {
      docker(["pull", image]);
      expectedImage = JSON.parse(docker(["image", "inspect", image]))[0].Id;
    }
    const matches = Object.entries(env).every(([key, value]) =>
      current.Config.Env.includes(`${key}=${value}`),
    );
    if (matches && current.Image === expectedImage) {
      docker(["start", name]);
      return;
    }
    docker(["stop", name]);
    docker(["rm", name]);
  } catch {}
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "cast-local",
    ...ports.flatMap((p) => ["-p", `127.0.0.1:${p}`]),
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    ...volumes.flatMap((v) => ["-v", v]),
    image,
  ]);
}
export async function start() {
  try {
    docker(["network", "inspect", "cast-local"]);
  } catch {
    docker(["network", "create", "cast-local"]);
  }
  container(
    "cast-local-db",
    "postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24",
    ["54322:5432"],
    { POSTGRES_PASSWORD: password },
    ["cast-local-db:/var/lib/postgresql/data"],
  );
  for (let i = 0; i < 60; i++) {
    try {
      docker(["exec", "cast-local-db", "pg_isready", "-U", "postgres"]);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const sql = (value: string) =>
    docker(
      [
        "exec",
        "-i",
        "cast-local-db",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
      ],
      value,
    );
  sql(
    `alter role postgres set search_path=auth,public;do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator login noinherit password '${password}';grant anon,authenticated,service_role to authenticator;end if;end $$;create schema if not exists auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create or replace function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  container(
    "cast-local-mail",
    "ghcr.io/supabase/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d",
    ["54324:8025"],
    {},
  );
  container(
    "cast-local-auth",
    "ghcr.io/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b",
    ["54325:9999"],
    {
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      API_EXTERNAL_URL: "http://127.0.0.1:54321/auth/v1",
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL: `postgres://postgres:${password}@cast-local-db:5432/postgres`,
      GOTRUE_SITE_URL: "http://localhost:3000",
      GOTRUE_URI_ALLOW_LIST:
        "http://localhost:3000/**,http://127.0.0.1:3000/**",
      GOTRUE_JWT_SECRET: signing,
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_JWT_EXP: "3600",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_SMTP_ADMIN_EMAIL: "cast@localhost",
      GOTRUE_SMTP_HOST: "cast-local-mail",
      GOTRUE_SMTP_PORT: "1025",
      GOTRUE_SMTP_SENDER_NAME: "Cast local",
      GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_INVITE: "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify",
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "100",
    },
  );
  await wait("http://127.0.0.1:54325/health");
  container(
    "cast-local-rest",
    "ghcr.io/supabase/postgrest@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df",
    ["54326:3000"],
    {
      PGRST_DB_URI: `postgres://authenticator:${password}@cast-local-db:5432/postgres`,
      PGRST_DB_SCHEMAS: "public,storage",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: signing,
    },
  );
  container(
    "cast-local-storage",
    "ghcr.io/supabase/storage-api@sha256:1f6c99d3952d78d57129802aa2ae8a80d75e327492cf24742fd0aeaf90967b96",
    ["54327:5000"],
    {
      ANON_KEY: fixtureKey("anon"),
      SERVICE_KEY: fixtureKey("service_role"),
      POSTGREST_URL: "http://cast-local-rest:3000",
      AUTH_JWT_SECRET: signing,
      DATABASE_URL: `postgres://postgres:${password}@cast-local-db:5432/postgres`,
      FILE_SIZE_LIMIT: "5242880",
      STORAGE_BACKEND: "file",
      GLOBAL_S3_BUCKET: "cast-private",
      FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
      TENANT_ID: "cast-local",
      REGION: "local",
      ENABLE_IMAGE_TRANSFORMATION: "false",
      STORAGE_PUBLIC_URL: "http://127.0.0.1:54321",
      REQUEST_ALLOW_X_FORWARDED_PATH: "true",
    },
    ["cast-local-files:/var/lib/storage"],
  );
  await wait("http://127.0.0.1:54327/status");
  sql(
    "create table if not exists public.cast_local_migrations(version text primary key);",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const done = sql(
      `select exists(select 1 from public.cast_local_migrations where version='${file}') as done;`,
    );
    if (!done.includes(" t\n")) {
      if (
        file.startsWith("202610020001") &&
        sql(
          "select to_regclass('public.profiles') is not null as migrated;",
        ).includes(" t\n")
      ) {
      } else sql(readFileSync("supabase/migrations/" + file, "utf8"));
      sql(
        `insert into public.cast_local_migrations(version) values('${file}');`,
      );
    }
  }
  sql(
    "grant usage on schema public,auth,storage to anon,authenticated,service_role;grant all on all tables in schema public,storage to authenticated,service_role;grant all on all sequences in schema public,storage to authenticated,service_role;revoke all on public.cast_local_migrations from anon,authenticated;revoke update on public.inbox from authenticated;grant update(read) on public.inbox to authenticated;notify pgrst, 'reload schema';",
  );
  if (process.argv.includes("--prepare-only")) return null;
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = ["http://localhost:3000", "http://127.0.0.1:3000"];
    if (origin && !allowed.includes(origin)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const match = req.url?.match(/^\/(auth|rest|storage)\/v1(.*)$/);
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    const port = { auth: 54325, rest: 54326, storage: 54327 }[
      match[1] as "auth" | "rest" | "storage"
    ];
    try {
      const parts: Buffer[] = [];
      for await (const p of req) parts.push(Buffer.from(p));
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v && !["host", "connection", "content-length"].includes(k))
          headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const response = await fetch(
        `http://127.0.0.1:${port}${match[2] || "/"}`,
        {
          method: req.method,
          redirect: "manual",
          headers,
          body: ["GET", "HEAD"].includes(req.method || "GET")
            ? undefined
            : Buffer.concat(parts),
        },
      );
      res.statusCode = response.status;
      for (const [k, v] of response.headers)
        if (
          ![
            "content-encoding",
            "transfer-encoding",
            "content-length",
            "connection",
          ].includes(k)
        )
          res.setHeader(k, v);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(502).end("Local backend unavailable");
    }
  });
  await new Promise<void>((r) => server.listen(54321, "127.0.0.1", r));
  console.log(
    "Local PostgreSQL, Supabase Auth, REST, private Storage, and mail capture are ready. Test-only bindings remain in process memory.",
  );
  return server;
}
if (process.argv[1]?.endsWith("local-stack.ts"))
  void start().catch((e) => {
    console.error(
      e.message?.startsWith("Local service")
        ? e.message
        : "Local backend startup failed. Inspect the named cast-local service logs without dumping environment values.",
    );
    process.exitCode = 1;
  });
