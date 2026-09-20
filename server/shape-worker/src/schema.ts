import { z } from "zod";

export const POINT_IDS = ["outcome", "people", "timing", "constraints", "motivation", "dependencies", "next"] as const;

export const requestSchema = z.object({
  version: z.literal(1),
  text: z.string(),
  locale: z.string().max(35).default("en-US"),
  tier: z.literal("free").default("free"),
  thread: z
    .object({
      title: z.string().max(200),
      points: z.array(z.object({ id: z.enum(POINT_IDS), evidence: z.string().max(400) })).max(7),
      recent: z.array(z.object({ from: z.enum(["flow", "you"]), text: z.string().max(1200) })).max(8),
      openQuestion: z.string().max(400).optional(),
      openMove: z.string().max(600).optional(),
      askNext: z.string().max(200).optional(),
      script: z.string().max(2500).optional(),
      percent: z.number().min(0).max(100).optional(),
      otherThreads: z.array(z.string().max(200)).max(6).optional(),
    })
    .optional(),
  profile: z
    .object({
      type: z.enum(["Catalyst", "Steward", "Architect", "Operator", "Coordinator"]).optional(),
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
  branches: z.array(z.object({ title: z.string().trim().min(1).max(120), evidence: z.string().trim().min(1).max(600) })).max(8).default([]),
});
export type Shape = z.infer<typeof shapeSchema>;

// JSON Schema handed to Anthropic as the forced tool's input_schema.
export const SHAPE_TOOL = {
  name: "submit_shape",
  description: "Submit the shaped draft of the person's thought.",
  input_schema: {
    type: "object",
    required: ["title", "summary", "reply", "question", "points", "choices", "branches"],
    properties: {
      title: { type: "string", description: "Main direction in at most 7 words" },
      summary: { type: "string", description: "A short contiguous excerpt of the most important original words, verbatim" },
      reply: { type: "string", description: "The next turn of the conversation: one to three plain sentences responding to what the person just said; answers their question if they asked one; at most 60 words" },
      branches: {
        type: "array",
        maxItems: 8,
        description: "Every distinct subject in the person's words on a first dump (INTAKE); inside a thread, only subjects clearly separate from it; empty when everything is one subject",
        items: {
          type: "object",
          required: ["title", "evidence"],
          properties: { title: { type: "string", description: "2 to 6 words" }, evidence: { type: "string", description: "3 to 10 consecutive words copied exactly from the input" } },
        },
      },
      question: { type: "string", description: "Empty string whenever THREAD SO FAR is given (the app asks the script). Otherwise one question, at most 16 words, about the most important missing point; empty if none" },
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
