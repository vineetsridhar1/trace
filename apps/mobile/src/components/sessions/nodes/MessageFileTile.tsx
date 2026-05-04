import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Spinner, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import type { MessageFileItem } from "./message-image-utils";

interface MessageFileTileProps {
  item: MessageFileItem;
  loading: boolean;
  single: boolean;
  onOpen: (item: MessageFileItem) => void;
}

export function MessageFileTile({ item, loading, single, onOpen }: MessageFileTileProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint="Asks before downloading the attachment"
      disabled={loading}
      onPress={() => onOpen(item)}
      style={[
        styles.tile,
        single ? styles.tileSingle : styles.tileMulti,
        {
          borderColor: alpha(theme.colors.foreground, 0.08),
          backgroundColor: theme.colors.surfaceElevated,
        },
      ]}
    >
      <View style={[styles.iconFrame, { backgroundColor: alpha(theme.colors.foreground, 0.06) }]}>
        {loading ? (
          <Spinner size="small" />
        ) : (
          <SymbolView
            name="doc"
            size={18}
            tintColor={theme.colors.mutedForeground}
            resizeMode="scaleAspectFit"
            style={styles.icon}
          />
        )}
      </View>
      <Text
        variant="caption1"
        color="foreground"
        numberOfLines={2}
        ellipsizeMode="middle"
        style={styles.label}
      >
        {item.filename}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tileSingle: {
    width: "100%",
    maxWidth: 228,
    height: 72,
  },
  tileMulti: {
    width: 116,
    height: 116,
    flexDirection: "column",
    justifyContent: "center",
  },
  iconFrame: {
    alignItems: "center",
    borderRadius: 9,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  icon: {
    height: 18,
    width: 18,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
});
