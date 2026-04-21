import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";

/**
 * Root-level parent for every form-sheet route. Sheets must sit outside the
 * native tab navigator — otherwise expo-router treats the `sheets` segment
 * as a tab (making it show up in the bottom bar) and iOS presents the route
 * as tab content rather than a modal with detents. Keeping sheets here means
 * `router.push("/sheets/...")` pushes above the tabs at the root stack, so
 * `presentation: 'formSheet'` + detents apply correctly.
 *
 * `presentation: 'formSheet'` must be declared at route-registration time —
 * the `Sheet` primitive (ticket 12) only toggles `sheetAllowedDetents`,
 * `sheetGrabberVisible`, etc. dynamically via `setOptions` after mount.
 */
export default function SheetsLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Stack
      screenOptions={{
        presentation: "formSheet",
        headerShown: false,
      }}
    />
  );
}
