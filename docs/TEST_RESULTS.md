# Test evidence — 2026-10-02

## Passed locally

| Check                                 | Result              | Scope                                                                                                                          |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Frozen dependency install             | Passed              | `NPM_CONFIG_CACHE=/workspace/.cache/npm npm ci --no-audit --no-fund`; 108 packages                                             |
| TypeScript                            | Passed              | `npm run typecheck`, including the final route and voice changes                                                               |
| Production build                      | Passed              | `AI_ENABLED=false npm run local:build`; Next.js optimized build, TypeScript and route compilation                              |
| Unit/PostgreSQL integration           | 13 passed, 0 failed | `npm test`; actual PGlite PostgreSQL engine with all five migrations                                                           |
| Production-server browser integration | 3 passed, 0 failed  | `AI_ENABLED=false npm run test:browser`; Chromium against `next start`, real local GoTrue/PostgREST/Storage/PostgreSQL/Mailpit |
| Backend repeat startup                | Passed              | `npm run local:start -- --prepare-only` reused digest-pinned containers and persisted migrations/data                          |
| Frontend credential-name scan         | Passed              | No `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` in `.next/static`; local service-role fixture also absent   |

The database tests cover roundtable/input limits, scope revocation, failed-document exclusion and exact citations, personality system inputs, memory exclusion, bounded history, timezone schedules, catalog-metadata ranking, actual ownership/RLS and composite foreign keys, service-only quota RPCs, user/global kill switch and failed-call accounting, idempotent claims/leases/retries, database close/reopen durability, once-only onboarding and atomic settings, and direct-write document/avatar/file limits.

The main browser flow creates a real local account, project and saved agent, invites two agents through touch/keyboard-accessible controls, restores settings and selected project, extracts a valid TXT and PDF, rejects an oversized authenticated request, exports records and downloads a signed original, and checks the honest missing-AI error. A second identity cannot read the first account's private project, write its conversation or download its file. An actual user message (not an invented model answer) survives refresh and a new browser context.

The same flow enables a reminder, makes it due in the test fixture database, closes the browser, starts a separate Node scheduler process, verifies the durable inbox entry, and checks duplicate processing is idempotent. Account deletion removes the project's records and private files. A 390-pixel Chromium viewport has no horizontal overflow and no JavaScript errors were captured in the main flow.

The other browser tests reject anonymous/private and unauthenticated scheduler calls and foreign-origin mutations. The recovery test requests an actual email into local Mailpit, follows its PKCE verification flow, changes the password, and signs in with the new password. This verifies local email and sessions, not a production SMTP account.

Screenshots in `/tmp/cast-desktop.png` and `/tmp/cast-mobile.png` show test data with a missing-provider state. They are not evidence of live AI. Local constants are explicitly public fixtures and do not authenticate to any outside project.

## Blocked or unperformed

| Acceptance                                                               | Status and exact reason                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real model metadata and generation                                       | Passed for fixed synthetic prompts: alias resolved to `gemini-3.8-flash`; stable `gemini-3.5-flash-lite` also returned a real answer. Personal app calls remain blocked by absent billing confirmation. |
| Hosted signup → agent → model response → refresh                         | Managed project URL supplied; public-value/proxy settings, admin access and authenticated hosting remain pending; no deployed URL                                                                       |
| Live personality differences / factual standards                         | Personal app calls remain disabled pending billing confirmation; only prompt construction tested                                                                                                        |
| Real moderated roundtable, streaming, cancellation and provider failures | Synthetic text generation passes; authenticated streaming/roundtable/cancellation remain untested end to end                                                                                            |
| Uploaded-document answer with model citations                            | Extraction/retrieval/citation filtering pass locally; generated answer remains blocked                                                                                                                  |
| Actual microphone, STT, playback and voice assignments                   | Current TTS metadata readable; bounded synthetic synthesis diagnostic failed to return supported audio; no physical iPhone/Android acceptance                                                           |
| AI ideas and grounded research with real links                           | Provider/search access and current capability/rate verification pending                                                                                                                                 |
| Real music track/catalog resolution                                      | Real Apple search returned two catalog tracks and HTTPS track links; authenticated ranking/resolution and terms acceptance remain pending; feature disabled                                             |
| iPhone Safari / Android Chrome and installed PWA                         | Physical device testing unperformed; desktop Chromium and narrow viewport do not substitute                                                                                                             |
| Push notifications / image generation                                    | No service connected; deferred and omitted/disabled                                                                                                                                                     |
| Current model prices, paid data terms and hosting-plan limits            | Official Gemini pricing/terms/models, Supabase pricing, Vercel pricing/cron now HTTP 200; see updated COSTS.md                                                                                          |
| Live credential exposure inspection                                      | Gemini key is proxy-bound and never logged; real-host bundle/response/log inspection remains pending                                                                                                    |
| GitHub CI / fresh environment restoration                                | Filesystem restored after Done into a new cloud instance; dependency-backed typecheck and all 13 SQL/unit tests pass again. Remote CI is not verified.                                                  |

No acceptance is counted as passed because code exists. Earlier local failures were fixed and the final production-server suite passed; no unresolved local test failure remains.

## Hosted acceptance still required

With credentials securely configured and current paid terms/rates reviewed, deploy and inspect runtime logs. Sign up, recover access, create agents with contrasting personalities, run individual and three-agent turns, refresh their persisted real answers, query the uploaded PDF with actual citations, revoke memory/documents/project scope and retry, and verify private ownership with a second account. Exercise quotas, global pause, cancellation, retry and provider errors without inventing output. Run a reminder and an enabled grounded report with the browser closed. Complete the physical-device voice checks, catalog-link resolution, and permanent-key inspection before enabling those capabilities.

The GitHub Actions workflow provides repeatable AI-disabled checks; it intentionally does not run paid provider requests or deploy an unconfigured account.

## New-instance connection evidence

The published filesystem and installed packages were present after the user clicked Done. `npm run typecheck` and all 13 unit/PostgreSQL tests passed again. Local browser evidence above predates this restart; those processes are not assumed to survive.

The alias probe reported 15 input, 1 visible output and 96 thinking tokens, with returned model `gemini-3.8-flash`. `GEMINI_MODEL=gemini-3.5-flash-lite npm run probe:ai -- --connection-only` passed with 8 input and 2 output tokens. These were fixed generic prompts; no personal app data was sent, and neither probe attests billing or deployment.

The exact managed Supabase hostname request was denied by the current proxy (HTTP 403 CONNECT). Its network addition and service-role requirement were saved. Updating existing secret targets conflicted; changing their direct-variable delivery was rejected by automatic configuration review. Those existing entries require user editing; the saved draft alone does not fix the running instance.
