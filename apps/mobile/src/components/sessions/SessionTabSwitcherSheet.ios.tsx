import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/theme";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  onClose: () => void;
}

const IOS_SHEET_CLOSE_DELAY_MS = 220;
const SHEET_MODIFIERS = [
  presentationDetents(["medium", "large"]),
  presentationDragIndicator("visible"),
];

export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  onClose,
}: SessionTabSwitcherSheetProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (isPresented) return;
      setMounted(false);
      onClose();
    },
    [onClose],
  );

  const hostStyle = useMemo(() => [styles.host, { width }], [width]);

  if (!mounted) return null;

  return (
    <View style={styles.anchor}>
      <Host style={hostStyle}>
        <BottomSheet
          isPresented={open}
          onIsPresentedChange={handlePresentedChange}
        >
          <Group modifiers={SHEET_MODIFIERS}>
            <RNHostView>
              <View
                style={[
                  styles.sheetContent,
                  {
                    paddingHorizontal: theme.spacing.lg,
                    paddingTop: theme.spacing.md,
                    paddingBottom: theme.spacing.lg,
                  },
                ]}
              >
                <SessionTabSwitcherContent
                  groupId={groupId}
                  activeSessionId={activeSessionId}
                  onClose={onClose}
                  closeDelayMs={IOS_SHEET_CLOSE_DELAY_MS}
                />
              </View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
  },
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 1,
  },
  sheetContent: {
    flex: 1,
    minHeight: 0,
  },
});
