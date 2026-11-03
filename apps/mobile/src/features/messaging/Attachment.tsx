import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, View, useWindowDimensions } from "react-native";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Sharing from "expo-sharing";
import { useIsFocused } from "expo-router/react-navigation";
import type { Schema } from "@metrivum/api-client-web";
import {
    Button,
    ErrorState,
    IconButton,
    LoadingState,
    ProgressBar,
    Text,
} from "@metrivum/ui-mobile";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { validateImageBounds } from "./model";

function base64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
            reject(new Error("Could not prepare the attachment."));
        reader.onload = () =>
            typeof reader.result === "string" && reader.result.includes(",")
                ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
                : reject(new Error("Invalid attachment data."));
        reader.readAsDataURL(blob);
    });
}

export function Attachment({
    messageId,
    attachment,
    visible = true,
}: {
    messageId: string;
    attachment: Schema<"AttachmentDto">;
    visible?: boolean;
}) {
 const nativeCopy = useNativeCopy().t;

    const { api, accountId, accountSignal } = useMobile();
    const [uri, setUri] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const file = useRef<File | undefined>(undefined);
    const mounted = useRef(true);
    const controller = useRef(new AbortController());
    const loading = useRef(false);
    const window = useWindowDimensions();
    const [aspectRatio, setAspectRatio] = useState(1);
    const audio = attachment.contentType.startsWith("audio/");
    const inlineImage = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ].includes(attachment.contentType);
    useEffect(() => {
        mounted.current = true;
        controller.current = new AbortController();
        const erase = () => {
            controller.current.abort();
            if (file.current?.exists) file.current.delete();
            file.current = undefined;
            if (mounted.current) setUri(undefined);
        };
        accountSignal.addEventListener("abort", erase);
        return () => {
            mounted.current = false;
            accountSignal.removeEventListener("abort", erase);
            erase();
        };
    }, [accountSignal]);
    const load = useCallback(async () => {
        if (loading.current || accountSignal.aborted) return;
        loading.current = true;
        setBusy(true);
        setError(undefined);
        try {
            if (inlineImage) validateImageBounds(attachment.size);
            if (attachment.size > 50 * 1024 * 1024)
                throw new Error("Attachment exceeds the mobile 50 MB limit.");
            const blob = (
                await api<Blob>({
                    path: `/api/v1/messaging/messages/${messageId}/attachments/${attachment.mediaId}`,
                    responseType: "blob",
                    signal: controller.current.signal,
                })
            ).data;
            if (inlineImage) validateImageBounds(blob.size);
            if (blob.size > 50 * 1024 * 1024)
                throw new Error("Attachment exceeds the mobile 50 MB limit.");
            const content = await base64(blob);
            if (!mounted.current || accountSignal.aborted) return;
            const extension =
                (
                    {
                        "audio/wav": "wav",
                        "audio/mpeg": "mp3",
                        "audio/mp4": "m4a",
                        "image/jpeg": "jpg",
                        "image/png": "png",
                        "image/webp": "webp",
                        "image/gif": "gif",
                        "application/pdf": "pdf",
                        "video/mp4": "mp4",
                    } as Record<string, string>
                )[attachment.contentType] || "bin";
            const local = new File(
                Paths.cache,
                `chat-${accountId}-${randomUUID()}.${extension}`,
            );
            file.current = local;
            local.create();
            local.write(content, { encoding: "base64" });
            if (inlineImage) {
                const dimensions = await Image.getSize(local.uri);
                validateImageBounds(blob.size, dimensions);
                if (!mounted.current || accountSignal.aborted) return;
                setAspectRatio(dimensions.width / dimensions.height);
                setUri(local.uri);
            } else if (audio) setUri(local.uri);
            else {
                if (!(await Sharing.isAvailableAsync()))
                    throw new Error(
                        "Opening files is not available on this device.",
                    );
                if (!mounted.current || accountSignal.aborted) return;
                await Sharing.shareAsync(local.uri, {
                    mimeType: attachment.contentType,
                    dialogTitle: "Open or export attachment",
                });
                if (local.exists) local.delete();
                file.current = undefined;
            }
        } catch (failure) {
            if (file.current?.exists) file.current.delete();
            file.current = undefined;
            if (mounted.current && !accountSignal.aborted) {
                setUri(undefined);
                setError(failure);
            }
        } finally {
            loading.current = false;
            if (mounted.current) setBusy(false);
        }
    }, [
        api,
        accountId,
        accountSignal,
        messageId,
        attachment.mediaId,
        attachment.contentType,
        attachment.size,
        audio,
        inlineImage,
    ]);
    useEffect(() => {
        if (inlineImage && visible && !uri && !error) void load();
    }, [inlineImage, visible, uri, error, load]);
    if (inlineImage)
        return (
            <View style={{ borderRadius: 10, overflow: "hidden" }}>
                {error ? (
                    <ErrorState error={error} retry={() => void load()} />
                ) : uri && visible ? (
                    <Image
                        source={{ uri }}
                        accessibilityLabel={nativeCopy("interface.Image attachment")}
                        accessible
                        resizeMode="contain"
                        style={{
                            width: "100%",
                            aspectRatio,
                            maxHeight: Math.min(window.height * 0.6, 420),
                        }}
                        onError={() => {
                            if (file.current?.exists) file.current.delete();
                            file.current = undefined;
                            setUri(undefined);
                            setError(
                                new Error("Unable to display this image."),
                            );
                        }}
                    />
                ) : busy ? (
                    <LoadingState />
                ) : (
                    <Text variant="caption" tone="mutedText">

                        {nativeCopy("interface.Image")}
                    </Text>
                )}
            </View>
        );
    const size =
        attachment.size >= 1024 * 1024
            ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.ceil(attachment.size / 1024)} KB`;
    return (
        <View style={{ gap: 6, minWidth: 180 }}>
            {!!error && <ErrorState error={error} />}
            {audio && uri ? (
                <AudioPlayback uri={uri} visible={visible} />
            ) : (
                <Button
                    size="sm"
                    icon={audio ? "play" : "attach"}
                    title={
                        audio
                            ? `Voice message · ${size}`
                            : `Open file · ${size}`
                    }
                    loading={busy}
                    onPress={load}
                />
            )}
        </View>
    );
}

const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function AudioPlayback({
    uri,
    visible = true,
}: {
    uri: string;
    visible?: boolean;
}) {
 const nativeCopy = useNativeCopy().t;

    const player = useAudioPlayer(uri);
    const status = useAudioPlayerStatus(player);
    const focused = useIsFocused();
    useEffect(() => {
        if (!focused || !visible) player.pause();
    }, [focused, visible, player]);
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") player.pause();
        });
        return () => {
            subscription.remove();
        };
    }, [player]);
    const position = status.currentTime || 0;
    const duration = status.duration || 0;
    return (
        <View style={{ gap: 6, minWidth: 180 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconButton
                    icon={status.playing ? "pause" : "play"}
                    label={status.playing ? nativeCopy("interface.Pause") : nativeCopy("interface.Play")}
                    filled
                    size={44}
                    onPress={async () => {
                        if (status.playing) player.pause();
                        else {
                            if (
                                status.didJustFinish ||
                                status.currentTime >= status.duration
                            )
                                await player.seekTo(0);
                            player.play();
                        }
                    }}
                />
                <View style={{ flex: 1, gap: 4 }}>
                    <ProgressBar
                        value={position}
                        max={duration || 1}
                        label={nativeCopy("interface.Playback position")}
                    />
                    <Text variant="caption" tone="mutedText">
                        {clock(position)} / {clock(duration)}
                    </Text>
                </View>
                <IconButton
                    icon="back"
                    label={nativeCopy("interface.Restart audio")}
                    tone="mutedText"
                    size={36}
                    onPress={() => {
                        void player.seekTo(0);
                    }}
                />
            </View>
        </View>
    );
}
