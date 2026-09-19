const mocks = new URL("./progress-mocks.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (
    context.parentURL?.endsWith("/services/progress.ts") &&
    ["react-native", "./storage"].includes(specifier)
  ) {
    return { url: mocks, shortCircuit: true };
  }
  return next(specifier, context);
}
