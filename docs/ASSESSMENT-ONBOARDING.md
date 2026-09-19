# Assessment onboarding — test build 06

The embedded instrument is the public-domain Mini-IPIP, not the proprietary Four Tendencies quiz. No Big Five-to-Four Tendencies conversion is implemented. Sources: https://www.ipip.ori.org/ and https://www.ipip.ori.org/MiniIPIPKey.htm (Donnellan et al., 2006).

All 20 items are required to score. Each trait averages its four keyed responses; negative items use 6-response. Emotional stability displays 6-neuroticism. Scores are raw 1–5 means, not norms, diagnoses, or fixed types. Answers remain local in the existing SQLite database; they are not transmitted to the transcription/AI server.

Flow's experimental adaptation suggests a step sequence when conscientiousness is at least 3.5, otherwise a smaller action. This cutoff is a product hypothesis, not an empirically validated recommendation. The user explicitly selects either preference. Draft review uses that preference for action emphasis and framing. Other traits are visible for reflection; they do not yet alter AI decisions. Full per-trait AI routing remains future work.

Six life-area rounds are Flow's simplified adaptation of the GTD Incompletion Trigger List (https://gettingthingsdone.com/wp-content/uploads/2022/06/GTD_Incompletion_Trigger_List.pdf). Each round selects one starting direction, Nothing current, or Later. They create a first-pass visual map, not tasks or deadlines. A branch opens the existing voice capture and processing pipeline with a contextual prompt. Further goals can be captured afterward. Branch-to-draft graph linkage and multiple interests per area are not implemented yet.

Progress saves before navigation. Resume, back, skip, retake, preference review and personality-answer removal are available. Existing notes, recordings and tasks are unaffected. Settings → My profile & life map reopens the funnel.

Validation: strict TypeScript; 52 passing automated tests including keyed scoring, invalid input, full funnel UI, save failure, voice/draft/calendar regressions; iOS/Android/web exports; browser assessment completion and reload/resume. Physical iPhone microphone behavior remains a user-device check; this change reuses the existing recorder.
