import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button, IconButton } from "@trainflow/ui-web";
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
export function VoicePreview({ file, disabled, cancel }: { file: File; disabled: boolean; cancel: () => void }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return <div className={styles.voicePreview}>
        <span>Voice message ready</span>
        <audio src={url || undefined} controls aria-label="Preview voice message" />
        <Button size="sm" isDisabled={disabled} onPress={cancel}>Cancel</Button>
    </div>;
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
    return <>
        <IconButton label={phase === "recording" ? "Stop recording" : "Record voice message"}
            className={phase === "recording" ? styles.recordingStop : undefined}
            variant="ghost" size="sm" icon={phase === "recording" ? <Square fill="currentColor" /> : <Mic />}
            isDisabled={disabled || phase === "preparing"}
            onPress={() => { if (phase === "recording") recorder.current?.stop(); else void start(); }} />
        {phase !== "idle" && <div className={styles.recording}>
            <span role="status">{phase === "recording" ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "Preparing..."}</span>
            {phase === "recording" && <span className={styles.waveform} role="img" aria-label="Live audio waveform">{levels.map((level, index) => <i key={index} style={{ height: level }} />)}</span>}
            <Button size="sm" aria-label="Cancel recording" onPress={cancel}>Cancel</Button>
        </div>}
        {error && <span role="alert" className={styles.error}>{error}</span>}
    </>;
}
