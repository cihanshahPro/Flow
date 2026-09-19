# Flow product work

Read `docs/GUIDED-PRODUCT-PLAN.md`, `docs/PROFILE-COMPLETION-CONTRACT.md` and `docs/ACCOMPLISHMENT-LEVELS.md` before changing onboarding, Profile or Today. They record the agreed product outcome and boundaries.

- The core loop is guided setup → saved context → one reviewable next action → follow-through. A screen or questionnaire is not complete merely because its buttons work.
- Preserve the user's answers and original words. Reuse saved information; do not require the same creative explanation again.
- Lead with one concrete recommendation. Keep alternatives available as secondary choices. Prefer established patterns and cite original sources; distinguish Flow adaptations from validated assessments.
- Profile completion uses the single versioned model in `src/profile-completion.ts`. Every required field must have a working consumer. Completion and action milestones are different.
- Test saved-state continuity, failed-save recovery, reload and the next screen. A bundle export is not a physical-device test. Run the relevant automated checks and typecheck; broaden only for changes or unresolved concerns.
- Keep changes on feature branches with PRs into `testing`. Production releases remain with the release collaborator unless the user explicitly changes that scope. Preserve existing records and use additive migrations.
- Never commit user recordings, transcripts, legal/medical details, credentials or pairing files. Use generic test fixtures.

User instructions take precedence over this document. Routine fixes within the authorized testing scope do not require another approval.
