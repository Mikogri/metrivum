import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import type { QueryValue, Transport } from "@metrivum/api-client-web/transport";

export async function uploadFile(
  api: Transport,
  basePath: string,
  asset: { uri: string; name: string; mimeType?: string; size?: number },
  signal: AbortSignal,
  query?: Record<string, QueryValue>,
): Promise<string> {
  const file = new File(asset.uri);
  const contentType = asset.mimeType || file.type || "application/octet-stream";
  const ticket = (
    await api<{
      mediaId?: string;
      file?: { id: string };
      uploadUrl: string;
      method: string;
    }>({
      path: `${basePath}/uploads`,
      method: "POST",
      json: {
        name: asset.name,
        contentType,
        size: asset.size ?? file.size,
      },
      signal,
      query,
    })
  ).data;
  const id = ticket.mediaId ?? ticket.file?.id;
  if (!id || new URL(ticket.uploadUrl).protocol !== "https:")
    throw Error("Invalid private upload ticket.");
  // Signed storage requests must never receive the API bearer token.
  const response = await fetch(ticket.uploadUrl, {
    method: ticket.method,
    body: file,
    headers: { "Content-Type": contentType },
    signal,
  });
  if (!response.ok) throw Error("Upload failed. Please retry.");
  await api({
    path: `${basePath}/uploads/${id}/finalize`,
    method: "POST",
    signal,
    query,
  });
  return id;
}
export async function pickAndUpload(
  api: Transport,
  basePath: string,
  signal: AbortSignal,
  query?: Record<string, QueryValue>,
): Promise<string | null> {
  const selected = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selected.canceled || !selected.assets[0]) return null;
  const asset = selected.assets[0];
  try {
    return await uploadFile(api, basePath, asset, signal, query);
  } finally {
    const file = new File(asset.uri);
    if (file.exists) file.delete();
  }
}
