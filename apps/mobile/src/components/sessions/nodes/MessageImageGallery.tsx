import { memo, useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Spinner, Text } from "@/components/design-system";
import { getCachedUploadedImageUrl, getUploadedImageUrl } from "@/lib/upload";
import { alpha, useTheme } from "@/theme";

interface MessageImageGalleryProps {
  imageKeys?: string[];
  previewUrls?: string[];
}

interface MessageImageItem {
  key: string;
  imageKey?: string;
  previewUrl?: string;
  label: string;
}

export const MessageImageGallery = memo(function MessageImageGallery({
  imageKeys,
  previewUrls,
}: MessageImageGalleryProps) {
  const theme = useTheme();
  const [selectedImage, setSelectedImage] = useState<MessageImageItem | null>(null);
  const items = useMemo(() => buildImageItems(imageKeys, previewUrls), [imageKeys, previewUrls]);

  if (items.length === 0) return null;

  return (
    <>
      <View style={[styles.grid, { gap: theme.spacing.xs }]}>
        {items.map((item) => (
          <MessageImageTile
            key={item.key}
            item={item}
            single={items.length === 1}
            onOpen={setSelectedImage}
          />
        ))}
      </View>
      <MessageImageModal
        item={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
});

function MessageImageTile({
  item,
  single,
  onOpen,
}: {
  item: MessageImageItem;
  single: boolean;
  onOpen: (item: MessageImageItem) => void;
}) {
  const theme = useTheme();
  const { uri, loading, failed } = useResolvedImageUri(item.imageKey, item.previewUrl);

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
            <Text
              variant="caption1"
              color="mutedForeground"
              align="center"
            >
              {failed ? "Image unavailable" : item.label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

function MessageImageModal({
  item,
  onClose,
}: {
  item: MessageImageItem | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { uri, loading, failed } = useResolvedImageUri(item?.imageKey, item?.previewUrl);
  const aspectRatio = useImageAspectRatio(uri);
  const imageSurfaceStyle = useMemo(() => {
    const maxWidth = Math.max(windowWidth - 40, 120);
    const maxHeight = Math.max(windowHeight - 160, 160);
    if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      return {
        width: maxWidth,
        height: maxHeight,
      };
    }

    let width = maxWidth;
    let height = width / aspectRatio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return { width, height };
  }, [aspectRatio, windowHeight, windowWidth]);

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

function useResolvedImageUri(imageKey?: string, previewUrl?: string) {
  const [uri, setUri] = useState<string | null>(() => previewUrl ?? cachedUri(imageKey));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = cachedUri(imageKey);
    const initialUri = previewUrl ?? cached;
    setUri(initialUri);
    setFailed(false);

    if (!imageKey || (initialUri && initialUri === cached)) {
      return () => {
        cancelled = true;
      };
    }

    void getUploadedImageUrl(imageKey)
      .then((nextUri) => {
        if (cancelled) return;
        setUri(nextUri);
      })
      .catch(() => {
        if (cancelled) return;
        if (!previewUrl) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageKey, previewUrl]);

  return {
    uri,
    failed,
    loading: !uri && !!imageKey && !failed,
  };
}

function cachedUri(imageKey?: string): string | null {
  return imageKey ? getCachedUploadedImageUrl(imageKey) : null;
}

function useImageAspectRatio(uri: string | null) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!uri) {
      setAspectRatio(null);
      return;
    }

    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled || height <= 0) return;
        setAspectRatio(width / height);
      },
      () => {
        if (cancelled) return;
        setAspectRatio(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return aspectRatio;
}

function buildImageItems(imageKeys?: string[], previewUrls?: string[]): MessageImageItem[] {
  const count = Math.max(imageKeys?.length ?? 0, previewUrls?.length ?? 0);
  return Array.from({ length: count }, (_, index) => {
    const imageKey = imageKeys?.[index];
    const previewUrl = previewUrls?.[index];
    if (!imageKey && !previewUrl) return null;
    return {
      key: imageKey ?? previewUrl ?? `image-${index}`,
      imageKey,
      previewUrl,
      label: `Image ${index + 1}`,
    };
  }).filter((item): item is MessageImageItem => item != null);
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
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
