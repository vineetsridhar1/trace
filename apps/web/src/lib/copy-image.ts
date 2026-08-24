export async function copyImageToClipboard(src: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is unavailable");
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const imageBlob = await response.blob();
  const pngBlob = imageBlob.type === "image/png" ? imageBlob : await convertImageToPng(imageBlob);

  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}

async function convertImageToPng(imageBlob: Blob): Promise<Blob> {
  const imageUrl = URL.createObjectURL(imageBlob);

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to prepare image for copying"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}
