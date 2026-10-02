# Start the Cast cloud workspace

Use the existing isolated checkout at `/workspace/AI-app-consumer-focused`. Do not create a Git worktree, switch/reset refs, or clone a second checkout. Read `README.md` and `docs/CAPABILITIES.md` before claiming a live service is connected. The prepared application files and packages were verified after restoration into a new cloud instance. Recheck Git HEAD and origin status before any Git operation; never reset local work. Processes and connections need fresh readiness checks after restoration.

Dependencies are installed by `.cloud/install.sh`; Node 24 and Docker are available in this environment. Use `NPM_CONFIG_CACHE=/workspace/.cache/npm`. Preserve proxy, `NO_PROXY`, and CA settings; never bypass TLS or inspect/log credential values. If a service is already running, verify readiness and reuse it instead of starting a second listener.

## Default local development (no paid calls)

In separate managed terminals/processes, from the checkout:

1. `AI_ENABLED=false npm run local:start` — keeps the loopback backend proxy alive and starts/reuses the five named `cast-local-*` Docker services. It applies unapplied migrations while preserving `cast-local-db` and `cast-local-files` volumes. Wait for `/auth/v1/health` on loopback port 54321 to succeed.
2. `AI_ENABLED=false npm run local:dev` — starts Next.js on port 3000 with explicit public local test fixtures. Verify `/api/health` reports accounts configured and AI false. If checking a production-mode local preview instead, stop dev, run `AI_ENABLED=false npm run local:build`, then `AI_ENABLED=false npm run local:serve`.
3. `AI_ENABLED=false npm run local:worker` — independent reminder scheduler; keep the backend and app processes alive. The browser can close without stopping reminder delivery.

The loopback backend bindings are for browsers on this machine, including automation. An external authenticated port preview requires managed Supabase bindings reachable by the user's browser; do not treat the local launchers as a remote mobile preview or tell the user that localhost is a deployed URL. These services implement real local auth, storage and database operations. Local fixture constants are deliberately public and must never be hosted or treated as real credentials. `local:*` launchers are for local integration only.

After code changes run appropriate checks: `npm run typecheck`, `npm test`, and, with the local backend and an AI-disabled server, `AI_ENABLED=false npm run test:browser`. The installed cloud Chromium is `/usr/bin/chromium`. The suite uses real local services and checks missing-provider errors; never point it at a paid or managed production project.

Stop the app/worker/proxy through their managed terminal or Ctrl-C. `npm run local:stop` stops only the named Cast containers and retains durable data. Do not reset databases or remove volumes as a routine startup step.

## Design preview development

The static preview shares the production React interface and needs no provider keys or Docker. Installation also runs `npm ci --prefix preview` and builds `preview/dist` with the repository base path. Start `npm run serve --prefix preview -- --base /AI-app-consumer-focused/` on port 4173. Verify its HTML and representative browser flows using `npx playwright test --config playwright.preview.config.ts`. After editing UI code, rebuild with the same base-path command before checking the served production artifact. A Vite development server can instead use `npm run dev --prefix preview`.

Preview edits, human messages, originals and custom backgrounds remain on the current browser/device. It never signs in managed accounts, generates replies or runs saved schedules. The user has enabled GitHub Pages with GitHub Actions; publication uses the tested `pages-preview.yml` workflow. Read current deployment status and verify the resulting public HTTPS site before claiming it is live. Localhost remains an internal validation address.

## When managed service configuration arrives

Follow `docs/DEPLOYMENT.md`. The public Supabase URL is `https://ffvzjewuccvwpbpdlwhm.supabase.co`. Hosting-account access remains pending; credentials belong in secure environment/host settings, never chat. Existing public URL/browser-key entries were wrongly delivered as proxy secrets. They need direct process values, with backend secret bindings scoped to the exact project hostname. Automatic configuration review rejected changing the existing direct-variable requirements, and secret target changes conflicted; user editing is required. The exact-host network addition and missing service-role requirement were saved. Do not repeatedly ask for an already bound Gemini key or assume that the pending Supabase draft is applied. The Gemini key requirement is saved in cloud settings; the exact managed Supabase hostname is needed for any destination-scoped service-key binding.

Use a Google AI Studio / Gemini Developer API project linked to active billing, funded by the app owner. Require `GEMINI_PAID_PROJECT=true` only after the owner reviews current paid data terms. Verify current official model IDs/rates and run `npm run probe:ai` when the billed key is securely available. Default text is `gemini-flash-latest`; optional strong and speech/search/music stay disabled until live acceptance. The securely bound key has passed fixed synthetic generations for the alias (returned `gemini-3.8-flash`) and stable `gemini-3.5-flash-lite`. `npm run probe:ai -- --connection-only` uses only a fixed generic prompt and does not attest billing or enable personal app data. Pin the stable lower-cost model in production.

For a real managed backend use `npm run dev` with the actual process bindings, or build with the real public project values using `npm run build` and start using `npm run start`. Do not use a build made by `local:build` for deployment. Host-secret settings and hosted cron/worker configuration are separate from cloud workspace settings. Apply migrations, verify auth redirects/email, deploy only through a supported authenticated host, inspect runtime logs, and complete the hosted acceptance in `docs/TEST_RESULTS.md`.

Saving this setup does not apply network rules, enter secrets, publish source, deploy the app, or verify fresh-task restoration. Keep the capability ledger accurate: no finished/deployed claim until a real authenticated hosted conversation and durable refresh pass.
