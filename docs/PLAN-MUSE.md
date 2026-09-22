# Plan — make Flow look and work like Muse, patch its gaps, ship

Written 21 Sep 2026 from the Muse App Store listing (six screenshots, v8.0), Meta's July newsroom post, and four reviews (saner.ai, saascrmreview, usecarly, myclaw). Nothing here is built yet. This is the plan the owner asked for before any code changes. Decisions it needs are at the end as D10–D14; D15 (name) is answered: **Okay**. §12–§14 (full gap list, the brain, the business model) added the same day.

## 1 · What Muse is, exactly

**One sentence.** A chat with an agent that has your accounts, does things in the background, and comes back when it needs a yes.

**The shell (from the screenshots).**

| Part | What Muse shows |
|---|---|
| Header | ☰ menu top-left · avatar + name centred · a status line under the name while it works ("Booking reservation…") |
| Body | Chat bubbles: agent grey on the left, you blue on the right. Rich cards inside the chat: a PDF it made, a browser it is driving, a checkout with **Deny / Allow**, a finance tracker. |
| Composer | `+  Message  🎤` — one line, attach on the left, voice on the right |
| Tab bar | Five icons, pill-shaped: **Chat · Library · Ideas · Tasks · Apps** |
| Ideas tab | "Ideas" list: emoji · bold title ("I can follow up on your airline refund") · grey reason in one or two lines ending in an offer ("Want me to draft a follow-up and track it until it lands?") |
| Tasks tab | Goals/standing tasks it is tracking, with check-ins |
| Library tab | Everything it made: documents, plans, images |
| Apps (Connectors) | Search · **Connected** list (Gmail, Google Calendar, OpenTable, Facebook, Instagram, Peloton…) with chevrons · **Available** list with blue **Connect** |
| ☰ menu | Upcoming (scheduled reminders/tasks) · Memory (three editable files: Memory, Soul, Identity) · Settings · Connectors · plan |

**The behaviours.**
- Standing tasks with a time: "Every Friday at 5pm, write me a summary…"; daily briefing that reads the calendar and flags double bookings.
- Follow-through: makes a plan, does next steps, comes back without being re-prompted; reminds you later ("I'll remind you on Thursday to pack a lunch").
- Acts in accounts: sends email, books tables, buys, fills forms in a cloud browser. Every send/spend goes through a separate Sentinel approval **outside the chat** (Deny/Allow card).
- Memory across sessions; you can ask what it saved and edit it.
- Pricing: Free (limit unpublished) · Power $20/mo (500M tokens/wk) · Maximum $100/mo (3B tokens/wk). Weekly reset.
- Reach: US only, 18+, Meta account (Facebook/Instagram/email/phone), iPhone iOS 18+. 4.9★ from 25K ratings after 13 days.

## 2 · Muse's gaps (what reviewers and the listing actually show)

| # | Gap | Evidence |
|---|---|---|
| G1 | No Apple Calendar, no Apple Reminders, no Apple Contacts | Connectors list: Gmail, Google Calendar, Google Contacts only |
| G2 | US only, 18+, needs a Meta account | Listing + saascrmreview |
| G3 | Approval bottleneck: everything that sends or spends waits on you; "conservative" default | Sentinel; usecarly |
| G4 | Silent failures: background monitors stop, "Errors passed without any notice. Then monitoring disabled itself with no explanation" | saner.ai |
| G5 | Token anxiety: one reviewer "burned 81% of it in a single day of ordinary use" | saner.ai |
| G6 | No notes, no documents of your own, "No way to ask a question across your own writing" | saner.ai |
| G7 | Everything lives on Meta's servers; the privacy label lists finance, health, location, browsing, contacts — used for advertising | App Store privacy section |
| G8 | Not for work; personal life only | Meta positioning, every review |
| G9 | Chat-only intake: no voice dump that becomes threads, no evening "plan tomorrow" ritual, no routines | Nothing in the listing or reviews mentions any of these |

## 3 · What Flow already has that maps onto Muse (nothing to throw away)

| Muse | Flow today | State |
|---|---|---|
| Chat with the agent | ThreadChat (assistant mode, summary card, step tree, split offers) | Works, tested on the owner's data |
| Daily briefing | Morning push "Your day" + Today screen | Push exists; no briefing *message* in the chat |
| Standing tasks / check-ins | Routines, Plan tomorrow, waiting-on with chase dates | Exists; not phrased as "standing tasks" |
| Follow up with people | Waiting-on rows | Detects; does not draft the chase |
| Memory | Profile + threads | Exists; not visible or editable as "what Flow knows" |
| Library | Recordings summaries, week plan | Exists under Threads |
| Ideas | `suggestForTomorrow`, WATCH OUT conflicts | Logic exists; no Ideas screen |
| Connectors | Me → calendars toggles, WAYS IN | Apple Calendar + Reminders two-way already work |
| Approval card | Chat offer "Say 'do it' and it goes on your Today" | Exists as text, not a card |
| Voice | Voice dump → threads + step tree (G9) | Muse does not have this |

## 4 · The patches (Flow = Muse − gaps)

| # | Patch | Closes |
|---|---|---|
| P1 | Apple Calendar + Apple Reminders + Contacts as first-class connectors, on by default, no OAuth (EventKit/Contacts — already in the app) | G1 |
| P2 | Google Calendar + Gmail as connectors via Google Sign-In OAuth (see §7 for the verification cost) | parity |
| P3 | Worldwide, no Meta account, Sign in with Apple only | G2 |
| P4 | Nothing to approve for planning: calendar moves, reminders, drafts happen without a gate; only *sending* to a person shows a card, and the user taps send in Messages/WhatsApp/Mail themselves (share sheet). No Sentinel needed because Flow never sends on its own | G3 |
| P5 | Every standing task shows its last run and next run in Upcoming; a failed run posts a line in the chat | G4 |
| P6 | Flat price, no tokens: Free = on-device brain (Apple Foundation Models, already the fallback) · Plus = cloud brain, unlimited normal use | G5 |
| P7 | Library holds your own recordings and summaries; "ask across your notes" = chat with the Library as context | G6 |
| P8 | Data stays on the phone and in your own calendars; the cloud brain sees busy ranges, not titles (D1). Privacy label: nothing linked to you | G7 |
| P9 | Works for work: threads, waiting-on, steps are project-shaped already | G8 |
| P10 | Keep the voice dump, split offers, Plan tomorrow, routines — Muse has none of them | G9 |

## 5 · Screen by screen — the new shell

Tab bar becomes Muse's five: **Chat · Library · Ideas · Tasks · Apps**. Me moves into the ☰ menu. This replaces Today · Threads · Calendar · Me (change vs the approved skeleton v2 — D10).

| Screen | Copy from Muse | Filled with Flow's data |
|---|---|---|
| **Chat** | ☰ · avatar "Flow" + status line · grey/blue bubbles · `+ Message 🎤` composer · cards in the thread | One main thread. The morning briefing arrives here as a message ("Thu 24 Sep. Two things today, a gap 2–4, you're double-booked at 3 — move the call?"). Voice button = today's voice dump. Topic threads open from ☰ or from a card ("Tenancy case ›"). Cards: summary card, step tree, calendar-move card with **Not now / Do it**, chase-draft card with **Edit / Send** (share sheet). |
| **Library** | List of things it made | Recording summaries (no audio, no transcript), week plans, Plan tomorrow lock-ins. Row = icon · title · one line · date. |
| **Ideas** | Emoji · bold "I can …" · reason · offer | Generated nightly and on calendar change: "I can chase the surveyor — 9 days, chase date was Mon" · "Thursday is double-booked 3–4" · "You said 20 min exercise; there's a gap 7:10–7:30" · "Tomorrow's plan isn't locked yet". Tap = one chat turn already answered. |
| **Tasks** | Goals with check-ins | Today's moves + the week (our Today + Calendar merged: CALENDAR · MOVES · THIS EVENING · WAITING ON, then DayBlocks below). Standing tasks section: routines and Plan tomorrow with their times. |
| **Apps** | Search · Connected (chevron) · Available (Connect) | Connected: Apple Calendar, Reminders, Contacts. Available: Google Calendar, Gmail, WhatsApp (share only). Each row → the calendar toggles / sign-in. |
| **☰ menu** | Upcoming · Memory · Settings | Upcoming = scheduled pushes and standing tasks with next run. Memory = "What Flow knows about you" as an editable page (profile + rhythm). Settings = current Me (feedback, data, dev rows). Plan = Free/Plus. |
| **Onboarding** | Sign in → connect apps → first message | Sign in with Apple → Apple Calendar + Reminders permission → first briefing appears in Chat within 10 s of granting (value-first, D7). |

Skeleton v3 is drawn from these seven rows before code, published, and compared screen for screen like v2 was.

## 6 · Build order — three TestFlight builds

| Build | Scope | Done when |
|---|---|---|
| **10 · Shell** | Five-tab bar, ☰ menu, Chat as the home with the main thread, Library, Tasks (Today+Calendar merged), Apps screen listing Apple connectors, Memory page. No new intelligence. | Skeleton v3 = app screen for screen (proof page like TDKxHu…); `npm run verify` green; owner's data loads and every existing flow (dump, split, Existing…, Plan tomorrow, tick on phone) still passes on the simulator. |
| **11 · Muse behaviours** | Morning briefing as a chat message; Ideas generator (conflicts, overdue chases, gaps for routines, unlocked tomorrow); calendar-move card with Do it; chase-draft card → share sheet; Upcoming with last/next run; failure line in chat. | Each Idea type has a fixture test; briefing shows on the simulator with the owner's data; chase draft opens the share sheet. |
| **12 · Connectors + plan** | Google Sign-In → Google Calendar read/write into the same calendar layer; Gmail read (after verification, §7); Plus subscription (StoreKit) gating the cloud brain; App Store listing, six screenshots in Muse's layout ("Your calendar's agent", "Nothing to approve", "Connect the apps you already use"). | Google Calendar events appear in Tasks and the briefing; purchase flow passes in sandbox; listing submitted. |

Who: Cihan's side (Claude, pushes as `seanjohnzon`) builds 10 and 11 in JS on `cihan/muse-shell` and `cihan/muse-behaviours`, PRs into `kodavena/build9`. Samil (`samilaltun1997-source`) owns build 12's native/cloud parts: Google Cloud project + OAuth consent, StoreKit product, worker route for briefing text, App Store Connect. Handoff per `docs/HANDOFF-PROTOCOL.md`, one file per build.

## 7 · Costs and blockers, checked

- **Google Calendar scope** (`calendar.events`) is a *sensitive* scope: OAuth consent-screen verification, usually 1–2 weeks, needs a privacy policy URL and a demo video. **Gmail read** (`gmail.readonly`) is a *restricted* scope: verification **plus** a CASA Tier 2 security assessment (weeks, third-party lab, fee). So: Google Calendar in build 12; Gmail in the build after, or launch without it. Muse's Gmail parity is the one thing we cannot have on day one.
- **Cloud brain cost.** Muse sells tokens. We sell a flat Plus. The worker already exists with a key (Samil's). Plus price must cover ~$0.05–0.30 per user per day of normal use at current model prices; automatic calls stay on-device (D2). Free tier never calls the cloud. This is the "no API-credit route" from the owner: the subscription pays for the calls, the user never sees credits.
- **Sign in with Apple** is required by App Store review if any third-party sign-in (Google) is offered. Samil adds it in build 12.
- **Acting in accounts** (buying, booking, browser driving, sending email as you) is not in this plan. It is Meta's moat (a cloud VM per user). Flow's position is the opposite: nothing to approve because it never sends for you — you tap send.
- **Apple Foundation Models** on-device needs iOS 26 and an A17/M-class device; older phones get the local floor (`localPlan`) — already the case.

## 8 · Go to market

- **Position:** "Muse for your iPhone calendar. Nothing to approve, nothing to connect, works everywhere." Three lines on the listing: it plans your day from what you say · it follows up on what you're waiting for · it never sends anything you didn't tap.
- **Where Muse can't play:** outside the US, people without Meta accounts, anyone whose life is in Apple Calendar/Reminders, anyone who wants work threads.
- **Price (D12):** Free (on-device, Apple connectors, briefing) · Plus $7.99/mo or $59/yr (cloud brain, Google connectors, Ideas that read email later). Cheaper than Muse Power by 60%; flat.
- **Launch sequence:** build 10 to TestFlight (internal) → build 11 to TestFlight external (20 testers, the owner's circle) → build 12 submitted with the listing → launch worldwide the day it passes. Six App Store screenshots in Muse's exact layout: headline on top, phone below, blue gradient.
- **First 30 days measured by:** briefing opened per day, Ideas accepted, chase drafts sent, Plus conversion. All counted on-device and shown in Settings, nothing leaves the phone.

## 9 · Decisions this plan needs (one answer each)

| # | Question | Options | Recommendation |
|---|---|---|---|
| D10 | Replace Today · Threads · Calendar · Me with Muse's Chat · Library · Ideas · Tasks · Apps (+ ☰ menu)? | yes · keep v2 tabs, add Ideas only | Yes — "look exactly like that" |
| D11 | Home screen = Chat (main thread with the briefing) instead of Today? | Chat · Today | Chat; Today's rows live in Tasks |
| D12 | Plus price | $4.99 · $7.99 · $9.99 /mo | $7.99, $59/yr |
| D13 | Launch without Gmail (CASA weeks) or wait? | launch, add later · wait | Launch; Google Calendar only |
| D14 | Name in the header: "Flow" with an avatar like Muse, or no avatar? | avatar · none | Simple mark, no character; D8 said no personality |

Nothing is built until D10 and D11 are answered. D12–D14 can be answered before build 12.

## 10 · Name (D15)

"Flow" is out: 28 App Store apps named Flow, the top one with 404K ratings. "Muse" is theirs. The owner's brief: it must feel like Apple — a plain word nobody thought of using, the way Flow once was. Descriptive words (dote, heed, deft, tend) and mythic ones (seer, spur) were rejected. Checked ~170 four-letter words against the App Store search API (exact first-word matches, ratings of the biggest) and DNS/whois, 21 Sep 2026.

| Name | Why it is not thought of | App Store today | Domains |
|---|---|---|---|
| **Okay** | The name is the reply. You say a thing; it says "Okay." Nobody has named an app after the word that means *handled*. | **0** apps named Okay | okay.app/.ai/.so/.day taken — as for every real word; `then.app` and `tray.app` are the only free .app in this batch |
| **Then** | What comes next. "Then" is the whole product: this, then that. | 8 apps, biggest 24 ratings | **then.app free**, then.day free |
| **Soon** | Everything coming, in one word; the briefing and Ideas are "soon" | 10 apps, biggest 39 | soon.app taken, soon.day taken |
| **Tray** | Takes things off your plate and onto its tray; an object name like Pages, Notes | 9 apps, all 0 ratings | tray.app taken, tray.day free |
| Sail | smooth sailing — the Flow feeling | 26 tiny apps | sail.app taken |
| Told / Said / Sure / Done | replies and states | 2–15 tiny apps | weaker as a word on an icon |

**Answered 21 Sep 2026: Okay.** It reads like Apple (Journal, Freeform, Reminders), it is what the app says after every message, and no one has taken it. App Store name "Okay — say it, it's handled". Runner-up **Then** (the one with a free `.app`). Trademark: "Okay" is a common word; a class 9/42 mark is weak but the name is usable — Samil checks USPTO before build 12. Bundle id and URL scheme change in build 10 (new App Store Connect record).

## 11 · Goals as the funnel

Muse's Tasks tab is goals with check-ins. Ours: onboarding ends with one question — "What's one thing you want done this month?" — that becomes the first thread with a step tree, and the first Idea the next morning is its first step. Every later voice dump adds threads to the same Tasks tab. Progress ring per goal = steps done. Nothing else in onboarding (D7 value-first stands).

## 12 · Every gap, Muse vs Okay, and how each one closes

Sources: the six listing screens, Meta newsroom (Jul 2026), Stark Insider's Muse-vs-OpenClaw piece (the agent itself described its runtime), saner.ai, saascrmreview, docs.openclaw.ai. "Okay today" = the app on `kodavena/v1.0.0` at `20cb5f3`.

| # | Muse has | Okay today | Close it with | Build |
|---|---|---|---|---|
| 1 | One main chat with the agent; topic threads behind ☰ | One chat *per thread*, no main chat | Main thread "Okay" as home; topic threads reachable from ☰ and from cards | 10 |
| 2 | Status line under the name while it works ("Booking reservation…") | Thinking dots | Status line fed by the gateway's stream ("Reading your week…", "Placing 3 moves…") | 10 |
| 3 | Cards inside the chat (document, browser, checkout, tracker) | Summary card + step tree | Card kinds: briefing, calendar-move (Not now / Do it), chase-draft (Edit / Send), plan-locked, week | 11 |
| 4 | `+ Message 🎤` composer, attach on the left | Text composer + separate record button | Same composer; `+` = photo/file to the thread, 🎤 = voice dump | 10 |
| 5 | Persistent memory: MEMORY.md, USER.md, SOUL.md, semantic search over past chats | Profile + threads in AsyncStorage, no search | Per-user agent workspace on the gateway (MEMORY.md, USER.md); "What Okay knows" page edits USER.md; search = gateway memory search | 11 |
| 6 | Daily briefing at your time, reads calendar + email, flags double bookings | Morning push "Your day" + Today screen | Cron on the agent at the user's rhythm time → briefing message in the main chat + push; conflicts from `replanConflicts` | 11 |
| 7 | Standing tasks with a time ("every Friday 5pm…") | Routines (fixed kinds) and Plan tomorrow | Free-text standing tasks → agent cron; listed in Upcoming with last/next run | 11 |
| 8 | Goals with check-ins | Threads with step trees, no check-ins | Tasks tab = goals; a check-in message per goal on its cadence; progress ring = steps done | 11 |
| 9 | Follows up with people (sends the email itself, after approval) | Waiting-on rows with chase dates | Chase-draft card → share sheet (Messages/WhatsApp/Mail); the user taps send; no approval layer (P4) | 11 |
| 10 | Ideas tab: proactive offers from connector data | `suggestForTomorrow`, WATCH OUT | Ideas generated nightly by the agent from calendar, waiting-on, routines, unlocked tomorrow; Google data later | 11 |
| 11 | Connectors: Gmail, Google Calendar, Outlook, Google Docs/Contacts, Spotify, Plaid, OpenTable, Ticketmaster, Apple Health, Peloton, Withings, Function Health, Hue, Telegram, FB/IG/Threads/Messenger, Custom | Apple Calendar + Reminders (two-way) | Apps tab: Apple Calendar, Reminders, Contacts (on device) · Google Calendar (build 12) · Gmail (after CASA) · Apple Health (read, later). Nothing else at launch | 10/12 |
| 12 | Browser agent: fills forms, books, buys, tracks prices | — | Not built. Position against it ("nothing to approve because it never spends") | — |
| 13 | Sentinel: Deny/Allow for every send/spend, policy in Settings | — | Not needed: Okay never sends or spends. Only card with buttons = chase draft, and the user sends it | — |
| 14 | Library: documents, images, podcasts it made | Recording summaries under Threads | Library tab: summaries, week plans, locked tomorrows; "ask across my notes" = chat with Library as context | 10/11 |
| 15 | WhatsApp channel: talk to Muse from WhatsApp | — | Gateway WhatsApp channel bound per agent (`bindings` by `accountId`); one number, routed by sender. Ships after 12 | 13 |
| 16 | Web app (muse.ai) | — | Gateway WebChat behind Sign in with Apple; after 13 | 14 |
| 17 | Android | — | Expo builds Android; after iOS launch | 14 |
| 18 | Voice input | Voice dump → threads | Keep; Muse's is plain dictation, ours becomes threads + steps | — |
| 19 | Incognito chats | — | "Don't remember this" toggle on a thread → agent runs with memory off | 12 |
| 20 | Identity: name, avatar, vibe | — | Out (D8, D14): one mark, no character | — |
| 21 | Subagents, skills, cron hooks | — | Gateway provides all three; we use cron (6, 7) and one skill (planner) | 11 |
| 22 | Usage meter and tiers with weekly reset | — | §14 | 12 |
| 23 | Onboarding under one minute | Value-first, 4 screens | Sign in with Apple → Calendar + Reminders permission → one goal question → first briefing in the chat within 10 s | 10 |
| 24 | Meta account, US-only, 18+ | Sign in with Apple, worldwide | Keep; it is the wedge | — |

## 13 · The brain — where Muse's power comes from, and how Okay gets the same shape

**What Muse runs on.** A persistent Linux VM per user with a bash shell, a Chromium browser that keeps its sessions, `MEMORY.md` / `USER.md` / `SOUL.md`, semantic search over memory and chats, subagents, reusable skills, cron with event hooks; a separate Sentinel agent gates every network action. The model is **Muse Spark 1.3** (1M context), built under Alexandr Wang. The agent itself says its shape is "an agent with a real computer, file access, browser, messaging channels, and markdown config files for its persona" — the shape of **OpenClaw**, the MIT-licensed gateway (channels: WhatsApp, iMessage, Telegram, Signal, Slack, WebChat; memory files; cron/hooks; skills; multi-agent with per-agent workspace, `agentDir` and SQLite session store; iOS/Android nodes).

**Two facts that change the plan.**
1. **Muse Spark is a public API.** `https://api.meta.ai/v1`, model `meta/muse-spark-1.3`, $1.25 in / $0.15 cached / $4.25 out per 1M tokens (a "Contributor" variant at $0.10 / $0.002 / $0.20 lets Meta train on the content — **not for us**, it kills P8). Okay can run on the *same model* as Muse, or on Claude, behind one switch.
2. **OpenClaw is the runtime Muse is shaped after, and it is free.** One Gateway process runs many isolated agents (`agents.entries.<id>.workspace` / `agentDir`), each with its own memory, sessions, cron and channel binding. It exposes `POST /v1/chat/completions` (OpenAI-shaped; `model` = agent id, `user` = stable session key) and the OpenResponses API on port 18789. The owner already runs OpenClaw.

**Okay's brain, three layers.**

| Layer | What | Who |
|---|---|---|
| On device | Apple Foundation Models shaper + `localPlan` floor — Free tier, offline, automatic calls (D2) | exists |
| Gateway | One OpenClaw Gateway on a Linux box (Hetzner/Fly, EU). One agent per user: `agents.entries.<userId>` with workspace = `USER.md` (what Okay knows), `MEMORY.md`, `AGENTS.md` (the planner rules = today's `CHAT_INSTRUCTIONS`/`PLAN` contract), cron entries for briefing/standing tasks/goal check-ins. Tools allowlist: memory, cron, skills only — **no exec, no browser, sandbox off** (nothing to escape). `tools.agentToAgent.enabled: false`, `tools.sessions.visibility` restricted. Model per agent: `meta/muse-spark-1.3` or `anthropic/claude-*` by tier | Cihan's side builds the agent template and the planner skill; Samil hosts |
| Proxy | The existing Cloudflare worker becomes the only thing the app talks to: verifies Sign in with Apple, maps user → agent id, forwards to the gateway with the gateway token (which is owner-level and must never reach the phone), meters usage per user, gates by tier. Keeps `/v1/plan` as is | Samil |

**What stays on the phone.** Apple Calendar, Reminders, Contacts never leave the device. The app sends the agent busy ranges (D1) and the thread text; the agent replies with a plan/actions (`move`, `chase`, `step`) and the app applies them to EventKit — the same contract as today's `/v1/chat`. Google Calendar is the one connector the gateway holds itself (OAuth token in the agent's `agentDir`).

**What Okay does not copy.** The VM-with-browser and the Sentinel. They exist because Muse acts in your accounts. Okay plans, follows up, and drafts; the user does the last tap. That is 90% of the value at 5% of the infrastructure.

**Cost of the brain per active user.** A planning turn is ~6K tokens in (mostly cached) and ~400 out. 30 turns a day + briefing + nightly Ideas ≈ 6M tokens a month: Muse Spark standard ≈ **$2–3 / user / month**, Claude Haiku 4.5 less, Claude Sonnet ≈ $5. Free tier on-device costs nothing.

## 14 · Business model — Muse's, slightly cheaper

**Muse today.** Free ≈ 100M "Muse tokens" a week · Power $20/mo (iOS) or $16 (web) = 500M/wk · Maximum $100 / $80 = 3B/wk. Weekly reset, monthly renewal. Meter visible in the app. Zuckerberg: "most people to stay on the free tier". Complaint on record: the meter is opaque and a normal day can burn most of it (G5).

**Okay.** Same shape, three tiers, weekly reset, meter in ☰ — but the unit is *turns*, not tokens (a turn = one message answered, a briefing, or an Idea batch). Users understand turns; nobody understands 100M tokens.

| Tier | Price (iOS) | Price (web, when there is one) | Allowance / week | Brain |
|---|---|---|---|---|
| Free | $0 | $0 | On-device unlimited · 20 cloud turns | Apple on-device; cloud turns on Muse Spark |
| **Plus** | **$14.99/mo · $99/yr** | $11.99/mo | 500 turns | Muse Spark 1.3 or Claude Haiku 4.5 |
| Max | $59.99/mo | $49.99/mo | 3,000 turns + WhatsApp channel + Google connectors first | Claude Sonnet / Opus for chat, Spark for cron |

Plus is 25% under Muse Power; Max is 40% under Muse Maximum. Gross margin at Plus with a heavy user (500 turns × 6.5K tokens ≈ 3.3M tokens/wk ≈ 14M/mo) ≈ $6 of model cost on Spark against $14.99 → **~60%** after Apple's 15% small-business cut; a typical user costs under $3 → ~80%. Annual at $99 is the one to push (Muse has no annual).

Two more that Muse does not do: **founding price** — first 1,000 Plus subscribers keep $9.99 forever (fills the review queue in week one); **family**: not at launch.

StoreKit 2 products: `okay.plus.monthly`, `okay.plus.yearly`, `okay.max.monthly`. The worker reads the App Store Server API to set the tier per user; the meter counts turns on the worker. Free users never hit the gateway after their 20 turns; the app says so plainly and keeps working on-device.

## 15 · Build order, updated for §12–§14

| Build | Adds | Done when |
|---|---|---|
| 10 · Shell + name | Rename to Okay (bundle id, scheme `okay://`, new ASC record); five tabs; ☰; main chat; composer; Library; Tasks (Today+Calendar); Apps with Apple connectors; onboarding with the goal question | Skeleton v3 = app screen for screen; owner's data loads; `npm run verify` green |
| 11 · Gateway brain + Muse behaviours | Agent template (AGENTS.md planner rules, USER.md, cron); worker proxy; briefing in chat; standing tasks; goal check-ins; Ideas; cards (move, chase, plan-locked); Upcoming; Memory page | Briefing arrives on the simulator at the rhythm time from a real gateway; each card kind has a fixture test; chase draft opens the share sheet |
| 12 · Money + Google | StoreKit tiers + meter; Google Sign-In + Google Calendar; incognito toggle; listing + six screenshots in Muse's layout | Sandbox purchase sets the tier on the worker; Google events show in Tasks and the briefing; submitted |
| 13 · WhatsApp | Gateway WhatsApp channel bound per user | A message from the owner's WhatsApp reaches his agent and the reply lands in both places |
| 14 · Web + Android | WebChat behind Sign in with Apple; Expo Android build | — |

Owners: Cihan's side = app (10, 11 app side, 12 app side) and the agent template. Samil = gateway hosting, worker proxy, StoreKit/ASC, Google Cloud OAuth, listing. Every handoff per `docs/HANDOFF-PROTOCOL.md`.
