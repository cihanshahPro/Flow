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
  stage: "intro" | "assessment" | "results" | "areas" | "map";
  areaIndex: number;
  areas: Record<string, string>;
  presentation?: Presentation;
  completed?: boolean;
};
export const newProfile = (): Profile => ({
  version: 1,
  answers: [],
  stage: "intro",
  areaIndex: 0,
  areas: {},
});
