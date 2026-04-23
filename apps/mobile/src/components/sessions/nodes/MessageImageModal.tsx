import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "react-native";
import { Spinner, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import type { MessageImageItem } from "./message-image-utils";
import { fitMessageImageSurface } from "./message-image-utils";
import { useImageAspectRatio, useResolvedMessageImageUri } from "./useResolvedMessageImage";

interface MessageImageModalProps {
  item: MessageImageItem | null;
  onClose: () => void;
}

export function MessageImageModal({ item, onClose }: MessageImageModalProps) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { uri, loading, failed } = useResolvedMessageImageUri(item?.imageKey, item?.previewUrl);
  const aspectRatio = useImageAspectRatio(uri);
  const imageSurfaceStyle = fitMessageImageSurface(windowWidth, windowHeight, aspectRatio);

  return (
    <Modal
      visible={item != null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={[styles.modalBackdrop, { backgroundColor: alpha("#000000", 0.94) }]}
      >
        <View pointerEvents="box-none" style={styles.modalChrome}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image preview"
            onPress={onClose}
            style={[
              styles.closeButton,
              {
                backgroundColor: alpha(theme.colors.surface, 0.9),
                borderColor: alpha(theme.colors.foreground, 0.12),
              },
            ]}
          >
            <Text variant="caption1">Close</Text>
          </Pressable>
          <View style={styles.modalImageFrame}>
            {uri ? (
              <Pressable
                onPress={(event) => event.stopPropagation()}
                style={[styles.modalImageSurface, imageSurfaceStyle]}
              >
                <Image
                  source={{ uri }}
                  resizeMode="contain"
                  style={styles.modalImage}
                />
              </Pressable>
            ) : loading ? (
              <Spinner size="large" />
            ) : (
              <Text color="mutedForeground">{failed ? "Image unavailable" : item?.label}</Text>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalChrome: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  closeButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalImageFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageSurface: {
    alignItems: "center",
    justifyContent: "center",
  },
  modalImage: {
    width: "100%",
    height: "100%",
  },
});
