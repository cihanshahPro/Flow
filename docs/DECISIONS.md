# Decisions — one row each, never re-asked

| # | Question | Options | Owner | Answer | Date |
|---|---|---|---|---|---|
| D1 | Calendar titles sent to `/v1/plan`? | titles · busy ranges only | Cihan's side implements, Samil proposed | Busy ranges only; titles stay in `/v1/chat` for linked events | 2026-09-21 |
| D2 | May automatic calls (project steps) spend the free cloud quota? | yes · no | Cihan's side implements, Samil proposed | No — automatic calls run on-device only; user-started plan/chat use quota | 2026-09-21 |
| D3 | Thread meter "Getting to know this · %" and "What Flow got" cards — keep or drop? | keep · drop · keep meter only | Cihan | Keep both for 1.1; revisit with real users | 2026-09-21 |
| D4 | Who builds Siri "Tell Flow…", share extension, lock-screen widget, and when? | Kodavena · Cihan's side · split | both | After 1.1 is stable; Kodavena takes the native targets, Cihan's side ships the JS side (`flowthread://record?text=`, `writeWidgetSnapshot()`) | 2026-09-21 |
| D5 | Plan context cap 4,000 chars — busy weeks fall back to local | keep · raise | Cihan's side | Raise to 6,000 once D1 removes titles | 2026-09-21 |
| D6 | One repo | `cihanshahPro/Flow` · Samil's copy | Cihan | `cihanshahPro/Flow`; Samil pushes `kodavena/build9` there and archives his copy | 2026-09-21 |
| D7 | Onboarding order | test-first · value-first | Cihan | Value-first (Samil's), test by invitation later | 2026-09-20 |
| D8 | Personality layer in the path | in · out | Cihan | Out; same plain questions for everyone | 2026-09-20 |
| D9 | Real personal data in git | allowed · never | both | Never; invented fixtures of the same shape | 2026-09-21 |
