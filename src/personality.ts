// Public-domain Mini-IPIP; exact item wording and scoring key: https://www.ipip.ori.org/MiniIPIPKey.htm
export type Trait =
  | "Extraversion"
  | "Agreeableness"
  | "Conscientiousness"
  | "Neuroticism"
  | "Imagination";
export const ITEMS: { text: string; trait: Trait; reverse: boolean }[] = [
  ["Am the life of the party.", "Extraversion", false],
  ["Sympathize with others’ feelings.", "Agreeableness", false],
  ["Get chores done right away.", "Conscientiousness", false],
  ["Have frequent mood swings.", "Neuroticism", false],
  ["Have a vivid imagination.", "Imagination", false],
  ["Don’t talk a lot.", "Extraversion", true],
  ["Am not interested in other people’s problems.", "Agreeableness", true],
  [
    "Often forget to put things back in their proper place.",
    "Conscientiousness",
    true,
  ],
  ["Am relaxed most of the time.", "Neuroticism", true],
  ["Am not interested in abstract ideas.", "Imagination", true],
  ["Talk to a lot of different people at parties.", "Extraversion", false],
  ["Feel others’ emotions.", "Agreeableness", false],
  ["Like order.", "Conscientiousness", false],
  ["Get upset easily.", "Neuroticism", false],
  ["Have difficulty understanding abstract ideas.", "Imagination", true],
  ["Keep in the background.", "Extraversion", true],
  ["Am not really interested in others.", "Agreeableness", true],
  ["Make a mess of things.", "Conscientiousness", true],
  ["Seldom feel blue.", "Neuroticism", true],
  ["Do not have a good imagination.", "Imagination", true],
].map(([text, trait, reverse]) => ({
  text: text as string,
  trait: trait as Trait,
  reverse: reverse as boolean,
}));
export function scoreAnswers(answers: number[]): Record<Trait, number> {
  if (
    answers.length !== 20 ||
    answers.some((x) => !Number.isInteger(x) || x < 1 || x > 5)
  )
    throw new Error("Complete all 20 questions before scoring.");
  const scores = {
    Extraversion: 0,
    Agreeableness: 0,
    Conscientiousness: 0,
    Neuroticism: 0,
    Imagination: 0,
  };
  ITEMS.forEach(
    (item, i) =>
      (scores[item.trait] += (item.reverse ? 6 - answers[i] : answers[i]) / 4),
  );
  return scores;
}
export type Presentation = "small" | "sequence";
export type WorkingType = {
  code: string;
  name: string;
  description: string;
};
const workingTypes: Record<string, WorkingType> = {
  ISTJ: { code: "ISTJ", name: "The Steward", description: "You work best with a clear order, concrete context, and a quiet finish line." },
  ISFJ: { code: "ISFJ", name: "The Supporter", description: "You work best when commitments and people are visible, with a calm next step." },
  INFJ: { code: "INFJ", name: "The Guide", description: "You work best when the deeper reason is clear and the path stays focused." },
  INTJ: { code: "INTJ", name: "The Architect", description: "You work best when Flow maps the system and removes noise from the route." },
  ISTP: { code: "ISTP", name: "The Troubleshooter", description: "You work best by seeing the real problem and testing one practical move." },
  ISFP: { code: "ISFP", name: "The Maker", description: "You work best with a small, tangible move that respects your energy." },
  INFP: { code: "INFP", name: "The Values Builder", description: "You work best when the outcome feels meaningful and the plan leaves room to breathe." },
  INTP: { code: "INTP", name: "The Explorer", description: "You work best when Flow captures the ideas and asks you to choose one thread." },
  ESTP: { code: "ESTP", name: "The Operator", description: "You work best with a direct route, immediate feedback, and little ceremony." },
  ESFP: { code: "ESFP", name: "The Energizer", description: "You work best with visible momentum and a next move that feels alive." },
  ENFP: { code: "ENFP", name: "The Catalyst", description: "You work best when Flow contains the many ideas and keeps one meaningful thread in view." },
  ENTP: { code: "ENTP", name: "The Inventor", description: "You work best when Flow stores possibilities and makes the next experiment obvious." },
  ESTJ: { code: "ESTJ", name: "The Organizer", description: "You work best with a clear outcome, ownership, and a visible sequence." },
  ESFJ: { code: "ESFJ", name: "The Coordinator", description: "You work best when people, promises, and timing are held together for you." },
  ENFJ: { code: "ENFJ", name: "The Mentor", description: "You work best when the human outcome is clear and the route protects your focus." },
  ENTJ: { code: "ENTJ", name: "The Director", description: "You work best when Flow turns a large aim into a decisive, ordered route." },
};
export function workingType(answers: number[]): WorkingType | null {
  if (answers.length !== 20) return null;
  const scores = scoreAnswers(answers);
  const code = `${scores.Extraversion >= 3 ? "E" : "I"}${scores.Imagination >= 3 ? "N" : "S"}${scores.Agreeableness >= 3 ? "F" : "T"}${scores.Conscientiousness >= 3 ? "J" : "P"}`;
  return workingTypes[code];
}
export function suggestedPresentation(answers: number[]): Presentation {
  return scoreAnswers(answers).Conscientiousness >= 3.5 ? "sequence" : "small";
}
export const AREAS = [
  {
    id: "work",
    title: "Work & making",
    prompt: "Is there a project you want to move forward?",
    choices: ["Build something", "Find work or clients", "Finish a project"],
  },
  {
    id: "people",
    title: "People & replies",
    prompt: "Is someone waiting on you—or are you waiting on someone?",
    choices: ["Reply to someone", "Follow up", "Make plans"],
  },
  {
    id: "admin",
    title: "Money & paperwork",
    prompt: "Is any personal admin waiting for your attention?",
    choices: ["Bills or taxes", "Forms or appointments", "A case or claim"],
  },
  {
    id: "home",
    title: "Home & daily life",
    prompt: "Is there something practical to take care of?",
    choices: ["Home or repairs", "Shopping or errands", "Transport"],
  },
  {
    id: "health",
    title: "Health & personal time",
    prompt: "What would you like to make space for?",
    choices: ["Movement or exercise", "Health follow-up", "Rest or a hobby"],
  },
  {
    id: "dates",
    title: "Dates & possibilities",
    prompt: "Is anything coming up, or worth exploring later?",
    choices: ["An upcoming event", "A deadline", "An idea for later"],
  },
];
export type Profile = {
  version: 1;
  answers: number[];
  stage:
    | "intro"
    | "assessment"
    | "results"
    | "areas"
    | "map"
    | "preferences"
    | "capacity"
    | "guide";
  areaIndex: number;
  areas: Record<string, string | string[]>;
  focus?: string;
  focusExplicit?: boolean;
  focusNone?: boolean;
  preferredMinutes?: 10 | 30 | 60 | "varies";
  obstacle?: string;
  presentation?: Presentation;
  completed?: boolean;
  // The chosen working step stays attached to the user’s route across reloads.
  activeTaskId?: string;
  /** Which onboarding funnel this profile has been through. Build 12's quiz → reveal → plate is 2. */
  funnelVersion?: number;
};
export const FUNNEL_VERSION = 2;
export const newProfile = (): Profile => ({
  version: 1,
  answers: [],
  stage: "intro",
  areaIndex: 0,
  areas: {},
});

// Accept build-06 string values without a destructive migration.
export function areaSelections(value: string | string[] | undefined): string[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(entries.filter((x) => x !== "Nothing current" && x !== "Later")),
  ];
}
export function toggleArea(
  profile: Profile,
  areaId: string,
  choice: string,
): Profile {
  const selected = areaSelections(profile.areas[areaId]);
  return {
    ...profile,
    areas: {
      ...profile.areas,
      [areaId]: selected.includes(choice)
        ? selected.filter((x) => x !== choice)
        : [...selected, choice],
    },
  };
}
export function productivityGuide(
  answers: number[],
  preference?: Presentation,
) {
  const scores = answers.length === 20 ? scoreAnswers(answers) : null;
  const presentation =
    preference ??
    (scores && scores.Conscientiousness >= 3.5 ? "sequence" : "small");
  const descriptions: Record<Trait, [string, string, string]> = {
    Extraversion: [
      "You describe a quieter social style.",
      "You describe a mix of social and quiet tendencies.",
      "You describe an outgoing social style.",
    ],
    Agreeableness: [
      "Your answers lean toward interpersonal independence.",
      "Your answers mix independence and concern for others.",
      "Your answers emphasize concern for others.",
    ],
    Conscientiousness: [
      "Your answers show less consistency with order and immediate follow-through.",
      "Your answers mix structure and flexibility.",
      "Your answers emphasize order and follow-through.",
    ],
    Neuroticism: [
      "You report relative emotional steadiness.",
      "Your answers describe a mix of calm and emotional ups and downs.",
      "You report more emotional ups and downs.",
    ],
    Imagination: [
      "Your answers lean toward concrete rather than abstract thinking.",
      "Your answers mix concrete and imaginative thinking.",
      "Your answers emphasize imagination and abstract thinking.",
    ],
  };
  const traits = scores
    ? (Object.entries(scores) as [Trait, number][]).map(([trait, value]) => ({
        trait,
        description:
          descriptions[trait][value < 2.5 ? 0 : value >= 3.5 ? 2 : 1],
        value,
      }))
    : [];
  const type = workingType(answers);
  return {
    presentation,
    type,
    title:
      presentation === "small"
        ? "One small win, then the next."
        : "A clear sequence, one step at a time.",
    reason: !scores
      ? "Start with a manageable action and adjust after trying it."
      : presentation === "small"
        ? "Keep the starting effort low. Capture the details, choose one small action, and finish that before opening another direction."
        : "Make the route visible. Capture the details, review the steps, and carry out the first one before moving on.",
    traits,
    voicePrompt:
      scores && scores.Imagination >= 3.5
        ? "Describe one result you want and what is stopping you. Keep other ideas for a separate capture."
        : "Say what needs doing, what is already done, and the next practical step.",
    tips: scores
      ? [
          scores.Extraversion >= 3.5
            ? "Try explaining your next step aloud before starting."
            : "Start with a quiet, private check-in.",
          scores.Agreeableness >= 3.5
            ? "Separate what you want to do from promises you have made to others."
            : "Name the outcome that makes this worth your effort.",
          scores.Neuroticism >= 3.5
            ? "Keep today’s focus on one manageable action; the rest stays saved."
            : "Finish the selected action before adding another.",
        ]
      : ["Keep everything else saved while you work on one thing."],
    obstacles:
      scores && scores.Imagination >= 3.5
        ? [
            "Too many directions",
            "The task feels too big",
            "Nothing is blocking me",
          ]
        : [
            "The task feels too big",
            "I need more clarity",
            "Nothing is blocking me",
          ],
  };
}
export function obstaclePlan(obstacle: string, presentation: Presentation) {
  if (obstacle === "Too many directions")
    return "If another idea pulls you away, save it for later and return to this one result.";
  if (obstacle === "The task feels too big")
    return "If starting feels too big, choose the smallest action you can do in five minutes.";
  if (obstacle === "I need more clarity")
    return "If the next step is unclear, identify one missing fact before making a plan.";
  return presentation === "small"
    ? "Start with one five-minute action. Review after you finish."
    : "Follow the first step in your draft, then review the next one.";
}
