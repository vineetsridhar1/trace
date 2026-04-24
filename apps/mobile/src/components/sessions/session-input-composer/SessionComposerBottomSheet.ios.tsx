import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";

interface SessionComposerBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

const SHEET_MODIFIERS = [
  presentationDetents(["medium", "large"]),
  presentationDragIndicator("visible"),
];

export function SessionComposerBottomSheet({
  visible,
  onClose,
  children,
}: SessionComposerBottomSheetProps) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);

  useEffect(() => {
    if (visible) {
      setContent(children);
      setMounted(true);
    }
  }, [children, visible]);

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
          isPresented={visible}
          onIsPresentedChange={handlePresentedChange}
        >
          <Group modifiers={SHEET_MODIFIERS}>
            <RNHostView>
              <View style={styles.sheetContent}>{content}</View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
});
