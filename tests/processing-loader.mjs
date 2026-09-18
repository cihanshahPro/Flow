const mocks = new URL("./processing-mocks.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/services/processing.ts")) {
    if (
      ["expo-file-system", "expo/fetch", "./storage", "./drafts"].includes(
        specifier,
      )
    )
      return { url: mocks, shortCircuit: true };
    if (specifier === "../drafts") return next("../drafts.ts", context);
  }
  return next(specifier, context);
}
