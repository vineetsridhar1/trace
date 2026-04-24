import { useLocalSearchParams } from "expo-router";
import { EmptyState, Sheet } from "@/components/design-system";
import { SessionTabSwitcherContent } from "@/components/sessions/SessionTabSwitcherContent";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function SessionTabsSheetScreen() {
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    sessionId?: string | string[];
  }>();
  const groupId = firstParam(params.groupId);
  const sessionId = firstParam(params.sessionId);

  return (
    <Sheet detents={["medium", "large"]}>
      {groupId && sessionId ? (
        <SessionTabSwitcherContent
          groupId={groupId}
          activeSessionId={sessionId}
        />
      ) : (
        <EmptyState
          icon="rectangle.on.rectangle"
          title="Missing tab context"
          subtitle="Reopen the tab switcher from a session page."
        />
      )}
    </Sheet>
  );
}
