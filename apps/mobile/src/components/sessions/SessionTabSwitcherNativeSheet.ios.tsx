import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { BottomSheet, Button, Host, List, Section, Text, VStack } from "@expo/ui/swift-ui";
import { createModifier } from "@expo/ui/swift-ui/modifiers";
import { useEntityField } from "@trace/client-core";
import type { SessionStatus } from "@trace/gql";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";
import { createAgentTab } from "@/lib/createQuickSession";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import type { SessionTabSwitcherSheetProps } from "./SessionTabSwitcherSheetBase";

export function SessionTabSwitcherNativeSheet({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const { loading, error } = useEnsureSessionGroupDetail(groupId);
  const groupName = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const activeSessionOptimistic = useEntityField("sessions", activeSessionId, "_optimistic") as
    | boolean
    | undefined;
  const sessionIds = useSessionGroupSessionIds(groupId);
  const [creating, setCreating] = useState(false);

  const listModifiers = useMemo(() => [createModifier("listStyle", { style: "insetGrouped" })], []);

  const navigateToSession = useCallback(
    (sessionGroupId: string, targetId: string, pane: "session" | "terminal" = "session") => {
      onClose();
      if (targetId === activeSessionId && pane === activePane) return;
      useMobileUIStore.getState().setOverlaySessionId(targetId);
      const targetHref =
        pane === "session"
          ? (`/sessions/${sessionGroupId}/${targetId}` as never)
          : (`/sessions/${sessionGroupId}/${targetId}?pane=${pane}` as never);
      router.replace(targetHref);
    },
    [activePane, activeSessionId, onClose, router],
  );

  const handleCreateAgentTab = useCallback(async () => {
    if (creating || activeSessionOptimistic) return;
    setCreating(true);
    try {
      await createAgentTab(activeSessionId, { navigate: navigateToSession });
    } finally {
      setCreating(false);
    }
  }, [activeSessionId, activeSessionOptimistic, creating, navigateToSession]);

  const headerSubtitle = useMemo(() => {
    const count = sessionIds.length;
    if (count === 0) return "No agent tabs loaded yet.";
    return count === 1 ? "1 open tab in this workspace." : `${count} open tabs in this workspace.`;
  }, [sessionIds.length]);

  return (
    <Host colorScheme={theme.scheme === "dark" ? "dark" : "light"} style={{ flex: 1 }}>
      <BottomSheet
        isOpened={open}
        onIsOpenedChange={(opened) => !opened && onClose()}
        presentationDetents={["large"]}
        presentationDragIndicator="visible"
      >
        <List modifiers={listModifiers}>
          <Section title="Tabs & terminals">
            <VStack alignment="leading" spacing={4}>
              <Text>{groupName ?? "Current workspace"}</Text>
              <Text>{loading && !groupName ? "Loading tabs..." : (error ?? headerSubtitle)}</Text>
            </VStack>
            <Button
              systemImage="plus.rectangle.on.rectangle"
              onPress={!creating && !activeSessionOptimistic ? handleCreateAgentTab : undefined}
            >
              {creating ? "Creating agent tab..." : "New agent tab"}
            </Button>
          </Section>

          {sessionIds.length > 0 ? (
            <Section title="Terminals">
              {sessionIds.map((sessionId) => (
                <NativeTerminalRow
                  key={`terminal-${sessionId}`}
                  sessionId={sessionId}
                  active={sessionId === activeSessionId && activePane === "terminal"}
                  onPress={() => navigateToSession(groupId, sessionId, "terminal")}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Agent tabs">
            {sessionIds.length === 0 ? (
              <Text>No tabs yet</Text>
            ) : (
              sessionIds.map((sessionId) => (
                <NativeSessionRow
                  key={sessionId}
                  sessionId={sessionId}
                  active={sessionId === activeSessionId && activePane === "session"}
                  onPress={() => navigateToSession(groupId, sessionId)}
                />
              ))
            )}
          </Section>
        </List>
      </BottomSheet>
    </Host>
  );
}

function NativeTerminalRow({
  sessionId,
  active,
  onPress,
}: {
  sessionId: string;
  active: boolean;
  onPress: () => void;
}) {
  const name = useEntityField("sessions", sessionId, "name") as string | null | undefined;
  return (
    <Button systemImage="chevron.left.forwardslash.chevron.right" onPress={onPress}>
      {`${active ? "✓ " : ""}${name ?? "Session"}${active ? " · Current terminal" : ""}`}
    </Button>
  );
}

function NativeSessionRow({
  sessionId,
  active,
  onPress,
}: {
  sessionId: string;
  active: boolean;
  onPress: () => void;
}) {
  const name = useEntityField("sessions", sessionId, "name") as string | null | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | SessionStatus
    | null
    | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | string
    | null
    | undefined;
  return (
    <Button systemImage="rectangle.on.rectangle" onPress={onPress}>
      {`${active ? "✓ " : ""}${name ?? "Session"} · ${sessionSubtitle(
        active,
        sessionStatus,
        agentStatus,
      )}`}
    </Button>
  );
}

function sessionSubtitle(
  active: boolean,
  sessionStatus: SessionStatus | null | undefined,
  agentStatus: string | null | undefined,
): string {
  if (active) return "Current tab";
  if (agentStatus === "active") return "Agent running";
  if (agentStatus === "failed") return "Needs attention";
  if (sessionStatus === "needs_input") return "Needs input";
  if (sessionStatus === "in_review") return "In review";
  if (sessionStatus === "merged") return "Merged";
  return "Idle";
}
