const MAX_VISION_IMAGE_EDGE = 2560;
const JPEG_QUALITY = 0.86;
const WEBP_QUALITY = 0.86;
const RESIZABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Downscale unusually high-resolution static images before upload. Images at
 * or below 2560 px on both axes, animated GIFs, and unknown formats are kept
 * byte-for-byte unchanged.
 */
export async function resizeImageForAgent(file: File): Promise<File> {
  if (!RESIZABLE_IMAGE_TYPES.has(file.type)) return file;

  let source: ImageBitmap | undefined;
  try {
    if (typeof createImageBitmap !== "function") return file;
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (
      source.width <= MAX_VISION_IMAGE_EDGE &&
      source.height <= MAX_VISION_IMAGE_EDGE
    ) {
      return file;
    }

    const scale = Math.min(
      MAX_VISION_IMAGE_EDGE / source.width,
      MAX_VISION_IMAGE_EDGE / source.height,
    );
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, file.type, qualityFor(file.type));
    return new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch (error) {
    // Uploading the original is preferable to rejecting a valid image because
    // a browser decoder or canvas encoder is unavailable.
    console.warn("[image-resize] using original image", error);
    return file;
  } finally {
    source?.close();
  }
}

function qualityFor(mediaType: string): number | undefined {
  if (mediaType === "image/jpeg") return JPEG_QUALITY;
  if (mediaType === "image/webp") return WEBP_QUALITY;
  return undefined;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Browser could not encode ${mediaType}`));
      },
      mediaType,
      quality,
    );
  });
}
