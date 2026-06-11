import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";

/**
 * Root-level parent for sheet-style routes. Sheets must sit outside the
 * native tab navigator — otherwise expo-router treats the `sheets` segment
 * as a tab (making it show up in the bottom bar) and iOS presents the route
 * as tab content rather than a modal with detents. Keeping sheets here means
 * `router.push("/sheets/...")` pushes above the tabs at the root stack, so
 * `presentation: 'formSheet'` + detents apply correctly for form sheets.
 * Routes can still override presentation when a full modal is a better fit.
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
        contentStyle: { backgroundColor: "#0a0a0a" },
      }}
    >
      <Stack.Screen
        name="org-switcher"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      />
      <Stack.Screen
        name="workspace-file"
        options={{
          presentation: "card",
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      />
      <Stack.Screen
        name="workspace-diff"
        options={{
          presentation: "card",
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      />
    </Stack>
  );
}
