# Decision drafts — test build 05

Flow turns an intake into a small set of decisions. The user should not have to classify notes, connect messages manually, or fill out a goal form before receiving something useful.

```
Speak / write
  └─ Keep original words and audio
      └─ Transcribe audio locally
          └─ Organize on the paired Mac mini
              ├─ Short faithful preview
              ├─ At most two AI directions (legacy drafts: up to three)
              │   └─ Explore one direction
              │       ├─ Choose this step → Today
              │       ├─ Start smaller → smaller step in Today
              │       └─ Not now → retained, no task created
              └─ Show original words / keep whole thought for later
```

One source, one processor endpoint, one draft record. Text bypasses audio decoding. A draft choice creates a task only on a tap. Acceptance IDs remain stable, deferred choices survive reopening, and accepted task titles retain the smaller choice. Reorganization preserves previously accepted and deferred branches. Identical full/smaller suggestions show only one action button. A reflective note can remain a note.

## Current AI boundary

Apple Foundation Models runs on the paired Mac, not inside Expo Go. It requires compatible hardware, macOS 26+, Apple Intelligence enabled and a downloaded/available model. This setup needs neither an AI API key nor a subscription login. It is an owner-only LAN test, not a ready multi-user backend.

The model proposes titles, branches and smaller alternatives. Each accepted branch needs an exact source excerpt. The short preview must itself occur in the source; otherwise a bounded original excerpt is shown. These checks reduce unsupported output but cannot prove a suggestion is appropriate. During testing, the small model sometimes added unnecessary branches or repeated the smaller action. Those are quality limits to improve, not completed intelligence. Invalid outputs fall back to the original rules-based draft; the original is preserved in every case.

No automatic emails, purchases, calendar writes or cross-note merging. Future work should earn its place through use: better suggestions first, then optional cross-note connections and voice follow-ups. Avoid expanding the number of decision screens.

## Bring-your-subscription research (2026-09-18)

OAuth is an authorization mechanism, not a guarantee of free inference or transferable subscription benefits.

- [OpenAI Codex authentication](https://learn.chatgpt.com/docs/auth) documents ChatGPT sign-in for Codex clients. It does not document a general subscription-backed inference integration for a standalone Flow app. [Apps authentication](https://developers.openai.com/plugins/build/auth) concerns ChatGPT accessing an app's MCP server, the opposite direction.
- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) explicitly restricts third parties offering Claude.ai login or routing subscription credentials on users' behalf. Its separate rules for hosting unmodified Claude Code do not authorize turning those credentials into a general app backend.
- [Gemini API OAuth](https://ai.google.dev/gemini-api/docs/oauth) exists for a Cloud project. [API billing](https://ai.google.dev/gemini-api/docs/billing) remains distinct from consumer subscription access.
- [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels) provides the local route implemented here. Future native iPhone support would require a native module/custom build and compatible Apple Intelligence devices; it is not supplied by Expo Go automatically.

Do not add pretend Connect ChatGPT/Claude controls or collect credentials without a documented supported integration. Any future cloud provider should fit behind the existing processor contract and disclose its costs.

## Validation

- Strict TypeScript and 47 automated tests passed, including decision deferral/advancement, smaller-step callback, no mandatory text fields, source preservation, invalid model grounding, and shared text/audio route fallback.
- iOS, Android and web exports passed.
- Real Mac mini text → local AI → validated draft completed in about 2.7 seconds; a generated M4A → Whisper → local AI → validated draft completed in about 3.1 seconds. These are short synthetic samples, not latency guarantees.
- Reflective test input produced ungrounded AI choices; the validator rejected them, retaining a basic no-task draft. This is evidence of the fallback working, not a claim that the model itself understood reflection perfectly.
- Browser check at phone width exercised a real generated tree and a smaller step reaching Today. Physical iPhone microphone capture and native Calendar permissions still require device testing.
