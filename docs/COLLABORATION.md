# Working together on Flowthread

Two builders, one deployer, one repo. Written 21 Sep 2026 after the build 9 handoff; replaces the earlier draft.

## Who does what

| | Cihan (owner, product) | Claude on Cihan's side (`seanjohnzon`) | Samil + his Claude (Kodavena) |
|---|---|---|---|
| Owns | the product, decisions, his phone as the test device | building, tests, the dev runtime, handoff docs | last touches, release fixes, Apple/App Store Connect, TestFlight, the cloud worker, the website |
| Pushes as | `cihanshahPro` | `seanjohnzon` | `samilaltun1997-source` |
| Builds | — | on the dev runtime (never shipped) | locally with Xcode (`docs/RELEASE.md`) |

## One repo

**`cihanshahPro/Flow` is the hub.** Everything lives there: code, `docs/`, fixtures, the worker. No copies. Samil's temporary private copy is archived once his branch is pushed here.

- Branches: `cihan/<topic>` for Cihan's side, `kodavena/<topic>` for Samil's side. Long-lived: `kodavena/build9` (current release line) → `testing` → `main`.
- PRs into `kodavena/build9`; the other side reviews. Never rebase or force-push a shared branch. `--ff-only` pulls.
- Before starting anything, one WhatsApp line: *"starting: move timing"*. Two people fixed the same thing twice on 19–20 Sep; that is the only rule that prevents it.
- `npm run verify` (tsc + 300+ tests) green before every PR; worker `npx vitest run` green when the worker changes.

## Handoffs

A handoff is one file in the repo, `docs/HANDOFF-<build>.md`, plus the same file as a PDF on WhatsApp. Sections, always in this order: what the app is now · how to verify · the build command · the brain · what's left as a task table with an owner per row · known gaps. The reply comes back the same way (`docs/REPLY-<build>.md`), with its open decisions numbered so the answer can be one line per number.

Nothing in a handoff may depend on a machine the other side cannot reach. Dev-runtime details go in `docs/HANDOFF.md` under "Current testing runtime", nowhere else.

## Data

- No real personal data in git, ever. Fixtures are invented people with the same shape (`tests/fixtures/sample/`). Real phone snapshots stay outside the repo.
- Keys and tokens live only in Cloudflare secrets and local `.env*` files (git-ignored). The app never calls Anthropic directly.
- Beta feedback and recordings go through a private route, never issues or PRs.

## Release

Merging is not releasing. Samil uploads builds (Xcode archive, `docs/RELEASE.md`), keeps the Apple-blocker list in every build, and announces the build number on WhatsApp. Cihan is App Manager in App Store Connect and in the TestFlight group.
