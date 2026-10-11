import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, Platform, View } from "react-native";
import { File } from "expo-file-system";
import {
    AudioModule,
    AudioQuality,
    IOSOutputFormat,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from "expo-audio";
import { Button, ErrorState, Text } from "@trainflow/ui-mobile";
import { AudioPlayback } from "./Attachment";
import { AndroidVoiceRecorder } from "./AndroidVoiceRecorder";

const clock = (millis: number) => {
    const seconds = Math.floor(millis / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export interface RecorderProps {
    disabled: boolean;
    onReady: (uri: string) => Promise<void>;
    onBusy: (value: boolean) => void;
}
export function VoiceRecorder(props: RecorderProps) {
    return Platform.OS === "android" ? (
        <AndroidVoiceRecorder {...props} />
    ) : (
        <IosVoiceRecorder {...props} />
    );
}

function IosVoiceRecorder({ disabled, onReady, onBusy }: RecorderProps) {
    const recorder = useAudioRecorder({
        extension: ".wav",
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
        ios: {
            extension: ".wav",
            outputFormat: IOSOutputFormat.LINEARPCM,
            audioQuality: AudioQuality.HIGH,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
        },
        android: { outputFormat: "mpeg4", audioEncoder: "aac" },
        web: { mimeType: "audio/webm" },
    });
    const state = useAudioRecorderState(recorder);
    const [uri, setUri] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const mounted = useRef(true);
    const stopping = useRef(false);
    const recording = state.isRecording;
    useEffect(() => {
        onBusy(recording || busy || !!uri);
    }, [recording, busy, uri, onBusy]);
    const stop = useCallback(async () => {
        if (stopping.current) return;
        stopping.current = true;
        try {
            await recorder.stop();
            if (mounted.current && recorder.uri) setUri(recorder.uri);
        } catch (failure) {
            if (mounted.current) setError(failure);
        } finally {
            stopping.current = false;
            await setAudioModeAsync({
                allowsRecording: false,
                shouldPlayInBackground: false,
            }).catch((failure) => {
                if (mounted.current) setError(failure);
            });
        }
    }, [recorder]);
    useEffect(() => {
        if (state.isRecording && state.durationMillis >= 300000) void stop();
    }, [state.isRecording, state.durationMillis, stop]);
    useEffect(() => {
        mounted.current = true;
        const subscription = AppState.addEventListener("change", (value) => {
            if (value !== "active" && recorder.isRecording) void stop();
        });
        return () => {
            mounted.current = false;
            subscription.remove();
            onBusy(false);
            void (async () => {
                if (recorder.isRecording) await recorder.stop().catch(() => {});
                const path = recorder.uri;
                if (path) {
                    const file = new File(path);
                    if (file.exists) file.delete();
                }
                await setAudioModeAsync({
                    allowsRecording: false,
                    shouldPlayInBackground: false,
                });
            })().catch(() => {});
        };
    }, [recorder, onBusy, stop]);
    async function start() {
        setBusy(true);
        setError(undefined);
        try {
            const permission =
                await AudioModule.requestRecordingPermissionsAsync();
            if (!permission.granted)
                throw new Error(
                    "Microphone permission is required to record. You can attach an existing WAV instead.",
                );
            if (!mounted.current) return;
            await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
            });
            await recorder.prepareToRecordAsync();
            if (mounted.current) recorder.record();
        } catch (failure) {
            if (mounted.current) setError(failure);
        } finally {
            if (mounted.current) setBusy(false);
        }
    }
    return (
        <View style={{ gap: 12 }}>
            {!!error && <ErrorState error={error} />}
            <View style={{ alignItems: "center", gap: 2 }}>
                <Text
                    variant="display"
                    tone={recording ? "danger" : "text"}
                    accessibilityLiveRegion="polite"
                >
                    {clock(state.durationMillis)}
                </Text>
                <Text variant="caption" tone="mutedText">
                    {recording ? "Recording… up to 5 minutes" : "Up to 5 minutes"}
                </Text>
            </View>
            {recording ? (
                <Button
                    size="lg"
                    tone="danger"
                    icon="pause"
                    title="Stop recording"
                    onPress={stop}
                />
            ) : !uri ? (
                <Button
                    size="lg"
                    tone="primary"
                    icon="mic"
                    title="Start recording"
                    loading={busy}
                    disabled={disabled}
                    onPress={start}
                />
            ) : (
                <>
                    <AudioPlayback uri={uri} />
                    <Button
                        size="lg"
                        tone="primary"
                        icon="attach"
                        title="Attach to message"
                        loading={busy || disabled}
                        onPress={async () => {
                            setBusy(true);
                            setError(undefined);
                            try {
                                await onReady(uri);
                                const file = new File(uri);
                                if (file.exists) file.delete();
                                if (mounted.current) setUri(undefined);
                            } catch (failure) {
                                if (mounted.current) setError(failure);
                            } finally {
                                if (mounted.current) setBusy(false);
                            }
                        }}
                    />
                    <Button
                        tone="ghost"
                        icon="delete"
                        title="Discard recording"
                        disabled={busy || disabled}
                        onPress={() => {
                            const file = new File(uri);
                            if (file.exists) file.delete();
                            setUri(undefined);
                        }}
                    />
                </>
            )}
        </View>
    );
}
