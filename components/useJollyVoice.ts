"use client";

import { useEffect, useRef, useState } from "react";

export function useJollyVoice(onSpeaking: (speaking: boolean) => void) {
  const [preparing, setPreparing] = useState(false);
  const [deviceVoice, setDeviceVoice] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const frame = useRef(0);
  const level = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const callback = useRef(onSpeaking);
  callback.current = onSpeaking;

  function stop() {
    sequence.current++;
    abort.current?.abort(); abort.current = null;
    cancelAnimationFrame(frame.current);
    if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = null; }
    analyserRef.current?.disconnect(); analyserRef.current = null;
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis?.cancel(); utterance.current = null;
    level.current = 0; setPreparing(false);
  }

  function fallback(id: number, text: string) {
    if (id !== sequence.current) return;
    setPreparing(false); setDeviceVoice(true);
    if (!("speechSynthesis" in window)) { callback.current(false); return; }
    const speech = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    const score = (v: SpeechSynthesisVoice) => (/natural|premium|enhanced/i.test(v.name) ? 20 : 0) + (/samantha|ava|aria|jenny|google uk english female/i.test(v.name) ? 10 : 0);
    speech.voice = voices.sort((a, b) => score(b) - score(a))[0] || null;
    speech.rate = 0.97; speech.pitch = 1; speech.volume = 0.95;
    let lastWord = 0;
    speech.onstart = () => {
      callback.current(true);
      const pulse = () => {
        const t = performance.now();
        level.current = Math.min(0.7, 0.12 + Math.abs(Math.sin(t / 95)) * 0.22 + Math.max(0, 1 - (t - lastWord) / 200) * 0.3);
        frame.current = requestAnimationFrame(pulse);
      };
      pulse();
    };
    speech.onboundary = () => { lastWord = performance.now(); };
    speech.onend = speech.onerror = () => { cancelAnimationFrame(frame.current); level.current = 0; callback.current(false); utterance.current = null; };
    utterance.current = speech; window.speechSynthesis.speak(speech);
  }

  function warmUp() {
    try {
      // Unlock playback in the user's send/toggle gesture, including mobile Safari.
      if (!context.current || context.current.state === "closed") context.current = new AudioContext();
      void context.current.resume().catch(() => {});
    } catch { /* A device voice remains available if Web Audio is unsupported. */ }
  }

  async function speak(text: string, token?: string) {
    stop(); warmUp();
    const id = sequence.current;
    const clean = text.replace(/[*_#`]/g, "").replace(/https?:\/\/\S+/g, "the link").trim();
    if (!token || !context.current) { fallback(id, clean); return; }
    setPreparing(true);
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("/api/jolly/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal });
      if (!response.ok) throw new Error("Voice unavailable");
      const bytes = await response.arrayBuffer();
      const ctx = context.current;
      if (id !== sequence.current || !ctx) return;
      const buffer = await ctx.decodeAudioData(bytes);
      if (id !== sequence.current) return;
      if (ctx.state !== "running") throw new Error("Audio paused");
      setPreparing(false); setDeviceVoice(false);
      const node = ctx.createBufferSource(); node.buffer = buffer;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      analyserRef.current = analyser;
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
      node.onended = () => {
        cancelAnimationFrame(frame.current); node.disconnect(); analyser.disconnect();
        analyserRef.current = null; source.current = null; level.current = 0; callback.current(false);
      };
      node.start(); animate(); callback.current(true);
    } catch { if (id === sequence.current) fallback(id, clean); }
    finally { clearTimeout(timeout); if (id === sequence.current) abort.current = null; }
  }

  useEffect(() => () => {
    sequence.current++; abort.current?.abort(); cancelAnimationFrame(frame.current);
    if (source.current) { source.current.onended = null; source.current.stop(); }
    analyserRef.current?.disconnect();
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis?.cancel(); void context.current?.close();
  }, []);
  return { speak, stop, warmUp, level, preparing, deviceVoice };
}
