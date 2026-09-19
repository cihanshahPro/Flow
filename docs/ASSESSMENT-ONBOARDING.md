# Assessment onboarding — test build 06

The embedded instrument is the public-domain Mini-IPIP, not the proprietary Four Tendencies quiz. No Big Five-to-Four Tendencies conversion is implemented. Sources: https://www.ipip.ori.org/ and https://www.ipip.ori.org/MiniIPIPKey.htm (Donnellan et al., 2006).

All 20 items are required to score. Each trait averages its four keyed responses; negative items use 6-response. Emotional stability displays 6-neuroticism. Scores are raw 1–5 means, not norms, diagnoses, or fixed types. Answers remain local in the existing SQLite database; they are not transmitted to the transcription/AI server.

Flow's experimental adaptation suggests a step sequence when conscientiousness is at least 3.5, otherwise a smaller action. This cutoff is a product hypothesis, not an empirically validated recommendation. The user explicitly selects either preference. Draft review uses that preference for action emphasis and framing. Other traits are visible for reflection; they do not yet alter AI decisions. Full per-trait AI routing remains future work.

Six life-area rounds are Flow's simplified adaptation of the GTD Incompletion Trigger List (https://gettingthingsdone.com/wp-content/uploads/2022/06/GTD_Incompletion_Trigger_List.pdf). Each round selects one starting direction, Nothing current, or Later. They create a first-pass visual map, not tasks or deadlines. A branch opens the existing voice capture and processing pipeline with a contextual prompt. Further goals can be captured afterward. Branch-to-draft graph linkage and multiple interests per area are not implemented yet.

Progress saves before navigation. Resume, back, skip, retake, preference review and personality-answer removal are available. Existing notes, recordings and tasks are unaffected. Settings → My profile & life map reopens the funnel.

Validation: strict TypeScript; 52 passing automated tests including keyed scoring, invalid input, full funnel UI, save failure, voice/draft/calendar regressions; iOS/Android/web exports; browser assessment completion and reload/resume. Physical iPhone microphone behavior remains a user-device check; this change reuses the existing recorder.

## Build 07: multiple selections and guided follow-through

Life areas now store multiple choices; legacy string selections remain readable without rewriting existing data. Tapping choices saves them immediately, and Continue advances only when the user is ready. Nothing current/Later explicitly replace that area's choices. All selected branches remain visible in an expandable map.

Results now explain every trait in plain language and recommend one starting routine. The response-range cutoffs (<2.5, 2.5–<3.5, >=3.5) are descriptive product ranges, not population norms or personality types. Mini-IPIP interpretation must not imply normed categories: https://ipip.ori.org/InterpretingIndividualIPIPScaleScores.htm. The user can override small-action versus sequence presentation.

The map leads with the first selected direction unless the user chooses another. This is explicitly not an urgency ranking. One obstacle question then leads to a specific starting plan and contextual recording prompt. Imagination changes concrete versus outcome-oriented prompts and obstacle choices; conscientiousness suggests presentation; other trait dimensions provide communication/routine suggestions in the expandable explanation. These mappings are Flow hypotheses, not validated prescriptions. No personality data is sent to the AI service.

The obstacle-to-action step borrows the established if-then planning idea discussed in WOOP (https://woopmylife.org/en/practice). It is a simplified Flow adaptation, not the full validated WOOP exercise. No calendar commitments or messages are created automatically.

Validation: 54 automated tests, strict TypeScript, full assessment → multiselect → map → obstacle → recording handoff; legacy selection compatibility and explicit preference precedence. Physical iPhone testing remains separate from export/browser checks.

## Build 08: persistent profile and setup-to-action continuity

The guided product plan is now in `GUIDED-PRODUCT-PLAN.md`. Profile has a permanent tab with factual assessment/area coverage, trait details, saved interests, effective guidance style, linked action status and milestones. Today uses one shared saved-state selector, including legacy and orphaned linked work, instead of a generic capture hero. Explicit new focus is distinguished from legacy focus so returning users resume saved work by default.

Optional direction metadata persists through original notes, transcription, shaped or fallback drafts, retries, refinement, reorganization and accepted tasks. It is not inserted into source text or sent as personality data to the AI backend. Suggested starter actions are visibly labeled suggestions, require acceptance, use stable IDs, and do not invent dates or contacts. Opening the recorder does not complete a milestone. The survey-complete flag is no longer the activation signal.

Validation: 77 automated tests, strict TypeScript, iOS/Android/web exports. Browser checks: existing profile loads, saved legacy action remains usable, explicit focus changes Today, starter acceptance survives reload, and completion updates Profile to a linked completed action. Phone microphone and native Calendar were covered by existing regression tests, not retested on a physical iPhone in this pass.
