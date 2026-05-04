import { memo, useCallback, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { getUploadedFileDownloadUrl } from "@/lib/upload";
import { useTheme } from "@/theme";
import { MessageFileTile } from "./MessageFileTile";
import { MessageImageModal } from "./MessageImageModal";
import { MessageImageTile } from "./MessageImageTile";
import {
  buildMessageImageItems,
  type MessageFileItem,
  type MessageImageItem,
} from "./message-image-utils";

interface MessageImageGalleryProps {
  imageKeys?: string[];
  previewUrls?: string[];
}

export const MessageImageGallery = memo(function MessageImageGallery({
  imageKeys,
  previewUrls,
}: MessageImageGalleryProps) {
  const theme = useTheme();
  const [selectedImage, setSelectedImage] = useState<MessageImageItem | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const items = useMemo(
    () => buildMessageImageItems(imageKeys, previewUrls),
    [imageKeys, previewUrls],
  );
  const handleDownload = useCallback(async (item: MessageFileItem) => {
    setDownloadingKey(item.key);
    try {
      const url = await getUploadedFileDownloadUrl(item.imageKey);
      await Linking.openURL(url);
    } catch (error) {
      console.warn("[message-attachment] download failed", error);
      Alert.alert("Couldn't download attachment", "Try again in a moment.");
    } finally {
      setDownloadingKey(null);
    }
  }, []);
  const handleOpenFile = useCallback(
    (item: MessageFileItem) => {
      Alert.alert(
        "Download attachment?",
        "This file type is not previewed in Trace. Download it only if you trust the attachment.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Download", onPress: () => void handleDownload(item) },
        ],
      );
    },
    [handleDownload],
  );

  if (items.length === 0) return null;

  return (
    <>
      <View style={[styles.grid, { gap: theme.spacing.xs }]}>
        {items.map((item) =>
          item.kind === "image" ? (
            <MessageImageTile
              key={item.key}
              item={item}
              single={items.length === 1}
              onOpen={setSelectedImage}
            />
          ) : (
            <MessageFileTile
              key={item.key}
              item={item}
              loading={downloadingKey === item.key}
              single={items.length === 1}
              onOpen={handleOpenFile}
            />
          ),
        )}
      </View>
      <MessageImageModal item={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
