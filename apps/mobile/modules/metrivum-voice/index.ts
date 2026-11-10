import { requireOptionalNativeModule } from "expo";

export interface VoiceStatus {
  id: string;
  recording: boolean;
  durationMillis: number;
  meter: number;
  uri: string | null;
  error: string | null;
}

export interface VoiceModule {
  startAsync(accountId: string): Promise<VoiceStatus>;
  statusAsync(id: string): Promise<VoiceStatus>;
  stopAsync(id: string): Promise<VoiceStatus>;
  cancelAsync(id: string): Promise<void>;
}

export const TrainflowVoice =
  requireOptionalNativeModule<VoiceModule>("TrainflowVoice");
