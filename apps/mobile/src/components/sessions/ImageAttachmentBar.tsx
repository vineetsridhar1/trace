import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Spinner } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";
import type { ImageAttachment } from "@/stores/drafts";

interface Props {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}

/** Thumbnail strip above the composer, mirrors web's ImageAttachmentBar. */
export function ImageAttachmentBar({ images, onRemove }: Props) {
  const theme = useTheme();
  if (images.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {images.map((img) => (
        <View key={img.id} style={styles.thumbWrap}>
          <Image
            source={{ uri: img.previewUri }}
            style={[styles.thumb, { borderColor: theme.colors.border }]}
          />
          {img.uploading ? (
            <View style={[styles.overlay, { backgroundColor: alpha("#000000", 0.4) }]}>
              <Spinner size="small" />
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              void haptic.selection();
              onRemove(img.id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            hitSlop={8}
            style={[
              styles.removeBtn,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <SymbolView
              name="xmark"
              size={10}
              tintColor={theme.colors.foreground}
              weight="bold"
              resizeMode="scaleAspectFit"
              style={styles.removeIcon}
            />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const THUMB_SIZE = 56;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingBottom: 6 },
  thumbWrap: { position: "relative" },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: { width: 10, height: 10 },
});
