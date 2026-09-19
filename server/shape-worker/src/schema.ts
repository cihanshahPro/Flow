import { z } from "zod";

export const POINT_IDS = ["outcome", "people", "timing", "constraints", "motivation", "dependencies", "next"] as const;

export const requestSchema = z.object({
  version: z.literal(1),
  text: z.string(),
  locale: z.string().max(35).default("en-US"),
  tier: z.literal("free").default("free"),
  profile: z
    .object({
      type: z.enum(["Catalyst", "Steward", "Architect", "Coordinator"]).optional(),
      typeLine: z.string().max(400).optional(),
      focus: z.string().max(200).optional(),
      areas: z.array(z.string().max(120)).max(8).optional(),
      people: z.array(z.string().max(120)).max(8).optional(),
      timeWindow: z.string().max(120).optional(),
      obstacles: z.array(z.string().max(120)).max(5).optional(),
    })
    .nullable()
    .default(null),
});
export type ShapeRequest = z.infer<typeof requestSchema>;

const choice = z.object({
  label: z.string().max(200),
  action: z.string().max(400),
  smallAction: z.string().max(400),
  evidence: z.string().max(1000),
  reason: z.string().max(400),
});
export const shapeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  reply: z.string().max(400),
  question: z.string().max(400),
  points: z.array(z.object({ id: z.enum(POINT_IDS), evidence: z.string().min(1).max(1000) })).max(7),
  choices: z.array(choice).max(3),
});
export type Shape = z.infer<typeof shapeSchema>;

// JSON Schema handed to Anthropic as the forced tool's input_schema.
export const SHAPE_TOOL = {
  name: "submit_shape",
  description: "Submit the shaped draft of the person's thought.",
  input_schema: {
    type: "object",
    required: ["title", "summary", "reply", "question", "points", "choices"],
    properties: {
      title: { type: "string", description: "Main direction in at most 7 words" },
      summary: { type: "string", description: "A short contiguous excerpt of the most important original words, verbatim" },
      reply: { type: "string", description: "One short warm sentence naming the subject; no advice, no question; at most 20 words" },
      question: { type: "string", description: "One question, at most 16 words, about the most important missing point; empty if none" },
      points: {
        type: "array",
        maxItems: 7,
        items: {
          type: "object",
          required: ["id", "evidence"],
          properties: { id: { type: "string", enum: [...POINT_IDS] }, evidence: { type: "string" } },
        },
      },
      choices: {
        type: "array",
        maxItems: 2,
        items: {
          type: "object",
          required: ["label", "action", "smallAction", "evidence", "reason"],
          properties: {
            label: { type: "string", description: "2 to 6 words, starts with a verb" },
            action: { type: "string", description: "Verb plus object, at most 12 words" },
            smallAction: { type: "string", description: "A genuinely tiny start, at most 10 words" },
            evidence: { type: "string", description: "3 to 8 consecutive words copied exactly from the input" },
            reason: { type: "string", description: "One short sentence, no invented facts" },
          },
        },
      },
    },
  },
} as const;
