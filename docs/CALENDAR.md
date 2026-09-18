# Apple Calendar release handoff

On iPhone, the first save asks for Calendar access and a writable calendar. The choice is remembered. Saving carries the title, explicit scheduled date/time and time zone, duration, location, meeting URL, contact name, phone, email, original notes, deadline and follow-up context. Contact details are notes, not invitations: no email is sent. A note-to-action conversion copies only literal contact details found in the note; it does not use AI or invent a schedule.

The alert defaults to 15 minutes before. Choices include no alert, at start, 5/15/30 minutes, 1 hour, or 1 day before. Apple Calendar delivers alerts subject to device notification/Focus settings. Past alerts cannot be promised. Deadline and follow-up dates in notes do not create separate events.

Each action keeps its event ID locally. Repeated saves leave unchanged events alone or update the same event after task edits. There is no automatic or two-way sync. Saving edited app details replaces the linked event details. If a save is interrupted, a persisted intent and reference marker support recovery; uncertain outcomes block blind retries. If an event is deleted externally, review Calendar before explicitly resetting its link. Reset does not delete an Apple event and can lead to a duplicate if one remains.

New tasks retain their device time zone. Legacy tasks use the device zone until edited. Invalid dates and ambiguous/nonexistent daylight-saving times are rejected. Android retains the system event editor and requires checking its saved event and alert.

## Required iPhone acceptance before release

Record device, iOS and build version. A JavaScript bundle is not a native-device test. Use a development/signed build to verify this app's permission description; Expo Go uses its own host permissions.

- Deny permission: clear guidance, no event. Enable access and retry successfully.
- Cancel the calendar picker: no event. Choose a writable calendar; verify remembered choice and Settings change.
- Save a future task with every contact field, notes, URL, location and duration. Inspect the actual Apple event and its alert. No invitation should be sent.
- Verify no alert, at-start, and 15-minute settings. Verify actual alert delivery with Calendar notifications enabled.
- Save twice: one event. Edit time/contact/alert and save: same event updated. Changing the preferred calendar should affect new events only.
- Confirm time zone and date across travel/daylight-saving boundaries. Reject nonexistent or repeated local times.
- Interrupt a save and retry: recover the linked event or show a review-required error, without a blind duplicate.
- Delete the linked event externally: get an error; inspect Calendar before manual link reset and a new save.
- Upgrade an existing installation: tasks, notes and recordings remain available.

The release owner handles native signing, installation, device acceptance and App Store/TestFlight submission. This change does not connect web data, add Apple Reminders access, or add a transcription/AI backend.
