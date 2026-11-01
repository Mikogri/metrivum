import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { AudioModule } from "expo-audio";
import { Button, ErrorState, ProgressBar, Text } from "@metrivum/ui-mobile";
import {
    TrainflowVoice,
    type VoiceStatus,
} from "../../../modules/metrivum-voice";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { AudioPlayback } from "./Attachment";
import type { RecorderProps } from "./VoiceRecorder";

const clock = (millis: number) => {
    const seconds = Math.floor(millis / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function AndroidVoiceRecorder({
    disabled,
    onReady,
    onBusy,
}: RecorderProps) {
    const { accountId, accountSignal } = useMobile();
    const [status, setStatus] = useState<VoiceStatus>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const session = useRef<string | undefined>(undefined);
    const mounted = useRef(true);
    const operating = useRef(false);
    useEffect(() => {
        onBusy(busy || !!status?.recording || !!status?.uri);
    }, [busy, status, onBusy]);
    useEffect(() => {
        mounted.current = true;
        let polling = false;
        const cancel = () => {
            const id = session.current;
            session.current = undefined;
            if (id) void TrainflowVoice?.cancelAsync(id).catch(() => {});
        };
        const background = AppState.addEventListener("change", (state) => {
            const id = session.current;
            if (state !== "active" && id)
                void TrainflowVoice?.stopAsync(id).catch(() => {});
        });
        const timer = setInterval(() => {
            const id = session.current;
            if (!id || polling || accountSignal.aborted || !TrainflowVoice)
                return;
            polling = true;
            void TrainflowVoice.statusAsync(id)
                .then((next) => {
                    if (
                        mounted.current &&
                        session.current === id &&
                        !accountSignal.aborted
                    ) {
                        setStatus(next);
                        if (next.error) setError(new Error(next.error));
                    }
                })
                .catch((failure) => {
                    if (
                        mounted.current &&
                        session.current === id &&
                        !accountSignal.aborted
                    )
                        setError(failure);
                })
                .finally(() => {
                    polling = false;
                });
        }, 250);
        accountSignal.addEventListener("abort", cancel, { once: true });
        return () => {
            mounted.current = false;
            clearInterval(timer);
            background.remove();
            accountSignal.removeEventListener("abort", cancel);
            cancel();
            onBusy(false);
        };
    }, [accountSignal, onBusy]);

    async function start() {
        if (operating.current || !TrainflowVoice) return;
        operating.current = true;
        setBusy(true);
        setError(undefined);
        try {
            const permission =
                await AudioModule.requestRecordingPermissionsAsync();
            if (!permission.granted)
                throw new Error(
                    "Microphone permission is required. You can attach an existing WAV instead.",
                );
            if (
                !mounted.current ||
                accountSignal.aborted ||
                AppState.currentState !== "active"
            )
                return;
            const result = await TrainflowVoice.startAsync(accountId);
            if (!mounted.current || accountSignal.aborted) {
                await TrainflowVoice.cancelAsync(result.id);
                return;
            }
            session.current = result.id;
            setStatus(result);
        } catch (failure) {
            if (mounted.current && !accountSignal.aborted) setError(failure);
        } finally {
            operating.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    async function stop() {
        const id = session.current;
        if (!id || operating.current || !TrainflowVoice) return;
        operating.current = true;
        setBusy(true);
        try {
            const result = await TrainflowVoice.stopAsync(id);
            if (mounted.current && session.current === id) {
                setStatus(result);
                if (result.error) setError(new Error(result.error));
            }
        } catch (failure) {
            if (mounted.current) setError(failure);
        } finally {
            operating.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    async function discard() {
        const id = session.current;
        if (!id || !TrainflowVoice) return;
        await TrainflowVoice.cancelAsync(id);
        session.current = undefined;
        if (mounted.current) {
            setStatus(undefined);
            setError(undefined);
        }
    }

    if (!TrainflowVoice)
        return (
            <Text tone="mutedText">
                Recording needs the Metrivum Android build. You can attach an
                existing WAV file instead.
            </Text>
        );
    return (
        <View style={{ gap: 12 }}>
            {!!error && <ErrorState error={error} />}
            <View style={{ alignItems: "center", gap: 2 }}>
                <Text
                    variant="display"
                    tone={status?.recording ? "danger" : "text"}
                    accessibilityLiveRegion="polite"
                >
                    {clock(status?.durationMillis || 0)}
                </Text>
                <Text variant="caption" tone="mutedText">
                    {status?.recording
                        ? "Recording… up to 5 minutes"
                        : "Up to 5 minutes"}
                </Text>
            </View>
            {status?.recording && (
                <ProgressBar
                    value={Math.round((status.meter || 0) * 100)}
                    max={100}
                    label="Microphone level"
                />
            )}
            {status?.recording ? (
                <Button
                    size="lg"
                    tone="danger"
                    icon="pause"
                    title="Stop recording"
                    loading={busy}
                    onPress={stop}
                />
            ) : !status?.uri ? (
                <Button
                    size="lg"
                    tone="primary"
                    icon="mic"
                    title="Start recording"
                    disabled={disabled}
                    loading={busy}
                    onPress={start}
                />
            ) : (
                <>
                    <AudioPlayback uri={status.uri} />
                    <Button
                        size="lg"
                        tone="primary"
                        icon="attach"
                        title="Attach to message"
                        loading={busy || disabled}
                        onPress={async () => {
                            if (!status.uri || operating.current) return;
                            operating.current = true;
                            setBusy(true);
                            setError(undefined);
                            try {
                                await onReady(status.uri);
                                await discard();
                            } catch (failure) {
                                if (mounted.current) setError(failure);
                            } finally {
                                operating.current = false;
                                if (mounted.current) setBusy(false);
                            }
                        }}
                    />
                    <Button
                        tone="ghost"
                        icon="delete"
                        title="Discard recording"
                        disabled={busy || disabled}
                        onPress={async () => {
                            try {
                                await discard();
                            } catch (failure) {
                                if (mounted.current) setError(failure);
                            }
                        }}
                    />
                </>
            )}
        </View>
    );
}
