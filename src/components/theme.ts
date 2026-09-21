import * as RN from "react-native";

/**
 * Flow's palette. One primary, one accent, calm neutrals. On iOS each token
 * is a dynamic colour that follows the system light/dark setting; elsewhere
 * (and in tests) it is the light value.
 */
function token(light: string, dark: string = light): string {
  const dynamic = (RN as unknown as { DynamicColorIOS?: (c: { light: string; dark: string }) => string }).DynamicColorIOS;
  const os = (RN as unknown as { Platform?: { OS?: string } }).Platform?.OS;
  return os === "ios" && typeof dynamic === "function" && light !== dark ? dynamic({ light, dark }) : light;
}

/**
 * The Things-3 language: white paper, one accent, three greys, hairline
 * dividers. Light only — the app is paper. Old names are kept as aliases so
 * every screen renders while it is re-laid on the new primitives.
 */
export const C = {
  paper: "#FFFFFF",
  card: "#FFFFFF",
  tint: "#F5F6F8",
  ink: "#111827",
  ink2: "#6B7280",
  ink3: "#9CA3AF",
  hair: "#E5E7EB",
  accent: "#2F6BFF",
  accentBg: "#EAF0FF",
  violet: "#8B5CF6",
  violetBg: "#F1EDFF",
  amber: "#C77D1E",
  amberBg: "#FFF4E3",
  green: "#16A34A",
  greenBg: "#E7F7EC",
  red: "#DC2626",
  redBg: "#FEE2E2",
  white: "#FFFFFF",
  record: "#FF6B6B",
  // aliases
  hero: "#111827",
  heroMuted: "#9CA3AF",
  muted: "#6B7280",
  faint: "#9CA3AF",
  line: "#E5E7EB",
  blue: "#2F6BFF",
  blueSoft: "#EAF0FF",
  blueLine: "#D5DDFB",
  lime: "#DFF586",
  onLime: "#111827",
  danger: "#DC2626",
  flowBubble: "#F5F6F8",
  youBubble: "#2F6BFF",
};

/** Type scale: three sizes, that's it. */
export const T = {
  title: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.6, color: C.ink, lineHeight: 34 },
  subtitle: { fontSize: 12, fontWeight: "600" as const, color: C.ink2, marginTop: 2 },
  section: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" as const, color: C.ink3 },
  row: { fontSize: 15, fontWeight: "500" as const, color: C.ink, lineHeight: 20 },
  sub: { fontSize: 12, fontWeight: "500" as const, color: C.ink2 },
  when: { fontSize: 12, fontWeight: "600" as const, color: C.ink2 },
};
