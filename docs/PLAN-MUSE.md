# Plan — make Flow look and work like Muse, patch its gaps, ship

Written 21 Sep 2026 from the Muse App Store listing (six screenshots, v8.0), Meta's July newsroom post, and four reviews (saner.ai, saascrmreview, usecarly, myclaw). Nothing here is built yet. This is the plan the owner asked for before any code changes. Decisions it needs are at the end as D10–D14.

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
