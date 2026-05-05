import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { ListRow, Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface AttachmentPickerSheetContentProps {
  disabled?: boolean;
  onPickFiles: () => void;
  onPickImages: () => void;
}

export function AttachmentPickerSheetContent({
  disabled = false,
  onPickFiles,
  onPickImages,
}: AttachmentPickerSheetContentProps) {
  const theme = useTheme();

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text variant="headline">Attach</Text>
      </View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <ListRow
          title="Images"
          leading={
            <SymbolView
              name="photo.on.rectangle"
              size={20}
              tintColor={theme.colors.foreground}
              resizeMode="scaleAspectFit"
              style={styles.icon}
            />
          }
          onPress={disabled ? undefined : onPickImages}
          separator
          haptic="selection"
          style={disabled ? styles.disabledRow : undefined}
        />
        <ListRow
          title="Files"
          leading={
            <SymbolView
              name="folder"
              size={20}
              tintColor={theme.colors.foreground}
              resizeMode="scaleAspectFit"
              style={styles.icon}
            />
          }
          onPress={disabled ? undefined : onPickFiles}
          separator={false}
          haptic="selection"
          style={disabled ? styles.disabledRow : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  header: {
    paddingBottom: 2,
  },
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 20,
    height: 20,
  },
  disabledRow: {
    opacity: 0.45,
  },
});
