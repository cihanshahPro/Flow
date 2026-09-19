const mocks = new URL("./processing-mocks.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/services/processing.ts")) {
    if (
      ["expo-file-system", "expo/fetch", "./storage", "./drafts", "./profile"].includes(
        specifier,
      )
    )
      return { url: mocks, shortCircuit: true };
    if (["../drafts", "../flow-voice", "../thread"].includes(specifier))
      return next(specifier + ".ts", context);
  }
  return next(specifier, context);
}
