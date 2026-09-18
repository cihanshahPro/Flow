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
