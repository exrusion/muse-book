"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

type Mood = "idle" | "thinking" | "speaking" | "happy";

// One continuous sculpt: a small rounded hood flowing into a soft pear-shaped belly.
function sculptBody() {
  const curve = new THREE.CatmullRomCurve3([
    [0, -1.02], [0.48, -1.01], [0.72, -0.84], [0.79, -0.48],
    [0.77, -0.12], [0.68, 0.3], [0.64, 0.77], [0.57, 1.08],
    [0.41, 1.27], [0, 1.33]
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const geometry = new THREE.LatheGeometry(curve.getPoints(100).map(p => new THREE.Vector2(Math.max(0, p.x), p.y)), 100);
  geometry.scale(1, 1, 0.78);
  // Flatten the front beneath the fabric face so the face never intersects the body.
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const mask = Math.pow(Math.abs(x / 0.58), 3.1) + Math.pow(Math.abs((y - 0.74) / 0.41), 3.1);
    if (z > 0 && mask < 1.4) positions.setZ(i, Math.min(z, 0.435));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A softly domed superellipse, not a box or a raised helmet visor.
function sculptFace() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = 24, segments = 96;
  for (let r = 0; r <= rings; r++) {
    const radius = r / rings;
    for (let s = 0; s <= segments; s++) {
      const angle = s / segments * Math.PI * 2;
      const x = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), 0.66) * 0.535 * radius;
      const y = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), 0.66) * 0.35 * radius;
      positions.push(x, y, 0.073 * (1 - radius * radius));
      uvs.push(x / 1.07 + 0.5, y / 0.7 + 0.5);
      if (r < rings && s < segments) {
        const a = r * (segments + 1) + s, b = a + segments + 1;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function faceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f1cda8";
  ctx.fillRect(0, 0, 512, 512);
  for (const x of [126, 386]) {
    const blush = ctx.createRadialGradient(x, 315, 2, x, 315, 80);
    blush.addColorStop(0, "rgba(219,102,105,0.62)");
    blush.addColorStop(0.4, "rgba(229,132,123,0.34)");
    blush.addColorStop(1, "rgba(233,138,129,0)");
    ctx.fillStyle = blush; ctx.fillRect(0, 0, 512, 512);
  }
  // A slight warm falloff at the edge makes the face feel inset in its hood.
  const edge = ctx.createRadialGradient(240, 190, 95, 256, 250, 330);
  edge.addColorStop(0, "rgba(255,245,221,0.16)");
  edge.addColorStop(0.65, "rgba(147,96,71,0)");
  edge.addColorStop(1, "rgba(147,96,71,0.22)");
  ctx.fillStyle = edge; ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clothTexture() {
  const data = new Uint8Array(128 * 128 * 4);
  const rand = randomGenerator(815);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const value = 110 + rand() * 50 + Math.sin(x * Math.PI / 2) * 16 + Math.sin(y * Math.PI / 2) * 16;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  const map = new THREE.DataTexture(data, 128, 128);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3); map.needsUpdate = true;
  return map;
}

function groundTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const fade = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  fade.addColorStop(0, "rgba(77,52,41,0.30)");
  fade.addColorStop(0.35, "rgba(87,62,47,0.19)");
  fade.addColorStop(0.7, "rgba(87,62,47,0.06)");
  fade.addColorStop(1, "rgba(87,62,47,0)");
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Seeded grooming keeps every frame and every device on the same character.
function randomGenerator(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function growFur(surface: THREE.BufferGeometry, count: number, maskFace = false) {
  const rand = randomGenerator(count + 11);
  const temporaryMaterial = new THREE.MeshBasicMaterial();
  const temporary = new THREE.Mesh(surface, temporaryMaterial);
  // Three's runtime exposes this method; its companion typings currently omit it.
  const sampler = new MeshSurfaceSampler(temporary) as MeshSurfaceSampler & { setRandomGenerator: (random: () => number) => MeshSurfaceSampler };
  sampler.setRandomGenerator(rand).build();
  temporaryMaterial.dispose();
  const vertices: number[] = [], colors: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const strand = new THREE.Vector3(), previous = new THREE.Vector3();
  const light = new THREE.Vector3(-0.5, 0.8, 0.8).normalize();
  const base = new THREE.Color("#aa896d"), tip = new THREE.Color("#ebd7bb"), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    sampler.sample(point, normal);
    if (maskFace && point.z > 0.15 && Math.pow(Math.abs(point.x / 0.55), 3.03) + Math.pow(Math.abs((point.y - 0.74) / 0.366), 3.03) < 1.04) continue;
    const length = 0.012 + rand() * 0.017;
    // Neighbouring strands follow the same soft clumps instead of a spiky outline.
    const curl = Math.sin(point.x * 48 + point.y * 23) * 0.01 + (rand() - 0.5) * 0.005;
    const shade = 0.49 + Math.max(0, normal.dot(light)) * 0.53 + rand() * 0.08;
    previous.copy(point);
    for (let segment = 1; segment <= 3; segment++) {
      const t = segment / 3;
      strand.copy(point).addScaledVector(normal, length * t);
      strand.x += curl * t * t;
      strand.y -= length * 1.15 * t * t;
      vertices.push(previous.x, previous.y, previous.z, strand.x, strand.y, strand.z);
      for (let end = 0; end < 2; end++) {
        color.copy(base).lerp(tip, (segment - 1 + end) / 3).multiplyScalar(shade);
        colors.push(color.r, color.g, color.b);
      }
      previous.copy(strand);
    }
  }
  const fur = new THREE.BufferGeometry();
  fur.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  fur.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return fur;
}

function Fur({ geometry, count, maskFace = false }: { geometry: THREE.BufferGeometry; count: number; maskFace?: boolean }) {
  const fur = useMemo(() => growFur(geometry, count, maskFace), [geometry, count, maskFace]);
  useEffect(() => () => fur.dispose(), [fur]);
  return <group>
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial color="#c8ab8c" roughness={0.96} sheen={0.85} sheenRoughness={0.72} sheenColor="#f0d9b8" />
    </mesh>
    <lineSegments geometry={fur} raycast={() => {}}>
      <lineBasicMaterial vertexColors transparent opacity={0.94} depthWrite={false} />
    </lineSegments>
  </group>;
}

export function JollyPlush({ state, onTap, speechLevel }: { state: Mood; onTap: () => void; speechLevel: RefObject<number> }) {
  const root = useRef<THREE.Group>(null), left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null), mouth = useRef<THREE.Group>(null), smile = useRef<THREE.Mesh>(null);
  const { pointer, size } = useThree();
  const reducedMotion = useRef(false);
  const models = useMemo(() => ({
    body: sculptBody(), face: sculptFace(),
    arm: new THREE.SphereGeometry(1, 40, 32).scale(0.245, 0.36, 0.26),
    hand: new THREE.SphereGeometry(1, 40, 32).scale(0.255, 0.245, 0.28),
    foot: new THREE.CapsuleGeometry(0.235, 0.16, 12, 32).scale(1, 1, 1.2),
    smile: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.082, 0.014, 0), new THREE.Vector3(0, -0.049, 0.008), new THREE.Vector3(0.082, 0.014, 0)), 28, 0.009, 8, false),
    faceMap: faceTexture(), cloth: clothTexture()
  }), []);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => Object.values(models).forEach(resource => resource.dispose());
  }, [models]);
  useFrame(({ clock }, delta) => {
    if (!root.current || !left.current || !right.current || !eyes.current || !mouth.current || !smile.current) return;
    const t = clock.elapsedTime, speaking = state === "speaking", happy = state === "happy";
    const motion = reducedMotion.current ? 0 : 1;
    root.current.position.y = -0.015 + Math.sin(t * 1.5) * 0.009 * motion + (happy ? Math.abs(Math.sin(t * 6)) * 0.035 * motion : 0);
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, (0.045 + pointer.x * 0.14) * motion, 4, delta);
    root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, (speaking ? Math.sin(t * 3.4) * 0.012 : -pointer.y * 0.018) * motion, 4, delta);
    root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, state === "thinking" ? 0.045 : Math.sin(t * 0.8) * 0.008 * motion, 3, delta);
    left.current.rotation.z = -0.55 + Math.sin(t * 1.7) * 0.025 * motion;
    right.current.rotation.z = 0.55 + Math.sin(t * (happy ? 7 : 1.7)) * (happy ? 0.1 : 0.025) * motion;
    // Blink closes and reopens without stretching the eyes above their rest size.
    const blink = t % 4.8;
    eyes.current.scale.y = blink < 0.18 ? Math.max(0.06, Math.abs(blink - 0.09) / 0.09) : 1;
    const volume = speaking ? speechLevel.current : 0;
    smile.current.visible = volume < 0.07;
    mouth.current.visible = volume >= 0.07;
    mouth.current.scale.y = THREE.MathUtils.damp(mouth.current.scale.y, 0.12 + volume * 0.8, 24, delta);
    mouth.current.scale.x = THREE.MathUtils.damp(mouth.current.scale.x, 1 - volume * 0.18, 18, delta);
  });
  const density = size.width < 500 ? 48000 : 92000;
  return <group ref={root} onPointerDown={onTap} scale={0.96}>
    <Fur geometry={models.body} count={density} maskFace />
    <mesh geometry={models.face} position={[0, 0.74, 0.48]} castShadow>
      <meshPhysicalMaterial map={models.faceMap} bumpMap={models.cloth} bumpScale={0.002} roughness={0.9} sheen={0.32} sheenColor="#ffdfbf" side={THREE.DoubleSide} />
    </mesh>
    <group ref={eyes} position={[0, 0.795, 0.551]}>
      {[-0.268, 0.268].map(x => <group key={x} position={[x, 0, -0.012]}>
        <mesh scale={[0.05, 0.059, 0.027]}><sphereGeometry args={[1, 32, 24]} /><meshPhysicalMaterial color="#100f10" roughness={0.17} clearcoat={0.9} /></mesh>
        <mesh position={[-0.013, 0.02, 0.026]}><sphereGeometry args={[0.009, 12, 12]} /><meshBasicMaterial color="#fff8ed" /></mesh>
      </group>)}
    </group>
    <mesh ref={smile} geometry={models.smile} position={[0, 0.666, 0.561]}><meshStandardMaterial color="#31201b" roughness={0.8} /></mesh>
    <group ref={mouth} position={[0, 0.648, 0.563]} visible={false}>
      <mesh scale={[0.085, 0.08, 0.016]}><sphereGeometry args={[1, 32, 24]} /><meshBasicMaterial color="#352125" /></mesh>
      <mesh position={[0, -0.034, 0.014]} scale={[0.052, 0.022, 0.008]}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color="#d08787" /></mesh>
    </group>
    <group ref={left} position={[-0.61, 0.05, 0.3]} rotation={[0, 0, -0.55]}>
      <Fur geometry={models.arm} count={6500} />
      <group position={[0.17, 0.015, 0.24]}><Fur geometry={models.hand} count={8500} /></group>
    </group>
    <group ref={right} position={[0.61, 0.05, 0.3]} rotation={[0, 0, 0.55]}>
      <Fur geometry={models.arm} count={6500} />
      <group position={[-0.17, 0.015, 0.24]}><Fur geometry={models.hand} count={8500} /></group>
    </group>
    {[-0.34, 0.34].map(x => <group key={x} position={[x, -1.085, 0.045]}><Fur geometry={models.foot} count={6500} /></group>)}
  </group>;
}

export function JollyPlushScene({ state, onTap, speechLevel }: { state: Mood; onTap: () => void; speechLevel: RefObject<number> }) {
  const shadow = useMemo(groundTexture, []);
  useEffect(() => () => shadow.dispose(), [shadow]);
  return <>
    <color attach="background" args={["#f4eee9"]} />
    <ambientLight intensity={0.22} />
    <hemisphereLight intensity={0.5} color="#fff6e9" groundColor="#927057" />
    <directionalLight castShadow intensity={3.1} position={[-3.5, 4.5, 4]} color="#fff0d9" shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.018} shadow-radius={4} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} />
    <directionalLight intensity={0.6} position={[3, 1, 3]} color="#dddfff" />
    <directionalLight intensity={2.2} position={[1.5, 3, -3]} color="#fff2df" />
    <JollyPlush state={state} onTap={onTap} speechLevel={speechLevel} />
    <mesh position={[0, -1.395, 0.05]} rotation={[-Math.PI / 2, 0, 0]} scale={[3.4, 2.5, 1]}>
      <planeGeometry /><meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}
