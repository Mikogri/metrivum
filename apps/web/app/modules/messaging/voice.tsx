import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { IconButton } from "@metrivum/ui-web";
import styles from "./messaging.module.css";
export function wavFile(buffer: AudioBuffer): File {
    const length = Math.min(buffer.length, Math.floor(buffer.sampleRate * 300));
    const data = new ArrayBuffer(44 + length * 2);
    const view = new DataView(data);
    const text = (offset: number, value: string) => {
        [...value].forEach((c, i) =>
            view.setUint8(offset + i, c.charCodeAt(0)),
        );
    };
    text(0, "RIFF");
    view.setUint32(4, data.byteLength - 8, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, length * 2, true);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
    );
    for (let i = 0; i < length; i++) {
        const sample = Math.max(
            -1,
            Math.min(
                1,
                channels.reduce((n, c) => n + (c[i] ?? 0), 0) / channels.length,
            ),
        );
        view.setInt16(
            44 + i * 2,
            Math.round(sample * (sample < 0 ? 32768 : 32767)),
            true,
        );
    }
    return new File([data], "voice-message.wav", { type: "audio/wav" });
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** A stable, gently varied waveform for a recording, so each voice message has its own shape. */
function bars(seed: string, count = 36) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return Array.from({ length: count }, (_, i) => {
        h = Math.imul(h ^ (i + 1), 16777619);
        const wave = Math.sin((i / count) * Math.PI) * 0.55 + 0.25;
        return Math.round((wave + ((h >>> 0) % 100) / 300) * 100);
    });
}

/**
 * The voice message player: play/pause, a waveform that fills as it plays (click to seek) and the
 * time. The audio element is the real player; it stays in the DOM, just without native controls.
 */
export function VoicePlayer({ src, label, seed, durationMs, tone = "default", preview = false }: { preview?: boolean; src: string | null; label: string; seed: string; durationMs?: number | null; tone?: "default" | "mine" }) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
    const shape = useMemo(() => bars(seed), [seed]);
    const progress = duration ? Math.min(1, time / duration) : 0;
    return (
        <div className={styles.voicePlayer} data-tone={tone} role="group" aria-label={label}>
            <IconButton
                label={playing ? "Pause" : "Play"}
                variant="ghost"
                size="sm"
                isDisabled={!src}
                icon={playing ? <Pause aria-hidden="true" fill={preview ? "none" : "currentColor"} /> : <Play aria-hidden="true" fill={preview ? "none" : "currentColor"} />}
                className={preview ? undefined : styles.voicePlayback}
                onPress={() => {
                    const el = audio.current;
                    if (!el) return;
                    if (el.paused) void el.play().catch(() => setPlaying(false));
                    else el.pause();
                }}
            />
            <span
                className={styles.voiceBars}
                aria-hidden="true"
                onClick={(event) => {
                    const el = audio.current;
                    if (!el || !duration) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    el.currentTime = ((event.clientX - rect.left) / rect.width) * duration;
                }}
            >
                {shape.map((height, i) => (
                    <i key={i} style={{ height: `${height}%` }} data-played={i / shape.length < progress || undefined} />
                ))}
            </span>
            <span className={styles.voiceTime}>{clock(playing || time ? time : duration)}</span>
            {src ? (
                <audio
                    ref={audio}
                    src={src}
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                        if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
                    }}
                    onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                        setPlaying(false);
                        setTime(0);
                    }}
                />
            ) : null}
        </div>
    );
}

/** A recorded message waiting to be sent, in the composer row where the text would be. */
export function VoicePreview({ file, disabled, cancel }: { file: File; disabled: boolean; cancel: () => void }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return (
        <div className={styles.voiceBar}>
            <IconButton label="Delete recording" icon={<Trash2 />} variant="ghost" size="sm" isDisabled={disabled} onPress={cancel} />
            <VoicePlayer preview src={url || null} label="Preview voice message" seed={`${file.name}${file.size}`} />
        </div>
    );
}

export function VoiceRecorder({ disabled, onFile, onBusyChange }: {
    disabled: boolean; onFile: (file: File) => void; onBusyChange: (busy: boolean) => void;
}) {
    const [phase, setPhase] = useState<"idle" | "preparing" | "recording">("idle");
    const [elapsed, setElapsed] = useState(0);
    const [levels, setLevels] = useState<number[]>(Array(32).fill(2));
    const [error, setError] = useState("");
    const generation = useRef(0);
    const recorder = useRef<MediaRecorder | null>(null);
    const context = useRef<AudioContext | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    useEffect(() => { onBusyChange(phase !== "idle"); }, [phase, onBusyChange]);
    function release() {
        clearInterval(timer.current);
        recorder.current?.stream.getTracks().forEach(track => track.stop());
        if (context.current) { void context.current.close(); context.current = null; }
    }
    function cancel() {
        generation.current++;
        if (recorder.current?.state === "recording") recorder.current.stop();
        release();
        setPhase("idle");
    }
    useEffect(() => () => {
        generation.current++;
        if (recorder.current?.state === "recording") recorder.current.stop();
        clearInterval(timer.current);
        recorder.current?.stream.getTracks().forEach(track => track.stop());
        if (context.current) void context.current.close();
    }, []);
    async function start() {
        const current = ++generation.current;
        setError(""); setPhase("preparing"); setElapsed(0);
        let captured: MediaStream | undefined;
        try {
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
                throw new Error("Microphone recording is unavailable. Attach a WAV recording instead.");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
            captured = stream;
            if (generation.current !== current) { stream.getTracks().forEach(t => t.stop()); return; }
            const active = new MediaRecorder(stream);
            recorder.current = active;
            const audio = new AudioContext();
            context.current = audio;
            const analyser = audio.createAnalyser();
            analyser.fftSize = 256;
            audio.createMediaStreamSource(stream).connect(analyser);
            const samples = new Uint8Array(analyser.fftSize);
            const chunks: Blob[] = [];
            active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            active.onstop = () => {
                if (generation.current !== current) { stream.getTracks().forEach(t => t.stop()); return; }
                release();
                setPhase("preparing");
                void (async () => {
                    const decoder = new AudioContext();
                    try {
                        const bytes = await new Blob(chunks, { type: active.mimeType }).arrayBuffer();
                        const buffer = await decoder.decodeAudioData(bytes);
                        if (generation.current === current) onFile(wavFile(buffer));
                    } finally { await decoder.close(); }
                })().catch(() => {
                    if (generation.current === current) setError("Could not prepare the recording. Try again or attach a WAV file.");
                }).finally(() => { if (generation.current === current) setPhase("idle"); });
            };
            active.start(); setPhase("recording");
            const began = Date.now();
            timer.current = setInterval(() => {
                const seconds = Math.floor((Date.now() - began) / 1000);
                setElapsed(Math.min(seconds, 300));
                analyser.getByteTimeDomainData(samples);
                setLevels(Array.from({ length: 32 }, (_, i) => Math.max(2, Math.abs((samples[i * 8] ?? 128) - 128) / 128 * 32)));
                if (seconds >= 300 && active.state === "recording") active.stop();
            }, 100);
        } catch (e) {
            captured?.getTracks().forEach(t => t.stop());
            if (generation.current !== current) return;
            release();
            if (generation.current === current) { setPhase("idle"); setError(e instanceof Error ? e.message : "Microphone access failed."); }
        }
    }
    // Idle: just the microphone. Recording: the whole composer row becomes the recorder.
    if (phase === "idle") {
        return <>
            <IconButton label="Record voice message" variant="ghost" size="sm" icon={<Mic />} isDisabled={disabled} onPress={() => void start()} />
            {error && <span role="alert" className={styles.voiceError}>{error}</span>}
        </>;
    }
    return <div className={styles.voiceBar} data-recording={phase === "recording" || undefined}>
        <IconButton label="Cancel recording" icon={<Trash2 />} variant="ghost" size="sm" onPress={cancel} />
        <span className={styles.recDot} aria-hidden="true" />
        <span role="status" className={styles.voiceTime}>{phase === "recording" ? clock(elapsed) : "Preparing..."}</span>
        <span className={styles.waveform} role="img" aria-label="Live audio waveform">{levels.map((level, index) => <i key={index} style={{ height: phase === "recording" ? level : 2 }} />)}</span>
        <IconButton label="Stop recording" className={styles.recordingStop} variant="ghost" size="sm" icon={<Square fill="currentColor" />} isDisabled={phase !== "recording"} onPress={() => recorder.current?.stop()} />
    </div>;
}
