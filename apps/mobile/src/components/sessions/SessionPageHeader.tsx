import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { FloatingBackButton } from "@/components/navigation/FloatingBackButton";
import { SessionGroupHeader } from "./SessionGroupHeader";

interface SessionPageHeaderProps {
  groupId: string;
  sessionId: string;
  activePane?: "session" | "terminal" | "browser";
  browserEnabled?: boolean;
  onOpenBrowser?: () => void;
  onBack: () => void;
  minimal?: boolean;
}

export function SessionPageHeader({
  groupId,
  sessionId,
  activePane = "session",
  browserEnabled = true,
  onOpenBrowser,
  onBack,
  minimal = false,
}: SessionPageHeaderProps) {
  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  const backButton = <FloatingBackButton onPress={handleBack} />;

  if (minimal) return <View style={styles.floatingBack}>{backButton}</View>;

  return (
    <SessionGroupHeader
      groupId={groupId}
      sessionId={sessionId}
      activePane={activePane}
      browserEnabled={browserEnabled}
      onOpenBrowser={onOpenBrowser}
      leadingAccessory={backButton}
    />
  );
}

const styles = StyleSheet.create({
  floatingBack: {
    alignSelf: "flex-start",
    marginLeft: 16,
  },
});
