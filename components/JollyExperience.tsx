"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, RoundedBox, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { Component, FormEvent, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import styles from "./JollyExperience.module.css";

type JollyState = "idle" | "thinking" | "speaking" | "happy";
type ChatMessage = { role: "user" | "assistant"; content: string };
type WebGLState = "checking" | "supported" | "unsupported";

const starters = [
  "What is Muse Agents?",
  "Help me create a Muse Agent",
  "Which AI model should I choose?"
];

function makePlushTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(256, 256);
  for (let index = 0; index < image.data.length; index += 4) {
    const grain = Math.max(42, Math.min(218, 126 + (Math.random() - 0.5) * 82));
    image.data[index] = grain;
    image.data[index + 1] = grain;
    image.data[index + 2] = grain;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function PlushMaterial({ texture, face = false }: { texture: THREE.Texture | null; face?: boolean }) {
  return (
    <meshPhysicalMaterial
      color={face ? "#f7dcc3" : "#eee2d0"}
      roughness={face ? 0.67 : 0.96}
      metalness={0}
      bumpMap={face ? undefined : texture || undefined}
      bumpScale={face ? 0 : 0.07}
      sheen={face ? 0.18 : 0.75}
      sheenColor={face ? "#fff4e7" : "#fffaf1"}
      sheenRoughness={0.82}
      clearcoat={face ? 0.06 : 0}
    />
  );
}

function JollyCharacter({ state, onTap }: { state: JollyState; onTap: () => void }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const rightEye = useRef<THREE.Group>(null);
  const smile = useRef<THREE.Mesh>(null);
  const openMouth = useRef<THREE.Mesh>(null);
  const tongue = useRef<THREE.Mesh>(null);
  const stateRef = useRef(state);
  const nextBlink = useRef(2.4);
  const blinkStarted = useRef(-1);
  const tapBurst = useRef(0);
  const { pointer } = useThree();
  const texture = useMemo(makePlushTexture, []);
  const smileCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.15, 0.035, 0),
        new THREE.Vector3(-0.07, -0.035, 0.012),
        new THREE.Vector3(0, -0.06, 0.016),
        new THREE.Vector3(0.07, -0.035, 0.012),
        new THREE.Vector3(0.15, 0.035, 0)
      ]),
    []
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame((frame, delta) => {
    const elapsed = frame.clock.elapsedTime;
    const mood = stateRef.current;
    if (!root.current || !body.current || !leftArm.current || !rightArm.current) return;

    const thinking = mood === "thinking";
    const speaking = mood === "speaking";
    const happy = mood === "happy" || tapBurst.current > 0;
    if (tapBurst.current > 0) tapBurst.current = Math.max(0, tapBurst.current - delta);

    const bounce = happy ? Math.abs(Math.sin(elapsed * 8.2)) * 0.12 : 0;
    root.current.position.y = Math.sin(elapsed * 1.45) * 0.035 + bounce;
    root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, pointer.x * 0.12, Math.min(1, delta * 3.5));
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, -pointer.y * 0.035 + (thinking ? -0.035 : 0), Math.min(1, delta * 3));

    const breath = 1 + Math.sin(elapsed * 1.75) * 0.012;
    body.current.scale.set(breath, breath, breath);
    leftArm.current.rotation.z = -0.16 + Math.sin(elapsed * 1.7) * 0.035;
    rightArm.current.rotation.z = 0.16 + (happy ? Math.sin(elapsed * 9) * 0.38 : Math.sin(elapsed * 1.7 + 0.8) * 0.035);
    rightArm.current.rotation.x = happy ? -0.28 : 0;

    if (elapsed > nextBlink.current && blinkStarted.current < 0) blinkStarted.current = elapsed;
    if (blinkStarted.current >= 0) {
      const blinkAge = elapsed - blinkStarted.current;
      const eyeScale = Math.max(0.08, Math.abs(blinkAge - 0.115) / 0.115);
      if (leftEye.current) leftEye.current.scale.y = eyeScale;
      if (rightEye.current) rightEye.current.scale.y = eyeScale;
      if (blinkAge > 0.23) {
        blinkStarted.current = -1;
        nextBlink.current = elapsed + 2.5 + Math.random() * 3.5;
      }
    }

    if (smile.current && openMouth.current && tongue.current) {
      const talk = speaking ? 0.65 + Math.abs(Math.sin(elapsed * 11.5)) * 0.8 : 0;
      smile.current.visible = !speaking;
      openMouth.current.visible = speaking;
      tongue.current.visible = speaking;
      openMouth.current.scale.y = THREE.MathUtils.lerp(openMouth.current.scale.y, Math.max(0.3, talk), 0.34);
      tongue.current.scale.y = openMouth.current.scale.y;
      if (face.current) face.current.scale.y = THREE.MathUtils.lerp(face.current.scale.y, speaking ? 1 + talk * 0.018 : 1, 0.2);
    }
  });

  const tap = () => {
    tapBurst.current = 1.15;
    onTap();
  };

  return (
    <group ref={root} onPointerDown={tap} position={[0, -0.05, 0]} scale={0.9}>
      <group ref={body}>
        {/* Jolly's tall, softly squared hood — deliberately not a generic ball. */}
        <RoundedBox castShadow receiveShadow args={[1.82, 2.18, 1.18]} radius={0.48} smoothness={10} position={[0, 0.08, 0]}>
          <PlushMaterial texture={texture} />
        </RoundedBox>
        <mesh castShadow position={[0, 0.98, -0.02]} scale={[0.76, 0.38, 0.53]}>
          <sphereGeometry args={[1, 64, 64]} /><PlushMaterial texture={texture} />
        </mesh>
        <mesh castShadow position={[0, -0.7, 0.02]} scale={[0.83, 0.54, 0.62]}>
          <sphereGeometry args={[1, 64, 64]} /><PlushMaterial texture={texture} />
        </mesh>
      </group>

      {/* Recessed warm face with a visible plush hood border. */}
      <group ref={face} position={[0, 0.5, 0.61]}>
        <RoundedBox castShadow args={[1.38, 0.88, 0.18]} radius={0.34} smoothness={10}>
          <PlushMaterial texture={null} face />
        </RoundedBox>
        <RoundedBox position={[0, 0, -0.055]} args={[1.52, 1.02, 0.09]} radius={0.4} smoothness={10}>
          <meshStandardMaterial color="#ddcdbb" roughness={1} />
        </RoundedBox>
      </group>

      <group ref={leftArm} position={[-0.95, -0.1, 0.01]} rotation={[0, 0, -0.12]}>
        <mesh castShadow rotation={[0, 0, -0.04]} scale={[0.8, 1, 0.8]}><capsuleGeometry args={[0.18, 0.7, 16, 32]} /><PlushMaterial texture={texture} /></mesh>
      </group>
      <group ref={rightArm} position={[0.95, -0.1, 0.01]} rotation={[0, 0, 0.12]}>
        <mesh castShadow rotation={[0, 0, 0.04]} scale={[0.8, 1, 0.8]}><capsuleGeometry args={[0.18, 0.7, 16, 32]} /><PlushMaterial texture={texture} /></mesh>
      </group>

      <mesh castShadow position={[-0.39, -1.18, 0.17]} rotation={[0.06, 0.05, 0]} scale={[0.35, 0.27, 0.48]}><sphereGeometry args={[1, 48, 48]} /><PlushMaterial texture={texture} /></mesh>
      <mesh castShadow position={[0.39, -1.18, 0.17]} rotation={[0.06, -0.05, 0]} scale={[0.35, 0.27, 0.48]}><sphereGeometry args={[1, 48, 48]} /><PlushMaterial texture={texture} /></mesh>

      <group ref={leftEye} position={[-0.25, 0.59, 0.755]}>
        <mesh scale={[0.064, 0.077, 0.036]}><sphereGeometry args={[1, 32, 32]} /><meshPhysicalMaterial color="#17151a" roughness={0.18} clearcoat={0.7} /></mesh>
        <mesh position={[-0.018, 0.027, 0.035]} scale={0.016}><sphereGeometry args={[1, 20, 20]} /><meshBasicMaterial color="white" /></mesh>
      </group>
      <group ref={rightEye} position={[0.25, 0.59, 0.755]}>
        <mesh scale={[0.064, 0.077, 0.036]}><sphereGeometry args={[1, 32, 32]} /><meshPhysicalMaterial color="#17151a" roughness={0.18} clearcoat={0.7} /></mesh>
        <mesh position={[-0.018, 0.027, 0.035]} scale={0.016}><sphereGeometry args={[1, 20, 20]} /><meshBasicMaterial color="white" /></mesh>
      </group>

      <mesh position={[-0.43, 0.39, 0.755]} scale={[0.12, 0.045, 0.012]}><sphereGeometry args={[1, 24, 24]} /><meshBasicMaterial color="#ee9da1" transparent opacity={0.48} /></mesh>
      <mesh position={[0.43, 0.39, 0.755]} scale={[0.12, 0.045, 0.012]}><sphereGeometry args={[1, 24, 24]} /><meshBasicMaterial color="#ee9da1" transparent opacity={0.48} /></mesh>

      <mesh ref={smile} position={[0, 0.34, 0.77]}><tubeGeometry args={[smileCurve, 32, 0.027, 12, false]} /><meshStandardMaterial color="#211b22" roughness={0.38} /></mesh>
      <mesh ref={openMouth} visible={false} position={[0, 0.34, 0.77]} scale={[0.14, 0.34, 0.035]}><sphereGeometry args={[1, 32, 32]} /><meshStandardMaterial color="#21171c" roughness={0.46} /></mesh>
      <mesh ref={tongue} visible={false} position={[0, 0.285, 0.805]} scale={[0.085, 0.12, 0.012]}><sphereGeometry args={[1, 24, 24]} /><meshBasicMaterial color="#df8290" /></mesh>
    </group>
  );
}

function JollyScene({ state, onTap }: { state: JollyState; onTap: () => void }) {
  return (
    <>
      <color attach="background" args={["#f7efe7"]} />
      <fog attach="fog" args={["#f7efe7", 5.5, 9]} />
      <ambientLight intensity={1.25} />
      <hemisphereLight intensity={1.1} color="#fff8ef" groundColor="#cbbbd7" />
      <directionalLight castShadow intensity={2.25} position={[3.5, 5, 4]} color="#fff8ef" />
      <pointLight intensity={18} distance={7} position={[-3, 1.4, 2.2]} color="#cdbcf8" />
      <pointLight intensity={12} distance={6} position={[3, 0.3, 2.5]} color="#ffc9b9" />
      <Suspense fallback={null}>
        <JollyCharacter state={state} onTap={onTap} />
      </Suspense>
      <Sparkles count={24} scale={[5, 3.6, 2]} size={2.2} speed={0.25} color="#c2a9ee" opacity={0.38} />
      <ContactShadows position={[0, -1.48, 0]} opacity={0.28} scale={5} blur={2.8} far={3.8} color="#715f66" />
    </>
  );
}

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
              <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 0.18, 5.45], fov: 31, near: 0.1, far: 30 }} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} aria-label="Interactive 3D model of Jolly">
                <JollyScene state={state} onTap={tapJolly} />
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
