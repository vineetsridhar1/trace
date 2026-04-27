import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { BridgeAccessCapability } from "@trace/gql";
import { Text } from "@/components/design-system";
import { ConnectionsBridgeAccessRequestContent } from "@/components/connections/ConnectionsBridgeAccessRequestContent";
import type { ConnectionAccessRequest } from "@/hooks/useConnections";
import { alpha, useTheme } from "@/theme";

export function ConnectionsBridgeAccessRequestModal({
  request,
  visible,
  pending,
  onClose,
  onApprove,
  onDeny,
}: {
  request: ConnectionAccessRequest | null;
  visible: boolean;
  pending: boolean;
  onClose: () => void;
  onApprove: (input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible && request !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              borderBottomColor: theme.colors.borderMuted,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
            },
          ]}
        >
          <View style={styles.headerCopy}>
            <Text variant="caption1" color="dimForeground" style={styles.eyebrow}>
              Access request
            </Text>
            <Text variant="title2" color="foreground" numberOfLines={1}>
              Review bridge access
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close access request"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: alpha(theme.colors.surfaceElevated, 0.72),
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <SymbolView
              name="xmark"
              size={16}
              tintColor={theme.colors.foreground}
              resizeMode="scaleAspectFit"
              style={styles.closeIcon}
            />
          </Pressable>
        </View>

        <View style={[styles.content, { paddingHorizontal: theme.spacing.lg }]}>
          {request ? (
            <ConnectionsBridgeAccessRequestContent
              request={request}
              pending={pending}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: 16,
    height: 16,
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
});
