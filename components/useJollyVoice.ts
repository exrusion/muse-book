"use client";

import { useEffect, useRef, useState } from "react";

export function useJollyVoice(onSpeaking: (speaking: boolean) => void) {
  const [preparing, setPreparing] = useState(false), [deviceVoice, setDeviceVoice] = useState(false);
  const [error, setError] = useState(""), [hasAudio, setHasAudio] = useState(false), [canReplay, setCanReplay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null), analyserRef = useRef<AnalyserNode | null>(null);
  const bufferSource = useRef<AudioBufferSourceNode | null>(null);
  const decoded = useRef<AudioBuffer | null>(null);
  const abort = useRef<AbortController | null>(null), sequence = useRef(0), frame = useRef(0), level = useRef(0);
  const objectUrl = useRef(""), latest = useRef<{ text: string; token?: string } | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null), speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onSpeaking); callback.current = onSpeaking;

  function finish() { cancelAnimationFrame(frame.current); level.current = 0; callback.current(false); }
  function stop() {
    sequence.current++; abort.current?.abort(); abort.current = null;
    if (bufferSource.current) { bufferSource.current.onended = null; bufferSource.current.stop(); bufferSource.current.disconnect(); bufferSource.current = null; }
    audioRef.current?.pause();
    if (speechTimer.current) clearTimeout(speechTimer.current);
    if (utterance.current) { utterance.current.onstart = null; utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis?.cancel(); utterance.current = null;
    finish(); setPreparing(false);
  }
  function warmUp() {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!context.current || context.current.state === "closed") context.current = new AudioContextClass();
      // Start a silent frame during the actual click, before waiting for the chat reply.
      const ctx = context.current, unlock = ctx.createBufferSource();
      unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); unlock.connect(ctx.destination);
      unlock.onended = () => unlock.disconnect(); unlock.start();
      void ctx.resume().catch(() => {});
    } catch { /* Native audio playback also works without Web Audio. */ }
  }
  function animate() {
    cancelAnimationFrame(frame.current);
    const analyser = bufferSource.current ? analyserRef.current : null, waveform = analyser ? new Uint8Array(analyser.fftSize) : null;
    const tick = () => {
      const audio = audioRef.current;
      if (!bufferSource.current && (!audio || audio.paused || audio.ended)) { finish(); return; }
      if (analyser && waveform) {
        analyser.getByteTimeDomainData(waveform);
        let power = 0; for (const sample of waveform) power += ((sample - 128) / 128) ** 2;
        level.current = Math.min(1, Math.sqrt(power / waveform.length) * 6);
      } else level.current = 0.12 + Math.abs(Math.sin((audio?.currentTime || 0) * 13)) * 0.3;
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }
  async function play(id: number) {
    const audio = audioRef.current; if (!audio || id !== sequence.current) return;
    const ctx = context.current;
    if (ctx && ctx.state !== "running") {
      // A suspended context must be resumed; routing audio into it would be silent.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([ctx.resume().catch(() => {}), new Promise<void>(resolve => { timer = setTimeout(resolve, 1200); })]);
      if (timer) clearTimeout(timer);
    }
    if (id !== sequence.current) return;
    if (ctx?.state === "running" && decoded.current) {
      const source = ctx.createBufferSource(), analyser = ctx.createAnalyser();
      analyser.fftSize = 256; source.buffer = decoded.current;
      source.connect(analyser); analyser.connect(ctx.destination);
      analyserRef.current?.disconnect(); analyserRef.current = analyser;
      bufferSource.current = source;
      source.onended = () => {
        source.disconnect(); analyser.disconnect();
        if (bufferSource.current === source) { bufferSource.current = null; finish(); }
      };
      source.start(); setPreparing(false); setError(""); callback.current(true); animate();
      return;
    }
    try {
      audio.currentTime = 0;
      await audio.play();
      if (id !== sequence.current) return;
      setPreparing(false); setError("");
    } catch {
      if (id === sequence.current) { finish(); setPreparing(false); setError("Tap Play reply to enable sound."); }
    }
  }
  function fallback(id: number, text: string) {
    if (id !== sequence.current) return;
    setPreparing(false); setDeviceVoice(true);
    if (!("speechSynthesis" in window)) { setError("Voice is unavailable. Tap Play reply to try again."); finish(); return; }
    const speech = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    const score = (v: SpeechSynthesisVoice) => (/natural|premium|enhanced/i.test(v.name) ? 20 : 0) + (/samantha|ava|aria|jenny|google uk english female/i.test(v.name) ? 10 : 0);
    speech.voice = voices.sort((a,b) => score(b)-score(a))[0] || null;
    speech.rate = 0.97; speech.pitch = 1; speech.volume = 1;
    speechTimer.current = setTimeout(() => { if(id === sequence.current) { setError("Tap Play reply to enable sound."); finish(); } }, 4000);
    speech.onstart = () => {
      if(id !== sequence.current) return;
      if(speechTimer.current) clearTimeout(speechTimer.current);
      setError(""); callback.current(true);
      const pulse = () => { level.current = 0.12 + Math.abs(Math.sin(performance.now()/95))*0.35; frame.current = requestAnimationFrame(pulse); }; pulse();
    };
    speech.onend = () => { if(id !== sequence.current) return; if(speechTimer.current) clearTimeout(speechTimer.current); utterance.current = null; finish(); };
    speech.onerror = () => { if(id !== sequence.current) return; if(speechTimer.current) clearTimeout(speechTimer.current); utterance.current = null; finish(); setError("Voice could not start. Tap Play reply to try again."); };
    utterance.current = speech; window.speechSynthesis.resume(); window.speechSynthesis.speak(speech);
  }
  async function speak(text: string, token?: string) {
    stop(); warmUp(); setError(""); setDeviceVoice(false); setHasAudio(false); setCanReplay(true);
    const id = sequence.current, clean = text.replace(/[*_#`]/g, "").replace(/https?:\/\/\S+/g, "the link").trim();
    latest.current = { text: clean, token }; decoded.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = "";
    const audio = audioRef.current; if (audio) { audio.removeAttribute("src"); audio.load(); }
    if (!token || !audio) { fallback(id, clean); return; }
    setPreparing(true);
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch("/api/jolly/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal });
      if (!response.ok) throw new Error("Voice unavailable");
      const blob = await response.blob(); if (id !== sequence.current) return;
      objectUrl.current = URL.createObjectURL(blob); audio.src = objectUrl.current; audio.load(); setHasAudio(true);
      if (context.current) {
        try { const buffer = await context.current.decodeAudioData(await blob.arrayBuffer()); if (id !== sequence.current) return; decoded.current = buffer; }
        catch { /* The native audio element remains available for unsupported codecs. */ }
      }
      await play(id);
    } catch { if(id === sequence.current) fallback(id, clean); }
    finally { clearTimeout(timeout); if(id === sequence.current) abort.current = null; }
  }
  function replay() {
    warmUp();
    if (objectUrl.current) { stop(); setError(""); void play(sequence.current); }
    else if(latest.current) void speak(latest.current.text, latest.current.token);
  }
  useEffect(() => {
    const audio = audioRef.current;
    const playing = () => {
      if (bufferSource.current) { bufferSource.current.onended = null; bufferSource.current.stop(); bufferSource.current.disconnect(); bufferSource.current = null; }
      setPreparing(false); setError(""); callback.current(true); animate();
    };
    const failed = () => { if(objectUrl.current) { finish(); setPreparing(false); setError("Audio could not play. Tap Play reply to try again."); } };
    audio?.addEventListener("playing", playing); audio?.addEventListener("pause", finish); audio?.addEventListener("ended", finish); audio?.addEventListener("error", failed);
    return () => {
      sequence.current++; abort.current?.abort(); cancelAnimationFrame(frame.current);
      if(speechTimer.current) clearTimeout(speechTimer.current);
      audio?.removeEventListener("playing", playing); audio?.removeEventListener("pause", finish); audio?.removeEventListener("ended", finish); audio?.removeEventListener("error", failed); audio?.pause();
      if(utterance.current) { utterance.current.onstart = null; utterance.current.onend = null; utterance.current.onerror = null; }
      window.speechSynthesis?.cancel();
      if (bufferSource.current) { bufferSource.current.onended = null; bufferSource.current.stop(); bufferSource.current.disconnect(); }
      analyserRef.current?.disconnect();
      bufferSource.current = null; decoded.current = null; analyserRef.current = null;
      void context.current?.close(); context.current = null;
      if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  return { speak, stop, warmUp, replay, audioRef, level, preparing, deviceVoice, error, hasAudio, canReplay };
}
