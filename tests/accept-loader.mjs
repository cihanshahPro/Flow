const mocks = new URL("./accept-mocks.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/services/drafts.ts")) {
    if (["react-native", "./storage"].includes(specifier))
      return { url: mocks, shortCircuit: true };
    if (["../drafts", "../model"].includes(specifier))
      return next(specifier + ".ts", context);
  }
  return next(specifier, context);
}
