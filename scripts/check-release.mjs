import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Plan D: the LAN processor URL/token are development-only. They must never be
// set for a store build, and must never appear in an exported bundle.
const LAN_KEYS = ["EXPO_PUBLIC_PROCESSOR_URL", "EXPO_PUBLIC_PROCESSOR_TOKEN"];
const bundleArg = process.argv.indexOf("--bundle");
if (bundleArg > 0) {
  const dir = process.argv[bundleArg + 1];
  const secrets = LAN_KEYS.map((k) => process.env[k]).filter((v) => v && v.length >= 6);
  const needles = [...LAN_KEYS, ...secrets];
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const f = join(d, name);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.(js|hbc|json|map)$/.test(f)) files.push(f);
    }
  };
  walk(dir);
  const leaks = files.flatMap((f) => {
    const text = readFileSync(f, "latin1");
    return needles.filter((n) => text.includes(n)).map((n) => `${f}: ${n.startsWith("EXPO_") ? n : "<secret value>"}`);
  });
  if (!files.length || leaks.length) {
    console.error(leaks.length ? "LAN processor details leaked into the bundle:\n" + leaks.join("\n") : "No bundle files found in " + dir);
    process.exit(1);
  }
  console.log(`Bundle clean: ${files.length} files, no LAN processor URL or token.`);
  process.exit(0);
}
if (process.env.EAS_BUILD_PROFILE !== "development") {
  const fromEnv = LAN_KEYS.filter((k) => process.env[k]);
  const fromFiles = [".env", ".env.local", ".env.production", ".env.production.local"]
    .filter((f) => existsSync(f))
    .flatMap((f) =>
      LAN_KEYS.filter((k) => new RegExp(`^\\s*${k}\\s*=\\s*\\S`, "m").test(readFileSync(f, "utf8"))).map((k) => `${f}:${k}`),
    );
  if (fromEnv.length || fromFiles.length) {
    console.error(
      "Release builds must not carry the development LAN processor: unset " + [...fromEnv, ...fromFiles].join(", "),
    );
    process.exit(1);
  }
}
const id = process.env.APP_BUNDLE_ID;
const project = process.env.EAS_PROJECT_ID;
if (
  !id ||
  id.startsWith("com.example.") ||
  !/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(id)
) {
  console.error(
    "Set APP_BUNDLE_ID to the app identifier registered in your own Apple/Google account.",
  );
  process.exit(1);
}
if (
  !project ||
  !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(project)
) {
  console.error(
    "Link your own Expo project, then set EAS_PROJECT_ID to its UUID.",
  );
  process.exit(1);
}
console.log(
  "Project identifiers are configured. Signing, store metadata, device tests, and review still require completion.",
);
