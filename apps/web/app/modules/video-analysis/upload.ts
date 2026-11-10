/**
 * Uploads bytes to the signed Storage URL with real progress. The URL is a temporary Storage
 * credential: no Metrivum bearer token is attached and it is never logged or persisted.
 */
export function uploadToSignedUrl(
  url: string,
  file: File,
  contentType: string,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const settle = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      settle(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error(`Upload failed (${xhr.status})`),
      );
    xhr.onerror = () => settle(new Error("Upload failed"));
    xhr.onabort = () =>
      settle(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
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
