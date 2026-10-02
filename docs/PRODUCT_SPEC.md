You are my product engineer and execution partner. Build and deploy an actually usable AI application from the specification below. 
 
Build working software with real AI responses, authentication, durable storage, and functioning workflows. Do not stop at a product plan, landing page, visual prototype, or simulated chat. 
 
Working name: Cast. Treat this as a temporary name, not a trademark-cleared brand. 
 
PRODUCT 
 
The app is a personal environment where users create a cast of AI agents, invite them into projects, speak with them, and receive useful proactive work. 
 
Users can create many saved agents. Each agent has: 
- Name. 
- Avatar or uploaded image. 
- Personality. 
- Beliefs or worldview. 
- Background. 
- Areas of expertise. 
- Working instructions. 
- Assigned voice. 
- Editable memories. 
- Explicit permissions and access scope. 
 
Premade agents: researcher, product engineer, trader, philosopher, organizer, and legal-research assistant. 
 
Personalities should meaningfully change how agents approach a task. Beliefs must not authorize fabrication. Clearly identify characters as AI. 
 
Build a complete first release before expanding into the later features. Keep a capability ledger showing what is working, blocked, and deferred. 
 
1. INSPECT THE ENVIRONMENT AND SELECT A REAL MODEL 
 
Discover available deployment, database, authentication, secret-management, AI, scheduling, and notification capabilities. Read relevant deployment and SDK documentation before implementing. 
 
Prefer an available managed backend AI service when it can support a functioning pilot. If AppDeploy is available, inspect its current ai.generate documentation and run a real generation call. Do not assume model choice, streaming, voice, pricing, or production limits are supported simply because text generation exists. 
 
Otherwise, use the Gemini Developer API through an official server-side SDK. Verify current supported model IDs, availability, pricing, data policies, and tool capabilities from official documentation. 
 
Select: 
- A low-cost model for ordinary conversation and simple structured tasks. 
- An optional stronger model for difficult work. 
- A separately configured speech solution. 
 
Do not leave the default model as “TBD.” Choose a concrete supported model and test it. Keep model IDs configurable so they can be changed without rewriting the app. 
 
Build a provider adapter so the app can later change providers without replacing the UI, database, or agent system. Model capabilities must be explicit: text, streaming, structured output, tools, image input, speech, and search. 
 
If external credentials are required: 
- Create a secure secret-entry flow using available platform tools. 
- Tell me exactly which account and billing setup are needed. 
- Never ask me to paste a secret into ordinary chat. 
- Continue all independent implementation while credential setup is pending. 
- Never claim the model is connected until a real deployed request succeeds. 
 
Use the paid provider configuration for a public pilot involving personal conversations unless a reviewed alternative has suitable data terms. 
 
The app owner funds model access. Ordinary users do not need API keys. 
 
2. BUILD THE CORE APPLICATION 
 
Deliver a polished, responsive web app with installable PWA support where available. It must be usable on desktop, iPhone Safari, and Android Chrome. 
 
Use the platform’s supported full-stack architecture. If no integrated platform is available, prefer TypeScript, React/Next.js, and a managed database/authentication service. Choose supported versions and justify material deviations briefly. 
 
Required workflows: 
 
A. Accounts 
- Sign up, sign in, sign out, and recover access. 
- Persist user settings across devices. 
- Export and delete account data. 
- Enforce ownership of every private record and uploaded file. 
 
B. Agent studio 
- Create, edit, duplicate, archive, and delete agents. 
- Upload an avatar and choose from built-in visual options. 
- Edit personality, worldview, background, instructions, and memory. 
- Preview the agent with a real model conversation. 
- Save many agent configurations without running them continuously. 
 
C. Projects and conversations 
- Create, rename, archive, and delete projects. 
- Invite agents by dragging their avatars into projects on desktop. 
- Provide equally usable touch and keyboard alternatives. 
- Show clearly which agents are participating. 
- Support individual conversations and a moderated roundtable. 
- Default to one responding agent; let the user explicitly request several. 
- Attribute each response to its agent. 
- Preserve conversations and restore them after refresh or sign-in. 
- Support copying, retrying, and cancelling responses. 
- Use streaming where supported; otherwise show an honest pending state. 
 
D. Project knowledge 
- Support text notes and a documented set of file types, including PDF and text. 
- Implement real extraction and retrieval within provider/platform limits. 
- Display processing progress and errors. 
- Attach source references to answers based on project documents. 
- Treat uploaded documents as untrusted content, not instructions. 
- Let users inspect and delete stored memories. 
- Keep project access and personal memory scope separate. 
 
Never claim to have read an unsupported or failed upload. 
 
3. IMPLEMENT A FUNCTIONING VOICE EXPERIENCE 
 
A user should start a voice session once and then speak naturally without clicking Send after every turn. 
 
Implement: 
- Microphone permission. 
- Listening, processing, and speaking states. 
- Automatic end-of-turn detection. 
- Spoken responses. 
- Stop and mute controls. 
- A visible transcript. 
- Interruption handling where supported. 
- Stable voice assignments from an available voice library. 
 
Prefer a supported live speech API when affordable and available. Otherwise implement a real speech-to-text → model → text-to-speech pipeline. 
 
For direct browser connections to a live model, use supported short-lived credentials issued by an authenticated backend. Never expose permanent provider keys. 
 
Browser speech synthesis may be a clearly labeled fallback, but do not promise that every device has the same voices. 
 
Test the actual microphone and playback flow. Document what happens when the screen locks or the app moves into the background. 
 
Do not promise permanent background wake-word listening in a PWA. Keep the architecture ready for a later native Android assistant and native iOS integrations. 
 
4. IMPLEMENT PROACTIVE WORK 
 
Create a durable proactive inbox and server-side scheduled jobs. 
 
Users can explicitly enable: 
- Reminders. 
- Interest-based ideas. 
- Scheduled research reports. 
- Image generation, if a real image provider is connected. 
 
Provide separate controls for generating work and notifying the user. 
 
Include: 
- Schedule and timezone. 
- Topic and project scope. 
- Notification frequency and quiet hours. 
- Usage allowance. 
- Pause and delete controls. 
- “Why this was created” explanations. 
- Job history and error status. 
 
Research reports must use a functioning search/grounding integration and accessible source links. If search is unavailable, do not represent model-generated summaries as current research. 
 
Scheduling must work while the browser is closed. Use durable job records, idempotency, bounded retries, and overlap prevention. 
 
Show results in the inbox even when push notifications are denied. Add push only through supported platform capabilities and test it. 
 
Inferred reminders should be suggestions unless the user has explicitly authorized automatic creation. Explicit reminder instructions may create reminders immediately. 
 
5. ADD A REAL, SMALL CONTEXTUAL MUSIC FEATURE 
 
Include this after the core app works. 
 
Users can deliberately select a context such as working, walking, cooking, traveling, or reflecting, describe the moment, and specify musical taste. 
 
Return: 
- Suggested track and artist. 
- A short explanation. 
- A verified catalog link. 
- Feedback controls: liked it, disliked it, wrong moment. 
- An optional shareable recommendation card that contains no copied audio. 
 
Use a permitted catalog/search integration. Verify track identity rather than inventing titles or links. 
 
Do not require autoplay for this release. Do not ingest streaming-service content into models contrary to provider terms. Playback requires separately verified platform permissions and licensing. 
 
Do not pretend the app can see other apps, infer what someone is looking at, or access location without permission. 
 
6. PRESERVE THE LARGER VISION 
 
Keep these as subsequent milestones; do not let them delay the usable core release: 
 
A. Friendship introductions 
Opt-in, user-approved interest profiles; approximate location or remote preference; reciprocal introductions; blocking and reporting. Never expose private chats or automatically send messages to other users. 
 
B. Dating 
Separate explicit adult enrollment, reviewed matching profiles, reciprocal preferences, age assurance, and moderation. Keep disabled until these operations are implemented. 
 
C. Mini-movies 
Reusable character references, storyboard, real generation provider, continuity checks, cost estimate, and downloadable result. Do not present a storyboard as a generated movie. 
 
D. Native mobile 
Deeper Android assistant integration and supported iOS entry points. Verify current platform policies before implementation. 
 
E. Hardware 
Future companion device, phone, projection, and camera-drone concepts. No hardware work in this software release. 
 
Do not put decorative “working” buttons in the app for deferred capabilities. Clearly label previews or omit them. 
 
7. CONTROL COST AND ENFORCE PERMISSIONS 
 
All permanent credentials remain on the backend. 
 
Require authentication, ownership checks, input validation, upload limits, rate limits, and bounded tool execution. 
 
Enforce agent permissions in application code. Agent instructions are not an authorization system. 
 
Use: 
- Per-user and global quotas. 
- Atomic usage reservations before expensive calls. 
- Token and output limits. 
- Maximum roundtable participants and turns. 
- Bounded context with deliberate summaries. 
- Limited retries and a global AI kill switch. 
- A usage ledger for model, voice, search, and media calls. 
- An owner dashboard for provider health and usage. 
 
Distinguish measured token usage from estimated costs. If the managed provider does not expose tokens or pricing, record calls and duration and state the limitation. 
 
Do not rely on provider billing alerts as hard spending caps. 
 
Never start recursive agent conversations or indefinite research loops. Saving more agents must not multiply background spending. 
 
Require explicit confirmation before purchases, public posts, messages to others, financial transactions, or destructive external actions. 
 
8. MAKE IT FEEL FINISHED 
 
Use a distinctive, restrained visual design with expressive avatars, readable typography, and useful motion. 
 
Design around: 
- Agent shelf. 
- Project workspace. 
- Conversation area. 
- Voice-session controls. 
- Proactive inbox. 
- Settings and usage. 
 
Support accessible controls, keyboard navigation, reduced motion, loading states, empty states, and recovery from errors. 
 
Avoid excessive setup. A new user should be able to select a premade agent and send a real message immediately after signing in. 
 
9. TEST THE DEPLOYED APP 
 
Verify these acceptance criteria: 
 
- A new account can sign in. 
- An agent can be created and produces a real model response. 
- Personality settings affect responses while factual standards remain intact. 
- A project can invite multiple agents and run a bounded roundtable. 
- Conversations and settings survive refresh. 
- A supported document can be uploaded and queried with source references. 
- An active voice session accepts speech and plays a response. 
- A scheduled job runs with the browser closed. 
- A music recommendation resolves to a real track. 
- Two different accounts cannot access each other’s records or files. 
- Deleted access scopes are respected on subsequent requests. 
- Missing credentials, provider failures, quotas, and denied permissions produce useful errors. 
- No permanent API key appears in frontend code, network responses, or logs. 
 
Use meaningful integration and browser tests. Report precisely which tests passed, failed, or could not be performed. 
 
Deploy to a supported host and inspect runtime errors. Fix failures and retest. If deployment or model access is blocked, complete all remaining independent work and identify the exact missing dependency. 
 
10. HANDOFF AND EXECUTION RULES 
 
Deliver: 
- Working app URL when deployment succeeds. 
- Source code and database migrations. 
- Environment-variable template containing no secrets. 
- Setup and redeployment instructions. 
- Selected provider and exact model configuration. 
- Test results and remaining limitations. 
- Estimated operating costs for light, moderate, and heavy use. 
- A prioritized next-release backlog. 
 
Calculate costs from verified rates and explicit usage assumptions. Include voice, search, storage, and retries, not just text tokens. 
 
Do not call the app finished until its deployed core flow uses a real model and durable storage. 
 
Make routine engineering decisions autonomously. Do not repeatedly ask me to choose frameworks or colors. Ask only for genuinely required credentials, account actions, spending authorization, or decisions that materially change scope. 
 
Start now by inspecting capabilities, selecting the deployment architecture, and proving a real model request. Then build the smallest complete vertical slice: sign in → create agent → send message → receive real response → refresh and recover the conversation. Expand from that working foundation.         Use this image for how the chat interface should look. For design: Here are some websites I like:   1. [https://www.praxisnation.com/](https://www.praxisnation.com/) I like their animations (the city and the rotating steel visa) and the overall feel of the site.   2. [https://www.hebbia.com/?ref=a1.gallery](https://www.hebbia.com/?ref=a1.gallery)   I like how dynamic the site looks. I like how the symbols seem to pop out and how there are videos and animations that play automatically as you scroll. I also like how the numbers count up from zero very quickly the first time you scroll by them. 3. [https://www.mercedes-benz.com/en/](https://www.mercedes-benz.com/en/) This site looks sleek and modern but also inspires trust and gives off a sense of quality and excellence.  4. I like the meridian site chatgpt made for me.