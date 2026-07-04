// Camera handling: keep the rear camera streaming into the background
// <video>, and capture downscaled JPEG frames for the vision model.

const MAX_EDGE = 2048;      // long-edge cap sent to the model (quality vs cost)
const JPEG_QUALITY = 0.85;

let stream = null;
let videoEl = null;

export async function startCamera(video) {
  videoEl = video;
  if (stream) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 2560 },
        height: { ideal: 1440 },
      },
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    return true;
  } catch (err) {
    stream = null;
    console.warn('camera failed', err);
    return false;
  }
}

export function cameraRunning() {
  return Boolean(stream && videoEl && videoEl.videoWidth > 0);
}

/** Grab the current frame as a base64 JPEG (no data: prefix). */
export function captureFrame() {
  if (!cameraRunning()) return null;
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
}

/** Fallback path: turn a photo picked from <input type=file> into base64 JPEG. */
export function fileToBase64Jpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    img.src = url;
  });
}
