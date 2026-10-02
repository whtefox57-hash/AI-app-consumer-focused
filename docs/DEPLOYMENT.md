# Deployment and redeployment

## Current dependency boundary

No integrated AppDeploy, managed database, deploy connector, notification service, or host session is available in this workspace. The implementation uses official Gemini and Supabase SDKs with Next.js. The Supabase project URL is supplied and the Gemini key produced real synthetic text responses. Supabase public-value delivery, backend/migration access, billed-project confirmation and a hosting account remain pending. There is no deployed app URL.

The cloud settings draft contains required domains and a Gemini secret requirement. Applying/publishing cloud environment settings is a product action; saving the draft does not apply network rules, create secret values, start services, publish source, or deploy the app. The complete source and actual screenshot are published on the connected GitHub repository's `main` branch. Importing it into a hosting account has not been performed. The filesystem and dependency-backed typecheck/unit tests were verified in a new cloud instance after Done; running processes must restart.

## Managed backend

1. Create a Supabase project. Obtain the project URL and public publishable/anon key from project settings. Obtain the backend service-role key through secure project settings. Only the URL and public key may reach the browser.
2. Apply all five files in `supabase/migrations` in filename order. For a new project use the Supabase SQL editor, or the documented CLI flow: `supabase link --project-ref YOUR_PROJECT_REF` followed by `supabase db push`. Authenticate the CLI through its supported flow and keep passwords out of shell history and chat. In this cloud set `SUPABASE_HOME=/workspace/.cache/supabase` if the CLI needs a writable home. The custom local Docker stack does not use the CLI's local reset command.
3. Verify the private `cast-private` bucket and ownership policies. Do not make the bucket public. Do not remove table policies to resolve an auth error.
4. Set Supabase Auth's site URL to the production HTTPS origin. Add the exact `/auth/callback` redirect for that origin. Review the signup/recovery email templates and configure a real transactional SMTP provider. Local Mailpit and auto-confirmation are test settings; they do not verify production email delivery.
5. Sign up the owner's account and put its Supabase user UUID in `OWNER_USER_ID`. Owner status is enforced on the backend; it is not a client preference.

The local SQL integration tests verify the migrations' RLS, quotas, and durable job semantics. Managed-project migration execution still requires a live project and must be checked after applying.

## Host configuration

Use a supported Node 24 host for Next.js. Vercel is the preferred managed option; a managed Node service can also run `npm run build` then `npm run start`. Set `NODE_USE_ENV_PROXY=1` only when the runtime uses an HTTP(S) proxy; the provided start command supports the cloud's existing proxy and CA settings. Never disable TLS verification.

Set the following values in the host's secure environment settings. `.env.example` contains names and safe defaults, never credentials.

| Name                                            | Purpose                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                      | Public managed project HTTPS origin; required at build time and runtime                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`          | Public browser key; required at build time and runtime                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                     | Backend only: quotas, scheduled work, owner dashboard, deletion                         |
| `GEMINI_API_KEY`                                | Backend only: billed Gemini Developer API key                                           |
| `GEMINI_PAID_PROJECT`                           | Explicit owner attestation; `true` only after billing and data-term review              |
| `APP_URL`                                       | Exact production HTTPS origin, without trailing slash; used for safe recovery redirects |
| `CRON_SECRET`                                   | Fresh random backend scheduler secret, delivered through host secret management         |
| `OWNER_USER_ID`                                 | Owner's authenticated Supabase UUID                                                     |
| `AI_ENABLED`                                    | `false` during infrastructure checks; enable for explicit live acceptance               |
| `GEMINI_MODEL`                                  | `gemini-flash-latest` by default; verify live access with the probe                     |
| `GEMINI_STRONG_ENABLED` / `GEMINI_STRONG_MODEL` | Default `false` / `gemini-pro-latest`                                                   |
| `SPEECH_ENABLED`                                | Default `false`; needs live STT, TTS, microphone and playback acceptance                |
| `GEMINI_STT_MODEL` / `GEMINI_TTS_MODEL`         | `gemini-flash-latest` / `gemini-2.5-flash-preview-tts`                                  |
| `SEARCH_ENABLED`                                | Default `false`; requires verified Gemini Google Search grounding and pricing           |
| `MUSIC_ENABLED`                                 | Default `false`; requires successful Apple catalog query and permitted-use review       |

Use only the real managed values for hosting. Never deploy `scripts/local-dev.ts` or `scripts/local-stack.ts`; their constants are public test fixtures. Rebuild when changing `NEXT_PUBLIC_*` values because Next.js embeds them in browser assets.

Runtime needs HTTPS access to the selected Supabase project hostname, `generativelanguage.googleapis.com`, and, if music is enabled, `itunes.apple.com`. The project hostname is `ffvzjewuccvwpbpdlwhm.supabase.co`; its network addition and backend-key requirement are saved but not applied. The existing public URL/public-key entries are proxy secrets scoped to `supabase.com`, which is unsuitable for browser build values and this project endpoint. Change them to direct environment variables in settings; do not extract proxy-held credentials. Existing target/source changes require user editing. Current Gemini model/pricing/paid data-term and hosting-plan documentation is now reachable and was verified on 2026-10-02. Pin the tested stable `gemini-3.5-flash-lite` for the recommended text cost plan.

## Persistent scheduling

The authenticated `GET /api/cron` endpoint requires `Authorization: Bearer <CRON_SECRET>`. It claims at most two durable runs per invocation. A claim has a two-minute lease, at most three attempts, and a unique job/scheduled-time identity. Each job runs at most hourly, has at most 30 completed runs/month, and pauses after repeated failures. Browser closure does not affect execution.

Choose one supported delivery mechanism:

- On a managed Node worker, set `APP_URL` and `CRON_SECRET` securely and run `npm run worker`. The worker polls every minute and survives browser closure; the host must restart it on failure.
- On a host with managed cron, schedule a minute-level HTTPS call to `/api/cron` with the secure authorization header. If using Vercel, verify the account's current cron availability/frequency and authorization behavior in official docs before adding the host configuration. Current documentation confirms Hobby cron can run only once/day and Pro can run once/minute. The requested frequent jobs need Pro or an independent persistent worker. A template has not been deployed under an unknown account plan.

Allow enough request duration for two bounded provider calls; if the host's plan cannot support it, use the separate worker or adjust the server work budget before enabling AI schedules. Container/worker restarts are safe because records, leases, and inbox entries live in PostgreSQL.

Inbox delivery is implemented. Push, external notifications, and image-generation jobs are not connected. Quiet hours are saved for future notification delivery, and the UI states that they do not yet send notifications. Do not advertise device delivery until it is implemented and tested.

## Release verification

For a fixed generic connectivity test, `npm run probe:ai -- --connection-only` is available without asserting billing. It cannot enable personal app calls. With the paid key configured securely and billing confirmed, run `npm run probe:ai`. It makes a real model metadata lookup and small generation, emits only safe status/model/token information, and fails without inventing a response. This verifies that runtime's key and model, **not deployment**.

Then deploy with the host's supported Next.js flow and complete [the live checks](TEST_RESULTS.md). Inspect runtime errors after signup, password recovery, uploaded PDF extraction, streaming chat, cancellation, and a scheduler run. Confirm permanent keys are absent from downloaded browser assets, API responses, and logs. Use a dedicated test account and a bounded provider allowance. Enable speech/search/music individually only after the corresponding acceptance passes.

Redeploy with `npm ci`, required schema migrations, public build variables, `npm run typecheck`, `npm test`, and `npm run build`. Preserve managed data and storage. Apply a compatible migration before code that needs it; do not use destructive reset commands on hosted data.

For a fresh empty managed project, `supabase/setup.sql` combines all five ordered migrations into one transaction for the Supabase SQL editor. Do not run it against a project where these migrations have already been applied; use incremental migration deployment there. A service-role API key alone cannot execute these schema migrations.
