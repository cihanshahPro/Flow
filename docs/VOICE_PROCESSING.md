# Local voice processing — testing only

The default route is Record → Stop → Save on phone → Transcribe on Mac mini → Organize locally → Open draft. No Library detour or second approval is needed for a new recording. Old recordings have a Transcribe & shape action. Originals remain on the phone; a failed processor call never deletes or relabels them as failed recordings.

Transcription uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp) with the multilingual base model. Draft suggestions use Apple Foundation Models on the paired Mac mini, with bounded rules as a labeled fallback. Nothing is scheduled automatically.

## Run the processor

Install ffmpeg and whisper.cpp from Homebrew. Download the base model following the upstream instructions. Use Node 22 or newer. Put these values in a local ignored `.env.processor` file:

```
FLOW_PROCESSOR_TOKEN=<random private testing token, at least 32 characters>
FLOW_PROCESSOR_HOST=<Mac mini LAN address>
FLOW_PROCESSOR_PORT=8084
FLOW_WHISPER_MODEL="<absolute path to ggml-base.bin>"
FLOW_PROCESSING_TMP="<private temporary directory on the SSD>"
FLOW_SHAPER_BIN="<absolute path to compiled shape-thought executable>"
```

On a compatible Apple Intelligence-enabled Mac running macOS 26+, compile `swiftc -parse-as-library scripts/shape-thought.swift -o /path/to/shape-thought`. The model must report available; unsupported or disabled devices retain the fallback.

Run `node --env-file=.env.processor scripts/voice-server.mjs`. Set `EXPO_PUBLIC_PROCESSOR_URL` to the LAN URL and `EXPO_PUBLIC_PROCESSOR_TOKEN` to the matching token in an ignored `.env.local` on the Expo host. Restart Expo after changing these variables. Do not paste either real configuration file into GitHub.

This shared testing token is embedded in the Expo development bundle. It is suitable only for the owner's paired local testing setup, not public hosting or multi-user authorization. Before external beta release, replace it with per-user authentication and HTTPS; never expose this server to the public Internet. Phone and Mini must remain on the same trusted LAN for this test.

Text and audio both use the same authenticated POST `/process` route. Audio uses a binary body; text uses JSON `{ "text": "..." }`. Optional `FLOW_PROCESSOR_WEB_ORIGIN=http://localhost:8083` permits that exact local web testing origin; authentication still applies. This is not needed for native Expo Go.

## Storage and failures

The server accepts one upload at a time (32 MB maximum), limits audio decoding to ten minutes, and removes temporary input/WAV/transcript files after each job. It logs only request IDs, stages, sizes, and elapsed time, not recording text or tokens. Original recording and transcript remain in phone storage. The Whisper model lives on the SSD. Apple manages the system language model. Long text is processed in bounded chunks; notes exceeding 20,000 characters are rejected rather than silently truncated. Local AI is best effort: grounding checks are not a guarantee of semantic accuracy.

Transcription is saved before draft generation. Retrying after draft-save failure reuses the stored transcript. Reprocessing a completed note reopens its existing draft. After an app restart or network failure, open the saved recording and retry with the same button. Background uploads/resumable cloud jobs are not implemented.

## Validation

A generated spoken M4A sample went through the real running server, ffmpeg and Whisper: it returned the expected call/email transcript and two draft actions in approximately 3.1 seconds including Apple local organization in build 05 on the test Mac mini. This proves real audio-file processing, not physical iPhone microphone behavior. Automated tests cover pairing rejection, empty/no-speech input, worker failure recovery, concurrency, ordered transcript/draft persistence, duplicate prevention and offline preservation.
