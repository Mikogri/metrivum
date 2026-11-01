import type { AnalysisDto, SaveClientAnalysisRequest } from '@metrivum/api-client-web';
import type { Transport } from '~/shared/http/transport';
import { finalizeUpload, reserveUpload } from './api';
import { uploadToSignedUrl, videoContentType } from './upload';

type ClientResult = SaveClientAnalysisRequest;
export type SaveStage = 'uploading' | 'saving' | 'saved';
export interface LocalAnalysisReceipt {
  id: string;
  body: Omit<ClientResult, 'localAnalysisId' | 'executionLocation' | 'mediaId'>;
  mediaId?: string;
  uploadedMediaId?: string;
}

/** Freeze this receipt per successful inference: retries reuse the finalized video and idempotency key. */
export async function persistLocalAnalysis(api: Transport, file: File, receipt: LocalAnalysisReceipt, signal: AbortSignal,
  onStage: (stage: SaveStage) => void, upload = uploadToSignedUrl, onUploadProgress: (ratio: number) => void = () => {},
  onUploaded: (mediaId: string) => Promise<void> | void = () => {}): Promise<AnalysisDto> {
  signal.throwIfAborted();
  if (!receipt.mediaId) {
    onStage('uploading');
    if (!receipt.uploadedMediaId) {
      const contentType = videoContentType(file);
      const ticket = await reserveUpload(api, { name: file.name, contentType, size: file.size }, signal);
      signal.throwIfAborted();
      await upload(ticket.uploadUrl, file, contentType, onUploadProgress, signal);
      signal.throwIfAborted();
      receipt.uploadedMediaId = ticket.file.id;
      // Best effort: lets a later save (another tab, after a restart) skip the upload.
      try { await onUploaded(ticket.file.id); } catch { /* the receipt still holds it for this run */ }
    }
    await finalizeUpload(api, receipt.uploadedMediaId, signal);
    signal.throwIfAborted();
    receipt.mediaId = receipt.uploadedMediaId;
  }
  onStage('saving');
  const response = await api<AnalysisDto>({ method: 'POST', path: '/api/v1/analyses/client-results', signal,
    idempotencyKey: receipt.id, timeoutMs: 60_000,
    json: { ...receipt.body, localAnalysisId: receipt.id, executionLocation: 'client', mediaId: receipt.mediaId,
      sourceVideo: { ...receipt.body.sourceVideo, origin: 'cloud' } },
  });
  signal.throwIfAborted();
  onStage('saved');
  return response.data;
}
