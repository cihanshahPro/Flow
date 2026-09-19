# Profile completion: product and implementation contract

## Outcome

A person can see how much of their starting profile is supplied, understand the next missing piece, fill it without inventing content, and return to an updated Profile. The information must change the app's behavior. Completion does not gate existing work.

The pattern follows the user's Hinge example: a persistent profile hub with explicit fields and a visible route to fill gaps. Hinge's official documentation describes profile requirements and editing at https://help.hinge.co/hc/en-us/articles/360011053094-How-do-I-edit-my-profile. It does not publish a percentage formula; Flow does not claim to copy one. A published example of a transparent weighted completion model is Upwork: https://support.upwork.com/hc/en-us/articles/211063188-How-do-I-create-a-100-complete-freelancer-profile.

## Version 1: five sections, 20% each

The denominator is fixed. Twenty questionnaire items should not outweigh every other part of a usable profile simply because there are more questions.

| Section            | Evidence of completion                                                                                    | What uses it                                                               | Missing-piece route                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Personality        | 20 valid Mini-IPIP responses; partial credit per response                                                 | Trait explanation and initial guidance recommendation                      | Resume first unanswered question; return to Profile                   |
| Life areas         | Six reviewed areas; each has a valid choice or Nothing current                                            | Saved interests and starter suggestions                                    | First unreviewed/deferred area; no repeat of finished areas           |
| Starting direction | Explicitly confirmed focus still present among interests, or explicit no-current-focus when none selected | Today's primary continuation                                               | Recommended saved interest + one confirmation; alternatives collapsed |
| Guidance style     | Explicit small-action or sequence preference                                                              | Draft presentation and guide                                               | Two concrete choices; save and return                                 |
| Usual time         | 10/30/60 minutes or varies                                                                                | Initial Today time filter; longer saved actions remain visible and labeled | One-tap choice; save and return                                       |

Formula: round(20 × sum(section fractions)), capped at 99 until all five sections are complete. Only then display 100. `src/profile-completion.ts` is the single source for percentage, checklist and next missing section. Nothing is hardcoded as a user's score.

`Later`, blank areas and unknown choices stay incomplete. `Nothing current` counts as reviewed. Inferred defaults do not earn confirmation credit. Existing explicitly chosen preferences do. Removing an active interest can make the focus section incomplete; original notes, drafts and tasks remain safe.

## Interaction contract

- Profile leads with percentage, five-section count, one missing item, why it helps, and one primary action.
- The full checklist is secondary. It displays saved facts and all missing sections without exposing a large form.
- Questions are closed choices wherever possible. Voice remains available for real-world details, not compulsory to finish basic preferences.
- Save must succeed before percentage changes or editor closes. Failure retains the editor and previous profile.
- Finishing a missing piece returns to Profile, not the full onboarding journey, map or recorder.
- At 100%, say “Your starting profile is ready.” This is setup completeness, not personality certainty or a guarantee of optimal productivity.
- Levels and action milestones remain separate. Completing tasks, granting microphone/calendar permission, or buying a subscription never changes this percentage.
- Per the user's build-10 decision, reaching 100% once unlocks [accomplishment levels](ACCOMPLISHMENT-LEVELS.md). Later profile edits never remove earned levels. The normal funnel includes explicit focus and usual-time choices so users can reach 100% without searching Profile for missing questions.
- Available time is a preference, not fabricated calendar availability. Varies asks for a session choice and clearly labels the initial short-option filter. An oversized saved task is not silently hidden or rewritten.

## Rules for future scope

A new profile field must name its consuming behavior, benefit, persistence rule, invalid/missing state and direct edit route. If no working behavior uses it, it is not a completion requirement.

Keep this version's denominator stable. New integrations or later features must not silently lower everyone's percentage. Any new completion version needs an explicit migration and explanation, or an optional extension outside this score.

Next priority remains accurate intake-to-action continuity: confirm essential dates, constraints and outcomes only when missing; ground AI suggestions in confirmed source; offer narrow follow-through choices. Do not add unrelated features to make the meter feel fuller.

## Acceptance checks

- Empty profile is 0%; valid fully completed profile is 100%; partial score is deterministic.
- Legacy selections/preferences retain earned credit; automatic focus does not become a user confirmation.
- Only actual saves increase completion; failed saves and cancel leave prior state intact.
- No interests can reach 100% without inventing a goal.
- A completed missing-piece route returns directly to Profile.
- Reload preserves percentage and preferred time; Today uses the saved preference.
- Existing actions remain available at every percentage.

Build 09 verification: 93 automated tests, strict TypeScript, platform exports and browser completion/reload checks. Physical iPhone behavior remains a separate device test.
