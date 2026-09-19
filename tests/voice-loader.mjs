import ts from "typescript";
import { readFile } from "node:fs/promises";
const mocks = new URL("./voice-mocks.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (["react-native", "expo-audio", "expo-file-system"].includes(specifier))
    return { url: mocks, shortCircuit: true };
  if (
    ["../starters", "../journey", "../profile-completion"].includes(specifier)
  )
    return next(specifier + ".ts", context);
  if (["./ProfileCompletion", "./ProgressCard"].includes(specifier))
    return next(specifier + ".tsx", context);
  if (specifier === "../personality") return next("../personality.ts", context);
  if (specifier === "../recording-lifecycle")
    return next("../recording-lifecycle.ts", context);
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  }
  return next(url, context);
}
