// Run as a separate managed process, independent of any browser session.
const appOrigin = process.env.APP_URL;
const secret = process.env.CRON_SECRET;
if (!appOrigin || !secret)
  throw new Error(
    "APP_URL and a securely configured CRON_SECRET are required.",
  );
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  while (!stopping) {
    try {
      const response = await fetch(new URL("/api/cron", appOrigin), {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(110000),
      });
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          schedulerStatus: response.status,
        }),
      );
    } catch {
      console.error(
        "Scheduler request failed; durable jobs will retry on a later poll.",
      );
    }
    for (let i = 0; i < 12 && !stopping; i++)
      await new Promise((r) => setTimeout(r, 5000));
  }
}
void main();

export {};
