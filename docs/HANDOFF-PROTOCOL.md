# Handoff protocol — what went wrong, the patterns, and the fix for each

Written 21 Sep 2026 after the build 9 handoff round trip. This is the retrospective and the rule set that comes out of it. Every future handoff (Cihan's side → Samil's side, or back) follows the loop at the end; no handoff is sent that fails the pre-flight.

## 1 · Every mistake so far, in order

| # | What happened | Root cause | Cost |
|---|---|---|---|
| 1 | Build 12 handoff (19 Sep): Samil rebuilt onboarding value-first while the owner wanted test-first; both sides then fixed the Next card and move timing separately. | Product decisions were not written as decisions; nobody announced what they were starting. | Two days of duplicated work; a decision the owner had to re-make later. |
| 2 | Pushes from this Mac failed, then invites went to the wrong account (19 Sep, again 21 Sep). | The push identity (`seanjohnzon`) was never stated in any handoff; the owner's browser identity (`cihanshahPro`) was assumed to be the same. | Hours; an invite to Samil's repo that could not be used. |
| 3 | First build 9 handoff told Samil to log in on the Mac mini. | Written from my environment, not the reader's. Samil has no mini. | Owner had to catch it. |
| 4 | Three versions of the handoff existed at once (txt, md, PDF, two web pages) with different heads (`3c52d7a`, `69555d9`, `620d850`); the PDF was a dark web page cut off on the right. | No single source; artifacts generated at different times and never deleted. | Owner read a stale one at 3 am and lost trust. |
| 5 | Handoff said "no API credits, brain is on-device only" and "run `eas build`". Samil's worker was live with a key, `/v1/plan` and `/v1/chat` deployed, and 1.1.0 (9) already uploaded at 14:30 via a local Xcode archive. | I never read the other side's state before writing: not his `RELEASE.md`, not the worker, not App Store Connect (the tab was open in the owner's Chrome). | A handoff that told the deployer things he had already done, and got two of them wrong. |
| 6 | The owner's real recordings and threads were committed to a public repo (`7310579`). | No data rule; I never checked repo visibility; I treated "test on his real data" as "put it in git". | Personal legal matters public; Samil had to raise it; history purge now needed. |
| 7 | Two repos: Samil created a private copy and declared it the source of truth. | Direct consequence of 6, plus no declared hub. | Access confusion, a merge nobody asked for, a second place for docs. |
| 8 | I asked the owner for an "Admin" role that does not exist on a personal-account repo, then to make the repo private as if it solved access. | I asked before checking GitHub's actual model with the API; I pressed on symptoms. | Owner clicking through settings at 4 am for nothing. |
| 9 | The owner's phone ran a stale bundle for hours while I reported fixes; the build stamp in Me was stale because Metro was never restarted. | I reported what the repo had, not what his device ran; no verification against the mirror's `build` field. | "You haven't changed a thing." |
| 10 | Testing ran on demo data; when I loaded his data onto the simulator, the simulator overwrote his phone's mirror with its own. | Import copied the other device's identity; no rule "never test on demo data" until he said it. | Restored twice from the repo copy. |
| 11 | Skeleton said Upcoming/Recordings; the plan he approved said Calendar/Threads; the app followed the skeleton. | I renamed approved things without updating the approved artifact or saying so. | "Stick to what you showed me." |
| 12 | WhatsApp: 20 minutes reading the window's accessibility tree, text sent, PDF never attached. | The channel was untested; I improvised live in his chat. | His time, at 3 am. |

## 2 · The patterns (six, not twelve)

- **A · Writing from my own state.** Handoffs described what I had done, not what the reader had, could reach, or had already done (3, 5, 9).
- **B · Identity and access never stated.** Who pushes as whom, who can reach which machine, which account an invite must name (2, 7, 8).
- **C · Many copies, no source.** Text, PDF, pages, repo docs, all slightly different (4).
- **D · Silent changes to approved things.** Names, data in git, the skeleton (6, 11).
- **E · Asking the owner to press buttons before verifying the button exists or matters** (8).
- **F · Claims not verified against the device or the other side** (9, 10, 12).

## 3 · The rule for each pattern

- **A → Read their side first.** Before writing a handoff: read the last handoff and reply in `docs/`, the other side's branch (`git log hub/kodavena/build9`), the worker (`curl /v1/plan`), and App Store Connect (builds list). The handoff opens with "What you already have" so nothing they did is asked for again.
- **B → An identity header on every handoff.** Repo, hub branch, and a three-column table: who / pushes as / can reach. Any access request names the exact account (`seanjohnzon`) and is checked against the API (`GET /user/repos?affiliation=collaborator`) before being written.
- **C → One file, one path, one sha.** `docs/HANDOFF-<build>.md` and `docs/REPLY-<build>.md` in the hub. The PDF is generated from that file as the last step and carries the same head sha in its first line. Loose copies are deleted the moment the PDF exists.
- **D → A change log and two hard rules.** Every handoff lists "changed vs what you approved" (names, screens, data). Rules: no real personal data in git (invented fixtures, `tests/fixtures/sample/`); approved artifacts (skeleton, plan) are updated and announced before the app diverges from them.
- **E → Verify, then ask once.** Before any request to the owner: confirm with the API that the action exists (roles, visibility, transfer) and that it changes the outcome. Owner-only actions are batched into one numbered list at the end of a handoff, never dripped one at a time.
- **F → Fact sources for every claim.** "It's on your phone" = the mirror's `build` sha equals the repo head. "It's in TestFlight" = App Store Connect builds list. "It works" = a screenshot from the simulator on realistic data (sample fixture or the owner's snapshot loaded through the dev import, never demo data). WhatsApp: the file goes into the repo first; the message is one line with the path; attaching is done by hand until automation is proven on a test chat.

## 4 · The loop, tied together

```
read their side  →  write ONE file in docs/  →  pre-flight  →  generate PDF from it  →  one line on WhatsApp + the PDF
        ↑                                                                                             |
        └──────────────── their reply lands as docs/REPLY-<build>.md; open decisions tracked in docs/DECISIONS.md ←┘
```

Pre-flight (all must be true, else it is not sent):
1. Identity header present; every account named matches the API.
2. "What you already have" section written from their branch/worker/ASC, not memory.
3. Nothing depends on a machine the reader cannot reach.
4. No personal data, no keys, no install ids in the file or the repo diff.
5. Task table: every row has one owner and a "done when".
6. Change log vs approved artifacts present.
7. `npm run verify` green at the head sha quoted in the file.
8. Every "it is on X" claim has its fact source noted.
9. The PDF is generated from the file; all other copies deleted.
10. Owner-only actions, if any, are one numbered list at the end — and each was checked to exist and to matter.

`docs/DECISIONS.md` holds every open product decision as one row (question · options · owner · answer · date). A handoff never re-asks a decided one and never leaves an undecided one implicit.

## 5 · Applied right now to the build 9 round trip

- Hub: `cihanshahPro/Flow` (both sides have write; verified via API). Samil pushes `kodavena/build9` there; his copy is archived. No new access needed by anyone.
- Owner-only actions, checked and batched: (1) run the git-filter-repo purge (the sandbox refuses history rewrites); (2) optionally make the repo private. Nothing else.
- What Samil already has (read from his reply): worker live with key, `/v1/plan` + `/v1/chat`, 1.1.0 (9) in TestFlight, local Xcode build order, Apple-blocker list, a merge of our `620d850` with four resolved conflicts.
- What we do next: `cihan/plan-busy-ranges` (his decisions 1, 2, 5b, 5c), PR into `kodavena/build9`, review of his four conflict resolutions.
- The reply file `docs/REPLY-BUILD9.md` was rewritten to pass this pre-flight; `docs/DECISIONS.md` created from his five questions.
