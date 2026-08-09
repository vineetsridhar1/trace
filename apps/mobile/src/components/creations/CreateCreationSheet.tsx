import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

interface CreateCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreateApp: () => void;
  onCreateDesign: () => void;
}

export function CreateCreationSheet({ visible, onClose, onCreateApp, onCreateDesign }: CreateCreationSheetProps) {
  const theme = useTheme();
  const select = (action: () => void) => {
    void haptic.medium();
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss new creation" style={styles.backdrop} onPress={onClose} />
        <Glass preset="pinnedBar" style={[styles.sheet, { borderColor: theme.colors.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.dimForeground }]} />
          <Text variant="title2" style={styles.heading}>New creation</Text>
          <Text variant="footnote" color="mutedForeground" style={styles.description}>
            Choose what you want to make with Trace.
          </Text>
          <CreationChoice symbol="square.grid.2x2" title="Build an app" subtitle="A working product you can use and share" onPress={() => select(onCreateApp)} />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <CreationChoice symbol="paintpalette" title="Create a design" subtitle="A reviewable screen or product flow" onPress={() => select(onCreateDesign)} />
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
            <Text variant="subheadline" color="mutedForeground">Cancel</Text>
          </Pressable>
        </Glass>
      </View>
    </Modal>
  );
}

function CreationChoice({ symbol, title, subtitle, onPress }: { symbol: "square.grid.2x2" | "paintpalette"; title: string; subtitle: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.65 }]}>
      <View style={[styles.choiceIcon, { backgroundColor: theme.colors.surfaceElevated }]}>
        <SymbolView name={symbol} size={18} tintColor="#0a84ff" />
      </View>
      <View style={styles.choiceCopy}>
        <Text variant="callout" style={{ fontWeight: "600" }}>{title}</Text>
        <Text variant="caption1" color="mutedForeground">{subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={12} tintColor={theme.colors.dimForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { margin: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 28 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 99, marginBottom: 12 },
  heading: { marginHorizontal: 8 },
  description: { marginHorizontal: 8, marginTop: 2, marginBottom: 8 },
  choice: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 8 },
  choiceIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  choiceCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
});
