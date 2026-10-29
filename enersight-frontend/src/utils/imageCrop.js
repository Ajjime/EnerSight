// The upload page's crop step: turn the box the user drew into the image that is
// sent for OCR.
//
// Measured on the two campus photos: a full 1536x2048 phone photo took 37-64 s and
// ~4.7 GB of RAM to scan, while a crop around the display took 5-12 s. The crop has
// to be loose, though. A box around the whole display with some meter face around
// it read the Aclara meter right (00653) at higher confidence than the full photo,
// but a tight box around just the digits read it as 8865, because EasyOCR's text
// detector misses digits that touch the image edge.

// Longest side of the uploaded image. The campus photos that scanned correctly
// were 2048 px tall; a native 12 MP photo is twice that and only slower.
export const MAX_UPLOAD_SIDE = 2048;

const JPEG_QUALITY = 0.92;

/** A crop covering the whole image: the starting box for a new photo. */
export const FULL_CROP = { unit: "%", x: 0, y: 0, width: 100, height: 100 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The part of the image to keep, in the image's own pixels, from a percent crop
 * as react-image-crop reports it. The whole image when there is no usable crop.
 */
export function getCropRect(percentCrop, naturalWidth, naturalHeight) {
  const whole = { x: 0, y: 0, width: naturalWidth, height: naturalHeight };

  if (
    !percentCrop ||
    percentCrop.unit !== "%" ||
    !(percentCrop.width > 0) ||
    !(percentCrop.height > 0)
  ) {
    return whole;
  }

  const x = clamp(Math.round((percentCrop.x / 100) * naturalWidth), 0, naturalWidth - 1);
  const y = clamp(Math.round((percentCrop.y / 100) * naturalHeight), 0, naturalHeight - 1);
  const width = clamp(
    Math.round((percentCrop.width / 100) * naturalWidth),
    1,
    naturalWidth - x
  );
  const height = clamp(
    Math.round((percentCrop.height / 100) * naturalHeight),
    1,
    naturalHeight - y
  );

  return { x, y, width, height };
}

/** Output size for a crop: scaled down to fit maxSide, never scaled up. */
export function getOutputSize(width, height, maxSide = MAX_UPLOAD_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a crop leaves out a meaningful part of the image. */
export function isCropped(percentCrop) {
  if (!percentCrop || !(percentCrop.width > 0) || !(percentCrop.height > 0)) {
    return false;
  }

  return percentCrop.width < 98 || percentCrop.height < 98;
}

/**
 * Draws the cropped part of a loaded <img> onto a canvas and returns it as a JPEG
 * File named after the original. Browsers apply the photo's EXIF rotation to both
 * the <img> the user cropped on and to drawImage, so the box lines up.
 */
export function cropImageToFile(image, percentCrop, originalName = "meter.jpg") {
  const rect = getCropRect(percentCrop, image.naturalWidth, image.naturalHeight);
  const size = getOutputSize(rect.width, rect.height);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    size.width,
    size.height
  );

  const baseName = originalName.replace(/\.[^.]+$/, "") || "meter";

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
