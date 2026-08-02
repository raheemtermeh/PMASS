const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 256;

/**
 * Reads a picked image and returns a square, downscaled JPEG data URL.
 *
 * Resizing in the browser keeps the stored value small enough to live in a
 * database column, which is why the app needs no object storage for avatars.
 */
export async function readAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is larger than 5 MB. Pick a smaller one.");
  }

  const bitmap = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser.");

  // Center-crop to a square so portraits and landscapes both look right.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}
