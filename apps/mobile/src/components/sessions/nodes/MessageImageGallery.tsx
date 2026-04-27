import { memo, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { MessageImageModal } from "./MessageImageModal";
import { MessageImageTile } from "./MessageImageTile";
import { buildMessageImageItems, type MessageImageItem } from "./message-image-utils";

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
  const items = useMemo(
    () => buildMessageImageItems(imageKeys, previewUrls),
    [imageKeys, previewUrls],
  );

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
