const DEFAULT_MAX_SIZE = 1600;
const DEFAULT_QUALITY = 0.78;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    image.src = url;
  });
}

function getScaledSize(width, height, maxSize) {
  const largestSide = Math.max(width, height);

  if (largestSide <= maxSize) {
    return { width, height };
  }

  const scale = maxSize / largestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function compressImageFile(file, options = {}) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }

  const image = await readImage(file);
  const { width, height } = getScaledSize(image.naturalWidth, image.naturalHeight, options.maxSize || DEFAULT_MAX_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', options.quality || DEFAULT_QUALITY);
  });

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const safeName = file.name.replace(/\.[^.]+$/, '') || 'cargo-image';
  return new File([blob], `${safeName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
