# Working together on Anchor

The development team owns app implementation, fixes, tests, pull requests, and beta-feedback triage. The release collaborator owns Apple/App Store Connect and TestFlight work, signing and release coordination, and support integration. In-app purchases remain future work; the current capability stays disabled.

## A small PR workflow

1. Start a focused `codex/` feature branch from current `main`.
2. Implement one reviewable change and run the relevant checks. Record actual device testing separately from automated checks.
3. Open a PR into `main` using the repository template. Explain the problem, user impact, results, and any migration or compatibility implications.
4. Address review feedback before merging. The release collaborator reviews changes affecting distribution, native permissions/configuration, support integration, or release readiness. Their GitHub username is **TBD**; no reviewer identity or access is assumed.

A merge is a source-code update. This workflow does not automatically publish builds, submit to TestFlight, or release to the App Store. Publishing remains a deliberate action owned by the release collaborator; no automatic publishing CI is configured by these documents.

## Invite-only beta and feedback

The team agrees a small tester list with the release collaborator and supplies the build's scope, known limits, and checks to try. The release collaborator coordinates signed preview/TestFlight distribution and invitations. A public source repository does not make the beta an open enrollment program.

Use the issue template for reproducible, sanitized feedback: device, OS, exact build, steps, expected result, and actual result. The team triages reports into actionable issues and links fixes to PRs. Confirm the fix on the affected build/device where practical.

Because this repository is public, beta invitations must identify a private feedback route before collecting sensitive material. That route is **TBD** with the release collaborator; these documents do not establish a mailbox, invite testers, or grant repository access. Keep raw recordings, personal notes, and legal/medical details out of public issues and PRs by default.

Use [the developer handoff](HANDOFF.md) for build prerequisites and device acceptance checks, and [the validation record](VALIDATION.md) for what has actually been tested.
