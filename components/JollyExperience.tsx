"use client";

import { Canvas } from "@react-three/fiber";
import { Component, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { JollyPlushScene } from "./JollyPlush";
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
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }); }, [messages, state]);
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setWebglState(context ? "supported" : "unsupported");
    } catch {
      setWebglState("unsupported");
    }
  }, []);

  const speak = (text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("happy");
      window.setTimeout(() => setState("idle"), 900);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /samantha|aria|ava|serena|google uk english female/i.test(voice.name)) || voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) || null;
    utterance.rate = 1.02;
    utterance.pitch = 1.08;
    utterance.volume = 0.92;
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => { speechRef.current = null; setState("idle"); };
    utterance.onerror = () => { speechRef.current = null; setState("idle"); };
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const askJolly = async (question: string) => {
    const message = question.trim();
    if (!message || state === "thinking") return;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setInput("");
    setError("");
    setState("thinking");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await fetch("/api/jolly/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history: previous }) });
      const body = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !body.reply) throw new Error(body.error || "Jolly could not answer right now.");
      const reply = body.reply;
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      speak(reply);
    } catch (caught) {
      setState("idle");
      setError(caught instanceof Error ? caught.message : "Jolly could not answer right now.");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void askJolly(input); };
  const toggleVoice = () => {
    if (voiceEnabled && typeof window !== "undefined") { window.speechSynthesis?.cancel(); setState("idle"); }
    setVoiceEnabled((current) => !current);
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
              <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 0.15, 6.3], fov: 31, near: 0.1, far: 30 }} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} aria-label="Interactive 3D model of Jolly">
                <JollyPlushScene state={state} onTap={tapJolly} />
              </Canvas>
            </CanvasErrorBoundary>
          ) : <JollyPoster />}
          <div className={`${styles.stateBubble} ${styles[state]}`} aria-live="polite"><span>{state === "thinking" ? "···" : state === "speaking" ? "◖◗" : "✦"}</span>{statusCopy(state)}</div>
          <div className={styles.orbitOne} /><div className={styles.orbitTwo} />
        </div>
        <p className={styles.stageHint}>{webglState === "supported" ? "Move your cursor around Jolly. Tap Jolly for a reaction." : "Jolly’s chat and voice remain fully available."}</p>
      </div>

      <div className={styles.chatCard}>
        <div className={styles.chatHead}>
          <div className={styles.miniJolly}><span /><i /><i /></div>
          <div><strong>Jolly</strong><small>The face and guide of Muse Agents</small></div>
          <span className={styles.online}>Online</span>
        </div>
        <div className={styles.messages} ref={messagesRef} aria-live="polite">
          {messages.map((message, index) => (
            <div className={`${styles.message} ${message.role === "user" ? styles.user : styles.jolly}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" && <span className={styles.messageMark}>J</span>}<p>{message.content}</p>
            </div>
          ))}
          {state === "thinking" && <div className={`${styles.message} ${styles.jolly}`}><span className={styles.messageMark}>J</span><p className={styles.typing}><i /><i /><i /></p></div>}
        </div>
        {messages.length < 4 && <div className={styles.starters}>{starters.map((starter) => <button key={starter} type="button" onClick={() => void askJolly(starter)}>{starter}</button>)}</div>}
        {error && <p className={styles.error}>{error}</p>}
        <form className={styles.composer} onSubmit={submit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} maxLength={600} placeholder="Ask Jolly anything…" aria-label="Message Jolly" />
          <button type="submit" disabled={!input.trim() || state === "thinking"} aria-label="Send message"><span>↑</span></button>
        </form>
        <p className={styles.disclaimer}>Jolly is powered by a live LLM and may occasionally make mistakes.</p>
      </div>
    </section>
  );
}
