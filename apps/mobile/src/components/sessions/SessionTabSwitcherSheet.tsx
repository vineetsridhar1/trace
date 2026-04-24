import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, useTheme } from "@/theme";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  onClose: () => void;
}

export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  onClose,
}: SessionTabSwitcherSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Dismiss tab switcher"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: alpha("#000000", 0.4) }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              paddingTop: theme.spacing.sm,
            },
          ]}
        >
          <View style={styles.grabberSlot}>
            <View
              style={[
                styles.grabber,
                { backgroundColor: theme.colors.borderMuted },
              ]}
            />
          </View>
          <View
            style={[
              styles.content,
              { paddingHorizontal: theme.spacing.lg },
            ]}
          >
            <SessionTabSwitcherContent
              groupId={groupId}
              activeSessionId={activeSessionId}
              onClose={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "78%",
    minHeight: "42%",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabberSlot: {
    alignItems: "center",
    paddingBottom: 10,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 999,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
