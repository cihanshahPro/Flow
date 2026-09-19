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

export const C = {
  paper: token("#F6F7FA", "#0E1320"),
  /** Cards and other raised surfaces. */
  card: token("#FFFFFF", "#1A2131"),
  ink: token("#142138", "#F1F4FA"),
  /** Dark hero surface (the Next card). White text always sits on it. */
  hero: token("#142138", "#26365A"),
  heroMuted: token("#B9C3DD", "#B9C3DD"),
  muted: token("#697386", "#A1AABC"),
  faint: token("#8D95A4", "#7B849A"),
  line: token("#E2E6ED", "#2B3345"),
  blue: token("#345BEE", "#5B7DF5"),
  blueSoft: token("#EDF0FF", "#1F2A4A"),
  blueLine: token("#D5DDFB", "#34426E"),
  lime: "#DFF586",
  /** Text on lime; stays dark in both modes. */
  onLime: "#142138",
  /** Text on the blue accent and hero surfaces; stays white in both modes. */
  white: "#FFFFFF",
  red: token("#B44343", "#F08080"),
  danger: token("#C0392B", "#F08080"),
  record: "#FF6B6B",
  flowBubble: token("#FFFFFF", "#1A2131"),
  youBubble: token("#345BEE", "#4C6FF0"),
};
