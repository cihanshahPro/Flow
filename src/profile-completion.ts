import { AREAS, ITEMS, type Profile } from "./personality.ts";

export type CompletionSectionId =
  "assessment" | "areas" | "focus" | "guidance" | "capacity";

export type CompletionSection = {
  id: CompletionSectionId;
  title: string;
  why: string;
  detail: string;
  complete: boolean;
  fraction: number;
};

export type ProfileCompletion = {
  version: 1;
  percent: number;
  completedCount: number;
  totalCount: 5;
  sections: CompletionSection[];
  next: CompletionSection | undefined;
};

// Completion measures saved setup information, never personality accuracy or
// productivity. Each of these five sections contributes exactly 20 percent.
export function profileCompletion(profile: Profile): ProfileCompletion {
  const answers = Array.isArray(profile.answers) ? profile.answers : [];
  const answered = answers
    .slice(0, ITEMS.length)
    .filter(
      (answer) => Number.isInteger(answer) && answer >= 1 && answer <= 5,
    ).length;
  const assessmentComplete =
    answers.length === ITEMS.length && answered === ITEMS.length;
  const areas = profile.areas ?? {};
  const directions: string[] = [];
  let reviewed = 0;
  for (const area of AREAS) {
    const value = areas[area.id];
    const entries = Array.isArray(value) ? value : [value];
    const choices = area.choices.filter((choice) => entries.includes(choice));
    directions.push(...choices.map((choice) => `${area.title}: ${choice}`));
    if (choices.length > 0 || entries.includes("Nothing current")) reviewed++;
  }
  const explicitFocus =
    profile.focusExplicit === true &&
    typeof profile.focus === "string" &&
    directions.includes(profile.focus);
  const noFocus = profile.focusNone === true && directions.length === 0;
  const focusComplete = explicitFocus || noFocus;
  const guidanceComplete =
    profile.presentation === "small" || profile.presentation === "sequence";
  const capacityComplete =
    profile.preferredMinutes === 10 ||
    profile.preferredMinutes === 30 ||
    profile.preferredMinutes === 60 ||
    profile.preferredMinutes === "varies";
  const sections: CompletionSection[] = [
    {
      id: "assessment",
      title: "Your personality",
      why: "Your answers help Flow suggest a starting style you can adjust.",
      detail: `${answered} of ${ITEMS.length} questions answered`,
      complete: assessmentComplete,
      fraction: answered / ITEMS.length,
    },
    {
      id: "areas",
      title: "Your life areas",
      why: "Review each area so Flow knows what matters and what can stay quiet.",
      detail: `${reviewed} of ${AREAS.length} areas reviewed`,
      complete: reviewed === AREAS.length,
      fraction: reviewed / AREAS.length,
    },
    {
      id: "focus",
      title: "Your starting direction",
      why: "One confirmed direction keeps the next step focused.",
      detail: explicitFocus
        ? profile.focus!
        : noFocus
          ? "No current focus confirmed"
          : directions.length > 0
            ? "Choose one of your saved interests to start"
            : "Confirm whether you have a current focus",
      complete: focusComplete,
      fraction: focusComplete ? 1 : 0,
    },
    {
      id: "guidance",
      title: "Your guidance style",
      why: "Confirm whether smaller actions or a step sequence feels more useful.",
      detail: guidanceComplete
        ? profile.presentation === "small"
          ? "One small action at a time"
          : "A visible sequence of steps"
        : "Confirm how you want Flow to guide you",
      complete: guidanceComplete,
      fraction: guidanceComplete ? 1 : 0,
    },
    {
      id: "capacity",
      title: "Your usual time",
      why: "A realistic time window helps Flow keep suggestions manageable.",
      detail: capacityComplete
        ? profile.preferredMinutes === "varies"
          ? "My available time varies"
          : `About ${profile.preferredMinutes} minutes`
        : "Choose a typical window or say it varies",
      complete: capacityComplete,
      fraction: capacityComplete ? 1 : 0,
    },
  ];
  const completedCount = sections.filter((section) => section.complete).length;
  const rawPercent = Math.round(
    sections.reduce((sum, section) => sum + section.fraction, 0) * 20,
  );
  return {
    version: 1,
    percent: Math.max(0, Math.min(completedCount === 5 ? 100 : 99, rawPercent)),
    completedCount,
    totalCount: 5,
    sections,
    next: sections.find((section) => !section.complete),
  };
}
