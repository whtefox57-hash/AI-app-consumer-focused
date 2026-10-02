# Operating cost assumptions

Verified against current official documentation on **2026-10-02**. Gemini pricing, model registry, paid-data terms, Supabase pricing and Vercel pricing/cron pages all returned HTTP 200. The configured `gemini-flash-latest` alias returned `gemini-3.8-flash` in a real synthetic response; the recommended stable low-cost `gemini-3.5-flash-lite` also passed a real synthetic generation. Project billing and a deployed account are not verified.

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [models](https://ai.google.dev/gemini-api/docs/models), [paid data terms](https://ai.google.dev/gemini-api/terms), [audio input units](https://ai.google.dev/gemini-api/docs/audio), [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Verified rates and chosen planning configuration

| Item                                         | Current Standard paid rate / allowance                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned `gemini-3.5-flash-lite`               | $0.30/M input; $2.50/M output, including thinking; same input rate for audio                                                                 |
| Currently resolved `gemini-3.8-flash`        | $0.75/M input; $3.75/M output including thinking through Dec 31, 2026; $1.50/$7.50 from Jan 1, 2027                                          |
| Optional future `gemini-3.8-flash-lite-tts`  | $0.50/M text input and $6/M audio output through Dec 31, 2026; $1/$12 from Jan 1, 2027; 25 output audio tokens/second                        |
| Google Search grounding for these 3.x models | 5,000 free search requests/month shared across the project's 3.x usage; then $14/1,000 requests; one generation can invoke multiple searches |
| Supabase Pro                                 | From $25/month, first project included; 100,000 MAU, 8 GB database disk, 100 GB files, 250 GB egress and 250 GB cached egress                |
| Supabase excess                              | $0.00325/additional MAU; $0.125/GB database disk; $0.0213/GB files; $0.09/GB uncached egress; $0.03/GB cached egress                         |
| Vercel Pro, one developer                    | $20/month with $20 included usage credit; metered excess depends on actual compute/CDN usage                                                 |
| Vercel cron                                  | Hobby: once/day; Pro: once/minute. Frequent durable jobs need Pro or an independent worker.                                                  |

The production text plan pins `gemini-3.5-flash-lite`; the current workspace explicitly overrides it with the latest alias. The alias is not price-stable. No strong-model calls, context caching, images, push or external messaging are included. Search remains disabled until its required Search Suggestions display and result/link retention rules are implemented. Speech remains disabled: current-model metadata is readable, but the synthesis diagnostic did not return supported audio and physical-device acceptance is pending. Speech prices below are future planning, not evidence of a working voice deployment.

Paid terms require a Cloud Project linked to active billing. Google states paid prompts/responses are not used to improve its products, with limited safety/security logging. A present key or successful generic probe does not establish billing; personal app data remains blocked until the owner confirms it.

## Explicit 30-day scenarios

Each voice turn includes one transcription, one text reply, and one synthesis. Text replies use one responding agent here; a three-person roundtable triples that turn's text calls. Failed/charged retries are conservatively modeled at 5% extra provider calls; actual failures still consume application reservations. Schedules contain 2,000 input/600 output text tokens per generated run. These are planning assumptions, not measured user behavior.

| Assumption                                                        |          Light |      Moderate |          Heavy |
| ----------------------------------------------------------------- | -------------: | ------------: | -------------: |
| Active users/day                                                  |              5 |            20 |             40 |
| Total text replies/user/day, including voice replies              |              8 |            10 |              6 |
| Voice turns/user/day within those replies                         |              1 |             2 |              1 |
| Typical input/output tokens per text reply                        |    1,200 / 400 |   1,800 / 600 |    2,500 / 800 |
| Speech input duration per voice turn                              |     10 seconds |    10 seconds |     10 seconds |
| Spoken output per voice turn                                      |     20 seconds |    20 seconds |     20 seconds |
| Generated scheduled runs/app/day                                  |              2 |             5 |              8 |
| Of those, grounded research runs/app/day                          |              1 |             3 |              5 |
| Base model reservations/day, voice STT/TTS included               |             52 |           285 |            328 |
| Planning reservations/day with 5% extra attempts, rounded up      |             55 |           300 |            345 |
| Planning reservations/month                                       |          1,650 |         9,000 |         10,350 |
| Base ordinary text input/output tokens/month                      |  1.44M / 0.48M |  10.8M / 3.6M |    18M / 5.76M |
| Scheduled text input/output tokens/month                          | 0.12M / 0.036M | 0.30M / 0.09M | 0.48M / 0.144M |
| Base STT minutes/month                                            |             25 |           200 |            200 |
| Base TTS minutes/month                                            |             50 |           400 |            400 |
| Base grounded research calls/month                                |             30 |            90 |            150 |
| Private uploaded storage                                          |         0.5 GB |          2 GB |           5 GB |
| Download/storage egress/month                                     |           1 GB |         10 GB |          30 GB |
| Database/log growth allowance/month                               |         0.1 GB |        0.5 GB |           1 GB |
| Pinned text + $45 plan minimums, thinking/retry assumptions below |         $47.18 |        $60.60 |         $70.23 |

The total reservations include chat + 2 × voice turns + generated schedule runs; reminder-only runs do not call a model. Music catalog calls reserve an allowance but are not included in these model-call scenarios; add the measured catalog volume, any applicable API charges, and egress when enabled. Include explicit summary calls in the ledger or reduce another workload accordingly. Roundtable, stronger-model use, and longer outputs need a separate weighted assumption rather than silently applying cheap-model rates.

## Calculated first-month budgets

For ordinary and scheduled text, add planning thinking tokens of 100/150/200 per reply in Light/Moderate/Heavy respectively. These are explicit allowances, not measured averages. There are 1,260/6,150/7,440 base text generations/month. Include the 5% attempt multiplier on all variable provider costs. The configured 1,500-token output cap includes the model's billable output allowance; longer reasoning can reduce visible output.

| Monthly component, USD                                         |     Light |  Moderate |     Heavy |
| -------------------------------------------------------------- | --------: | --------: | --------: |
| Pinned cheap text, including planning thinking and 5% attempts |      2.18 |     15.60 |     25.23 |
| Same workload at the currently resolved 3.8 Flash rates        |      3.76 |     26.90 |     43.66 |
| Supabase Pro + one Vercel Pro developer, minimum               |     45.00 |     45.00 |     45.00 |
| Pinned text-only pilot + plan minimums                         | **47.18** | **60.60** | **70.23** |
| Future optional voice addition at the rates above              |      0.51 |      4.09 |      4.09 |
| Future pinned text + voice + plan minimums                     | **47.69** | **64.70** | **74.32** |

Example Light text: `(1.56M × $0.30 + (0.516M + 1,260 × 100 thinking tokens) × $2.50/M) × 1.05 = $2.17665`.

The optional voice addition uses 150/1,200/1,200 turns/month. Each 10-second transcription is planned at 320 audio tokens (the documented 32 tokens/second), plus 40 instruction input tokens and 40 transcript output tokens on `gemini-3.5-flash-lite`: $0.000208/turn. Each 20-second synthesis is 500 audio tokens plus 80 text input tokens on `gemini-3.8-flash-lite-tts`: $0.00304/turn. Combined voice addition is `(STT + TTS) × turns × 1.05`. Text replies within voice are already included in the ordinary text row. Spoken duration, text length and reported usage must be measured before enabling voice; the old configured 2.5 TTS model is not priced using these newer-model rates.

These scenarios fit the listed first-month Supabase allowances starting from an empty project. They assume Vercel metered usage remains within its included credit; no actual deployment usage exists to confirm this. Add measured excess compute/CDN usage, SMTP, domain registration, monitoring, any separate worker, taxes and existing account workloads. Developer-seat charges are distinct from end-user counts. Cumulative database/log growth eventually needs retention or more storage.

The planned 30/90/150 research runs cost $0 in additional search fees only if the shared 5,000-request allowance is available and the provider's actual search count fits it. For a conservative two searches/run with that allowance already exhausted, add `$14/1,000 × runs × 2 × 1.05`: $0.88/$2.65/$4.41. The table excludes this disabled feature's variable search charges; scheduled text tokens are included as ordinary ideas. Music catalog, summaries, roundtable multipliers and strong-model use require separate measured volume. No free-plan claim is used to support minute scheduling or a production budget.

These are calculated scenarios using verified posted rates, not a verified invoice or hard spending cap. Model prices change on the stated dates; refresh this calculation before a later release.

## Controls and limits

Default hard application limits are 40 reservations/user/day and 400/app/day, resetting at UTC midnight. Over 30 days this is at most 12,000 reserved operations at defaults, including failed calls, voice operations and enabled catalog requests. The owner can lower quotas or pause AI in the dashboard, and `AI_ENABLED=false` stops the server provider path. Scheduled job allowances bound completed runs, while retries still consume the global/user quotas.

Each text generation is capped at 8,000 input tokens and 1,500 configured output tokens. Voice clips are limited to 15 seconds; STT has its own input/output bounds; speech text is capped at 1,600 characters. There are no recursive conversations or indefinite research loops. The SDK is configured for a single attempt; scheduled work has at most three durable attempts. A cancelled request may already incur provider cost and retains its reservation.

These limits bound work but are **not a dollar spending guarantee**: aliases, thinking/audio/search units and provider rates can change. The usage ledger records reported tokens and duration, leaving unreported values unknown. It does not currently record every provider billing category or implement a verified dollar-based budget. Before a public pilot, reconcile the ledger with the provider bill, pin the selected model, and add rate-versioned cost accounting if a currency cap is required. Provider billing alerts alone are not hard caps.
