import { Stack } from "expo-router";

/**
 * Parent layout for every form-sheet route. `presentation: 'formSheet'`
 * must be declared at route-registration time — the `Sheet` primitive
 * (ticket 12) can only toggle `sheetAllowedDetents`, `sheetGrabberVisible`,
 * etc. dynamically via `setOptions` after mount. Sheet route files for
 * subsequent tickets (e.g. `sheets/org-switcher.tsx` in ticket 18) go
 * inside this segment.
 */
export default function SheetsLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: "formSheet",
        headerShown: false,
      }}
    />
  );
}
