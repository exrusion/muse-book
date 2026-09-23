"use client";

import { useEffect, useRef, useState } from "react";

export function useJollyVoice(onSpeaking: (speaking: boolean) => void) {
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [deviceVoice, setDeviceVoice] = useState(false);
  const worker = useRef<Worker | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const sequence = useRef(0);
  const pending = useRef("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const level = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const unavailable = useRef(false);
  const callback = useRef(onSpeaking);
  callback.current = onSpeaking;

  function stop() {
    sequence.current++;
    pending.current = "";
    if (timeout.current) clearTimeout(timeout.current);
    cancelAnimationFrame(frame.current);
    if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = null; }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis?.cancel();
    utterance.current = null;
    worker.current?.postMessage({ type: "cancel", id: sequence.current });
    level.current = 0;
    setPreparing(false);
  }

  function fallback(id: number, text: string) {
    if (id !== sequence.current) return;
    if (timeout.current) clearTimeout(timeout.current);
    // Invalidate delayed neural audio before using a device voice.
    sequence.current++;
    worker.current?.postMessage({ type: "cancel", id: sequence.current });
    pending.current = "";
    setPreparing(false);
    setDeviceVoice(true);
    if (!("speechSynthesis" in window)) { callback.current(false); return; }
    const speech = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    const score = (v: SpeechSynthesisVoice) => (/natural|premium|enhanced/i.test(v.name) ? 20 : 0) + (/samantha|ava|aria|jenny|google uk english female/i.test(v.name) ? 10 : 0);
    speech.voice = voices.sort((a, b) => score(b) - score(a))[0] || null;
    speech.rate = 0.97; speech.pitch = 1; speech.volume = 0.95;
    speech.onstart = () => { level.current = 0.25; callback.current(true); };
    speech.onboundary = () => { level.current = 0.6; };
    speech.onend = speech.onerror = () => { level.current = 0; callback.current(false); utterance.current = null; };
    utterance.current = speech;
    window.speechSynthesis.speak(speech);
  }

  function warmUp() {
    try {
      // Called in the send/toggle gesture so mobile browsers permit later playback.
      if (!context.current || context.current.state === "closed") context.current = new AudioContext();
      void context.current.resume().catch(() => {});
      if (worker.current || unavailable.current) return;
      worker.current = new Worker("/jolly-voice-worker.js", { type: "module" });
      worker.current.onmessage = ({ data }) => {
        if (data.type === "progress") { setProgress(data.progress); return; }
        if (data.type === "ready") { setProgress(null); return; }
        if (data.type === "unavailable") {
          unavailable.current = true;
          if (pending.current) fallback(sequence.current, pending.current);
          return;
        }
        if (data.id !== sequence.current) return;
        if (data.type === "error") { fallback(data.id, pending.current); return; }
        if (data.type !== "audio") return;
        const ctx = context.current;
        if (!ctx || ctx.state !== "running" || !(data.samples instanceof Float32Array)) { fallback(data.id, pending.current); return; }
        if (timeout.current) clearTimeout(timeout.current);
        setPreparing(false); setDeviceVoice(false); pending.current = "";
        const buffer = ctx.createBuffer(1, data.samples.length, data.sampleRate);
        buffer.copyToChannel(data.samples, 0);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
        node.connect(analyser); analyser.connect(ctx.destination);
        const waveform = new Uint8Array(analyser.fftSize);
        const animate = () => {
          analyser.getByteTimeDomainData(waveform);
          let power = 0;
          for (const sample of waveform) power += ((sample - 128) / 128) ** 2;
          level.current = Math.min(1, Math.sqrt(power / waveform.length) * 6);
          frame.current = requestAnimationFrame(animate);
        };
        source.current = node;
        node.onended = () => { cancelAnimationFrame(frame.current); node.disconnect(); analyser.disconnect(); source.current = null; level.current = 0; callback.current(false); };
        node.start(); animate(); callback.current(true);
      };
      worker.current.onerror = () => {
        unavailable.current = true;
        worker.current?.terminate(); worker.current = null;
        if (pending.current) fallback(sequence.current, pending.current);
      };
      worker.current.postMessage({ type: "load" });
    } catch { unavailable.current = true; }
  }

  function speak(text: string) {
    stop(); warmUp();
    const id = sequence.current;
    const clean = text.replace(/[*_#`]/g, "").replace(/https?:\/\/\S+/g, "the link").trim();
    pending.current = clean;
    if (unavailable.current || !worker.current) { fallback(id, clean); return; }
    setPreparing(true);
    worker.current.postMessage({ type: "speak", text: clean, id });
    // Keep chat responsive if the first model download or a slow device takes too long.
    timeout.current = setTimeout(() => fallback(id, clean), 30_000);
  }

  useEffect(() => () => {
    sequence.current++;
    if (timeout.current) clearTimeout(timeout.current);
    cancelAnimationFrame(frame.current);
    if (source.current) { source.current.onended = null; source.current.stop(); }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis?.cancel(); worker.current?.terminate();
    void context.current?.close();
  }, []);
  return { speak, stop, warmUp, level, preparing, progress, deviceVoice };
}
