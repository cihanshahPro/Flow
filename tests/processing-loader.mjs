const mocks = new URL("./processing-mocks.mjs", import.meta.url).href;
const MOCKED = [
  "expo-file-system",
  "expo/fetch",
  "./storage",
  "./drafts",
  "./profile",
  "./ai-state",
  "../../modules/flow-intelligence",
];
export async function resolve(specifier, context, next) {
  const parent = context.parentURL ?? "";
  if (parent.endsWith("/services/processing.ts") || parent.endsWith("/services/processors.ts")) {
    if (MOCKED.includes(specifier)) return { url: mocks, shortCircuit: true };
    if (["./processors"].includes(specifier)) return next(specifier + ".ts", context);
    if (["../drafts", "../flow-voice", "../thread", "../ai-policy", "../ai-quality", "../formula", "../intake"].includes(specifier))
      return next(specifier + ".ts", context);
  }
  return next(specifier, context);
}
