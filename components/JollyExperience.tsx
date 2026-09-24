"use client";

import { Canvas } from "@react-three/fiber";
import Image from "next/image";
import { Component, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { JollyPlushScene } from "./JollyPlush";
import { useJollyVoice } from "./useJollyVoice";
import { ACESFilmicToneMapping } from "three";
import styles from "./JollyExperience.module.css";

type JollyState = "idle" | "thinking" | "speaking" | "happy";
type ChatMessage = { role: "user" | "assistant"; content: string };
type WebGLState = "checking" | "supported" | "unsupported";

const starters = [
  "What is Muse Agents?",
  "Help me create a Muse Agent",
  "Which AI model should I choose?"
];

function statusCopy(state: JollyState) {
  if (state === "thinking") return "Jolly is thinking";
  if (state === "speaking") return "Jolly is speaking";
  if (state === "happy") return "Jolly is happy to see you";
  return "Jolly is here";
}

function JollyPoster() {
  return (
    <div className={styles.poster} role="img" aria-label="Full-body character artwork of Jolly">
      <img src="/jolly-reference.webp" width="1200" height="1200" alt="" />
      <span>3D preview needs WebGL. You can still chat with Jolly.</span>
    </div>
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function JollyExperience() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "Hey, I’m Jolly. I’m the living mascot of Muse Agents. Ask me anything about the town, its agents, or which AI brain fits your idea." }]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<JollyState>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [error, setError] = useState("");
  const [webglState, setWebglState] = useState<WebGLState>("checking");
  const messagesRef = useRef<HTMLDivElement>(null);
  const voiceEnabledRef = useRef(true);
  const inFlight = useRef(false);
  const pendingReply = useRef<string | null>(null);
  const publishReply = () => {
    const reply = pendingReply.current;
    if (reply === null) return;
    pendingReply.current = null;
    setMessages(current => [...current, { role: "assistant", content: reply }]);
  };
  const voice = useJollyVoice((speaking) => {
    // Reveal the same response when sound actually starts, not when TTS starts loading.
    if (speaking) publishReply();
    setState(current => current === "thinking" ? current : speaking ? "speaking" : "idle");
  });
  useEffect(() => { if (voice.error) publishReply(); }, [voice.error]);

  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }); }, [messages, state]);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setWebglState(context ? "supported" : "unsupported");
    } catch {
      setWebglState("unsupported");
    }
  }, []);

  const askJolly = async (question: string) => {
    const message = question.trim();
    if (!message || inFlight.current) return;
    inFlight.current = true;
    publishReply();
    voice.stop();
    if (voiceEnabledRef.current) voice.warmUp();
    setInput("");
    setError("");
    setState("thinking");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await fetch("/api/jolly/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history: previous }) });
      const body = (await response.json()) as { reply?: string; voiceToken?: string; error?: string };
      if (!response.ok || !body.reply) throw new Error(body.error || "Jolly could not answer right now.");
      const reply = body.reply;
      pendingReply.current = reply;
      setState("idle");
      if (voiceEnabledRef.current) await voice.speak(reply, body.voiceToken);
      else publishReply();
    } catch (caught) {
      publishReply();
      setState("idle");
      setError(caught instanceof Error ? caught.message : "Jolly could not answer right now.");
    } finally { inFlight.current = false; }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void askJolly(input); };
  const toggleVoice = () => {
    voiceEnabledRef.current = !voiceEnabledRef.current;
    if (!voiceEnabledRef.current) { publishReply(); voice.stop(); setState(current => current === "thinking" ? current : "idle"); }
    else voice.warmUp();
    setVoiceEnabled(voiceEnabledRef.current);
  };
  const tapJolly = () => {
    if (state !== "thinking" && state !== "speaking") { setState("happy"); window.setTimeout(() => setState("idle"), 1050); }
  };

  return (
    <section className={styles.experience} aria-label="Talk with Jolly, the Muse Agents mascot">
      <div className={styles.stage}>
        <div className={styles.stageTop}>
          <span className={styles.livePill}><i /> {webglState === "supported" ? "Live 3D mascot" : webglState === "checking" ? "Loading Jolly" : "Jolly is online"}</span>
          <button className={styles.voiceButton} type="button" onClick={toggleVoice} aria-pressed={voiceEnabled}>{voiceEnabled ? "Voice on" : "Voice off"}</button>
        </div>
        <div className={styles.canvasWrap}>
          {webglState === "supported" ? (
            <CanvasErrorBoundary fallback={<JollyPoster />} onFail={() => setWebglState("unsupported")}>
              <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 0.15, 6.3], fov: 31, near: 0.1, far: 30 }} gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.94 }} aria-label="Interactive 3D model of Jolly">
                <JollyPlushScene state={state} onTap={tapJolly} speechLevel={voice.level} />
              </Canvas>
            </CanvasErrorBoundary>
          ) : <JollyPoster />}
          <div className={`${styles.stateBubble} ${styles[state]}`} aria-live="polite"><span>{state === "thinking" ? "···" : state === "speaking" ? "◖◗" : "✦"}</span>{voice.preparing ? "Jolly is getting ready to speak…" : statusCopy(state)}</div>
          <div className={styles.orbitOne} /><div className={styles.orbitTwo} />
        </div>
        <p className={styles.stageHint}>{webglState === "supported" ? "Move your cursor around Jolly. Tap Jolly for a reaction." : "Jolly’s chat and voice remain fully available."}</p>
      </div>

      <div className={styles.chatCard}>
        <div className={styles.chatHead}>
          <div className={styles.miniJolly}><Image src="/jolly-reference.webp" alt="Jolly Bot" width={1200} height={1200} sizes="104px" /></div>
          <div><strong>Jolly</strong><small>The face and guide of Muse Agents</small></div>
          <span className={styles.online}>Online</span>
        </div>
        <div className={styles.messages} ref={messagesRef} aria-live="polite">
          {messages.map((message, index) => (
            <div className={`${styles.message} ${message.role === "user" ? styles.user : styles.jolly}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" && <span className={styles.messageMark}>J</span>}<p>{message.content}</p>
            </div>
          ))}
          {(state === "thinking" || voice.preparing) && <div className={`${styles.message} ${styles.jolly}`}><span className={styles.messageMark}>J</span><p className={styles.typing}><i /><i /><i /></p></div>}
        </div>
        {messages.length < 4 && <div className={styles.starters}>{starters.map((starter) => <button key={starter} type="button" onClick={() => void askJolly(starter)}>{starter}</button>)}</div>}
        <div className={styles.replyAudio}>
          <audio ref={voice.audioRef} preload="auto" hidden aria-label="Jolly’s spoken reply" />
          {voice.canReplay && !voice.preparing && state !== "thinking" && <button type="button" disabled={voice.preparing || state === "thinking"} onClick={()=>{voiceEnabledRef.current=true;setVoiceEnabled(true);voice.replay();}}>{voice.error ? "Enable sound" : "↻ Replay reply"}</button>}
          {voice.error && <p role="status">{voice.error}</p>}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <form className={styles.composer} onSubmit={submit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} maxLength={600} placeholder="Ask Jolly anything…" aria-label="Message Jolly" />
          <button type="submit" disabled={!input.trim() || state === "thinking" || voice.preparing} aria-label="Send message"><span>↑</span></button>
        </form>
        <p className={styles.disclaimer}>{voice.deviceVoice && voiceEnabled ? "Natural voice is unavailable right now. Using your device’s voice. " : ""}Jolly uses AI and may occasionally make mistakes.</p>
      </div>
    </section>
  );
}

