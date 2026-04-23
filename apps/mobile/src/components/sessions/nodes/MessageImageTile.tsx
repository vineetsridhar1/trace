import { Image, Pressable, StyleSheet, View } from "react-native";
import { Spinner, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import type { MessageImageItem } from "./message-image-utils";
import { useResolvedMessageImageUri } from "./useResolvedMessageImage";

interface MessageImageTileProps {
  item: MessageImageItem;
  single: boolean;
  onOpen: (item: MessageImageItem) => void;
}

export function MessageImageTile({ item, single, onOpen }: MessageImageTileProps) {
  const theme = useTheme();
  const { uri, loading, failed } = useResolvedMessageImageUri(item.imageKey, item.previewUrl);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={uri ? "Opens the image full screen" : undefined}
      disabled={!uri}
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
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={styles.tileImage}
        />
      ) : (
        <View style={styles.placeholder}>
          {loading ? (
            <Spinner size="small" />
          ) : (
            <Text variant="caption1" color="mutedForeground" align="center">
              {failed ? "Image unavailable" : item.label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileSingle: {
    width: "100%",
    maxWidth: 228,
    height: 172,
  },
  tileMulti: {
    width: 116,
    height: 116,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});
