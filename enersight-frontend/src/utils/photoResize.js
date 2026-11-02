// The upload page sends the whole photo for OCR, scaled down when it is larger than
// it needs to be. A native 12 MP phone photo is about twice the size of the campus
// photos that scanned correctly (2048 px tall), and only slower to upload and read.

/** Longest side of the photo sent for OCR. */
export const MAX_UPLOAD_SIDE = 2048;

const JPEG_QUALITY = 0.92;

/** Size to send a photo at: scaled down to fit maxSide, never scaled up. */
export function getOutputSize(width, height, maxSide = MAX_UPLOAD_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a photo of this size is sent as it is. */
export function fitsUploadLimit(width, height, maxSide = MAX_UPLOAD_SIDE) {
  return Math.max(width, height) <= maxSide;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the photo."));
    };
    image.src = url;
  });
}

/**
 * The whole photo, ready to upload: the original file when it is already small
 * enough, otherwise a JPEG scaled down to MAX_UPLOAD_SIDE. Browsers apply the
 * photo's EXIF rotation when drawing it, so the scaled copy stays upright.
 */
export async function scalePhotoForUpload(file) {
  const image = await loadImage(file);

  if (fitsUploadLimit(image.naturalWidth, image.naturalHeight)) {
    return file;
  }

  const size = getOutputSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);

  const baseName = file.name.replace(/\.[^.]+$/, "") || "meter";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not prepare the photo for scanning."));
          return;
        }

        resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
