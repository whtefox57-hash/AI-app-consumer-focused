import { spawn } from "node:child_process";
// Public test fixtures for the loopback-only local stack; never use this launcher for deployment.
const { localEnv } = await import("./local-stack");
const env = { ...process.env, ...localEnv };
if (
  !env.NEXT_PUBLIC_SUPABASE_URL ||
  !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  !env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error("Local Supabase is not ready.");
const command = process.argv[2] || "dev";
const child = spawn("npm", ["run", command], {
  stdio: "inherit",
  env,
  detached: process.platform !== "win32",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid!, signal);
    } catch {}
  });
child.on("exit", (code) => process.exit(code ?? 1));
