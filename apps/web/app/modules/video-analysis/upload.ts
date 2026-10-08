/**
 * Uploads bytes to the signed Storage URL with real progress. The URL is a temporary Storage
 * credential: no TrainFlow bearer token is attached and it is never logged or persisted.
 */
export function uploadToSignedUrl(url: string, file: File, contentType: string, onProgress: (ratio: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export function videoContentType(file: Pick<File, "type" | "name">): string {
  if (file.type === "" || file.type === "application/octet-stream") {
    if (/\.mov$/i.test(file.name)) return "video/quicktime";
  }
  return file.type;
}
export const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
