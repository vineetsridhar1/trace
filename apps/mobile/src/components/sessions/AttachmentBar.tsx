import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Spinner, Text } from "@/components/design-system";
import { isPreviewableImageMimeType } from "@/lib/attachment-utils";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";
import type { FileAttachment } from "@/stores/drafts";

interface Props {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
}

/** Attachment strip above the composer. Images preview inline; other files show a compact chip. */
export function AttachmentBar({ attachments, onRemove }: Props) {
  const theme = useTheme();
  if (attachments.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {attachments.map((attachment) => {
        const isImage = Boolean(
          attachment.previewUri && isPreviewableImageMimeType(attachment.mimeType),
        );
        return (
          <View key={attachment.id} style={styles.itemWrap}>
            {isImage ? (
              <Image
                source={{ uri: attachment.previewUri }}
                style={[
                  styles.thumb,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                  },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.fileChip,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                  },
                ]}
              >
                <SymbolView
                  name="doc"
                  size={20}
                  tintColor={theme.colors.foreground}
                  weight="regular"
                  resizeMode="scaleAspectFit"
                  style={styles.fileIcon}
                />
                <View style={styles.fileText}>
                  <Text variant="caption1" numberOfLines={1} ellipsizeMode="middle">
                    {attachment.filename}
                  </Text>
                  <Text variant="caption2" color="mutedForeground" numberOfLines={1}>
                    {attachment.mimeType}
                  </Text>
                </View>
              </View>
            )}
            {attachment.uploading ? (
              <View
                style={[
                  styles.overlay,
                  isImage ? styles.imageOverlay : styles.fileOverlay,
                  { backgroundColor: alpha("#000000", 0.4) },
                ]}
              >
                <Spinner size="small" />
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                void haptic.selection();
                onRemove(attachment.id);
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
        );
      })}
    </ScrollView>
  );
}

const THUMB_SIZE = 56;
const FILE_CHIP_WIDTH = 176;
const REMOVE_BUTTON_SIZE = 28;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingBottom: 6 },
  itemWrap: { position: "relative" },
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
    height: THUMB_SIZE,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  imageOverlay: {
    width: THUMB_SIZE,
  },
  fileOverlay: {
    width: FILE_CHIP_WIDTH,
  },
  fileChip: {
    width: FILE_CHIP_WIDTH,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  fileIcon: { width: 20, height: 20 },
  fileText: { flex: 1, minWidth: 0, gap: 1 },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: REMOVE_BUTTON_SIZE,
    height: REMOVE_BUTTON_SIZE,
    borderRadius: REMOVE_BUTTON_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: { width: 10, height: 10 },
});
