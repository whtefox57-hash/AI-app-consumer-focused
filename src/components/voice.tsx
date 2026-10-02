"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import { api } from "@/lib/browser-db";
export function Voice({
  enabled,
  voice,
  send,
  onError,
}: {
  enabled: boolean;
  voice: string;
  send: (text: string) => Promise<string>;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState("off");
  const [muted, setMuted] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const micMute = useRef(false);
  const [transcript, setTranscript] = useState("");
  const alive = useRef(false);
  const mutedRef = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const media = useRef<MediaRecorder | null>(null);
  const speaker = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const session = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  const frame = useRef(0);
  const mode = useRef("off");
  const transition = (s: string) => {
    mode.current = s;
    setState(s);
  };
  function stop() {
    session.current++;
    alive.current = false;
    cancelAnimationFrame(frame.current);
    if (media.current?.state === "recording") media.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      speaker.current?.stop();
    } catch {}
    speaker.current = null;
    if (context.current && context.current.state !== "closed")
      void context.current.close().catch(() => {});
    context.current = null;
    window.speechSynthesis?.cancel();
    transition("off");
  }
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && alive.current) {
        stop();
        onError(
          "Voice paused when the app moved into the background. Restart when you return.",
        );
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, []);
  async function listen() {
    if (!alive.current || !stream.current) return;
    const currentSession = session.current;
    transition("listening");
    const formats = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mime = formats.find((v) => MediaRecorder.isTypeSupported(v));
    if (!mime)
      throw new Error("This browser has no supported recording format.");
    const recorder = new MediaRecorder(stream.current, { mimeType: mime });
    media.current = recorder;
    const parts: Blob[] = [];
    let spoke = false;
    let began = Date.now();
    let lastSound = began;
    let voiced = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    recorder.onstop = async () => {
      if (
        !alive.current ||
        currentSession !== session.current ||
        micMute.current ||
        !spoke
      ) {
        if (
          alive.current &&
          currentSession === session.current &&
          !micMute.current
        )
          void listen();
        else if (alive.current && currentSession === session.current)
          transition("muted");
        return;
      }
      transition("processing");
      try {
        const recording = new Blob(parts, { type: mime });
        const result = await api<{ text: string }>("speech/transcribe", {
          method: "POST",
          body: recording,
          headers: { "Content-Type": mime },
        });
        if (!alive.current || currentSession !== session.current) return;
        if (!result.text.trim()) {
          void listen();
          return;
        }
        setTranscript(result.text);
        const answer = await sendRef.current(result.text);
        if (!alive.current || currentSession !== session.current) return;
        transition("speaking");
        const speech = await api<{ audio: string }>("speech/speak", {
          method: "POST",
          body: JSON.stringify({ text: answer.slice(0, 1600), voice }),
        });
        if (!alive.current || currentSession !== session.current) return;
        const bytes = Uint8Array.from(atob(speech.audio), (c) =>
          c.charCodeAt(0),
        );
        const ctx = context.current!;
        const decoded = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
        if (!alive.current || currentSession !== session.current) return;
        const player = ctx.createBufferSource();
        player.buffer = decoded;
        player.connect(gain.current!);
        speaker.current = player;
        gain.current!.gain.value = mutedRef.current ? 0 : 1;
        player.onended = () => {
          if (alive.current && currentSession === session.current) {
            if (micMute.current) transition("muted");
            else void listen();
          }
        };
        player.start();
      } catch (e) {
        if (!alive.current || currentSession !== session.current) return;
        stop();
        onError(e instanceof Error ? e.message : "Voice failed.");
      }
    };
    recorder.start();
    const analyser = context.current!.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.current!.createMediaStreamSource(stream.current);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let previous = Date.now();
    const monitor = () => {
      if (!alive.current || recorder.state !== "recording") {
        source.disconnect();
        return;
      }
      analyser.getByteTimeDomainData(samples);
      const level = Math.sqrt(
        samples.reduce((n, x) => n + ((x - 128) / 128) ** 2, 0) /
          samples.length,
      );
      const now = Date.now();
      if (level > 0.035) {
        voiced += now - previous;
        lastSound = now;
        if (voiced > 250) spoke = true;
      }
      previous = now;
      if ((spoke && now - lastSound > 1100) || now - began > 15000) {
        recorder.stop();
        source.disconnect();
        return;
      }
      frame.current = requestAnimationFrame(monitor);
    };
    monitor();
  }
  async function start() {
    const attempt = ++session.current;
    try {
      if (!enabled)
        throw new Error(
          "Voice requires a connected and tested server speech provider.",
        );
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Microphone recording is not supported by this browser.",
        );
      micMute.current = false;
      setMicMuted(false);
      transition("permission");
      context.current = new AudioContext();
      gain.current = context.current.createGain();
      gain.current.connect(context.current.destination);
      await context.current.resume();
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (attempt !== session.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      alive.current = true;
      await listen();
    } catch (e) {
      if (attempt !== session.current) return;
      stop();
      onError(e instanceof Error ? e.message : "Microphone access was denied.");
    }
  }
  return (
    <div className="voice-control">
      <button
        type="button"
        className={state !== "off" ? "voice active" : "voice"}
        onClick={() => (state === "off" ? void start() : stop())}
        aria-label={
          state === "off" ? "Start voice session" : "Stop voice session"
        }
      >
        <Mic size={17} />
        <span>
          {state === "off"
            ? "Talk with your cast"
            : state === "permission"
              ? "Allow microphone"
              : state === "listening"
                ? "Listening…"
                : state === "processing"
                  ? "Thinking…"
                  : state === "muted"
                    ? "Microphone muted"
                    : "Speaking…"}
        </span>
      </button>
      {state !== "off" && (
        <>
          <button
            type="button"
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={() => {
              const muted = !micMuted;
              micMute.current = muted;
              setMicMuted(muted);
              stream.current
                ?.getAudioTracks()
                .forEach((t) => (t.enabled = !muted));
              if (muted && media.current?.state === "recording")
                media.current.stop();
              if (!muted && alive.current && mode.current === "muted")
                void listen();
            }}
          >
            <MicOff size={16} />
          </button>
          <button
            type="button"
            aria-label={muted ? "Unmute speaker" : "Mute speaker"}
            onClick={() => {
              mutedRef.current = !muted;
              setMuted(!muted);
              if (gain.current) gain.current.gain.value = !muted ? 0 : 1;
            }}
          >
            {muted ? <MicOff size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button" aria-label="Stop voice" onClick={stop}>
            <Square size={16} />
          </button>
        </>
      )}
      {transcript && (
        <small className="voice-transcript">Heard: {transcript}</small>
      )}
    </div>
  );
}
