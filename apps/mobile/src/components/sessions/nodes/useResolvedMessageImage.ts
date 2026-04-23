import { useEffect, useState } from "react";
import { Image } from "react-native";
import { getCachedUploadedImageUrl, getUploadedImageUrl } from "@/lib/upload";

export function useResolvedMessageImageUri(imageKey?: string, previewUrl?: string) {
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

export function useImageAspectRatio(uri: string | null) {
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

function cachedUri(imageKey?: string): string | null {
  return imageKey ? getCachedUploadedImageUrl(imageKey) : null;
}
