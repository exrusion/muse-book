"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

type Mood = "idle" | "thinking" | "speaking" | "happy";

// One continuous sculpt: a small rounded hood flowing into a soft pear-shaped belly.
function sculptBody(detail = "full") {
  const curve = new THREE.CatmullRomCurve3([
    [0, -1.02], [0.48, -1.01], [0.74, -0.84], [0.83, -0.48],
    [0.81, -0.12], [0.72, 0.3], [0.68, 0.77], [0.61, 1.08],
    [0.41, 1.27], [0, 1.33]
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const segments = detail === "town" ? 32 : 100;
  const geometry = new THREE.LatheGeometry(curve.getPoints(segments).map(p => new THREE.Vector2(Math.max(0, p.x), p.y)), segments);
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
function sculptFace(detail = "full") {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = detail === "town" ? 10 : 24, segments = detail === "town" ? 32 : 96;
  for (let r = 0; r <= rings; r++) {
    const radius = r / rings;
    for (let s = 0; s <= segments; s++) {
      const angle = s / segments * Math.PI * 2;
      const x = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), 0.66) * 0.535 * radius;
      const y = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), 0.66) * 0.35 * radius;
      positions.push(x, y, 0.05 * (1 - radius * radius));
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
  ctx.fillStyle = "#f4d5b0";
  ctx.fillRect(0, 0, 512, 512);
  for (const x of [126, 386]) {
    const blush = ctx.createRadialGradient(x, 315, 2, x, 315, 80);
    blush.addColorStop(0, "rgba(225,120,119,0.55)");
    blush.addColorStop(0.4, "rgba(233,138,129,0.3)");
    blush.addColorStop(1, "rgba(233,138,129,0)");
    ctx.fillStyle = blush; ctx.fillRect(0, 0, 512, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  const base = new THREE.Color("#d8c2a3"), tip = new THREE.Color("#f1e2cb"), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    sampler.sample(point, normal);
    if (maskFace && point.z > 0.15 && Math.pow(Math.abs(point.x / 0.55), 3.03) + Math.pow(Math.abs((point.y - 0.74) / 0.366), 3.03) < 1.04) continue;
    const length = 0.018 + rand() * 0.022;
    const curl = (rand() - 0.5) * 0.015;
    const shade = 0.66 + Math.max(0, normal.dot(light)) * 0.29 + rand() * 0.14;
    previous.copy(point);
    for (let segment = 1; segment <= 3; segment++) {
      const t = segment / 3;
      strand.copy(point).addScaledVector(normal, length * t);
      strand.x += curl * t * t;
      strand.y -= length * 0.75 * t * t;
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
      <meshPhysicalMaterial color="#dac7ad" roughness={1} sheen={1} sheenRoughness={0.9} sheenColor="#f5e8d6" />
    </mesh>
    <lineSegments geometry={fur} raycast={() => {}}>
      <lineBasicMaterial vertexColors transparent opacity={0.92} depthWrite={false} />
    </lineSegments>
  </group>;
}

export function JollyPlush({ state, onTap, speechLevel, detail = "full", locomotion }: { state: Mood; onTap: () => void; speechLevel: RefObject<number>; detail?: "full" | "town"; locomotion?:RefObject<{moving:boolean}> }) {
  const root = useRef<THREE.Group>(null), left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null), mouth = useRef<THREE.Group>(null), smile = useRef<THREE.Mesh>(null);
  const leftFoot=useRef<THREE.Group>(null),rightFoot=useRef<THREE.Group>(null);
  const { pointer, size } = useThree();
  const reducedMotion = useRef(false);
  const models = useMemo(() => ({
    body: sculptBody(detail), face: sculptFace(detail),
    arm: new THREE.SphereGeometry(1, detail === "town" ? 16 : 40, detail === "town" ? 12 : 32).scale(0.245, 0.36, 0.26),
    hand: new THREE.SphereGeometry(1, detail === "town" ? 16 : 40, detail === "town" ? 12 : 32).scale(0.255, 0.245, 0.28),
    foot: new THREE.CapsuleGeometry(0.235, 0.16, detail === "town" ? 6 : 12, detail === "town" ? 12 : 32).scale(1, 1, 1.2),
    smile: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.082, 0.014, 0), new THREE.Vector3(0, -0.049, 0.008), new THREE.Vector3(0.082, 0.014, 0)), 28, 0.009, 8, false),
    faceMap: faceTexture()
  }), [detail]);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => Object.values(models).forEach(resource => resource.dispose());
  }, [models]);
  useFrame(({ clock }, delta) => {
    if (!root.current || !left.current || !right.current || !eyes.current || !mouth.current || !smile.current) return;
    const t = clock.elapsedTime, speaking = state === "speaking", happy = state === "happy";
    const motion = reducedMotion.current ? 0 : 1;
    root.current.position.y = -0.015 + Math.sin(t * 1.5) * 0.009 * motion + (happy ? Math.abs(Math.sin(t * 6)) * 0.035 * motion : 0);
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, pointer.x * 0.12 * motion, 4, delta);
    root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, state === "thinking" ? 0.045 : Math.sin(t * 0.8) * 0.008 * motion, 3, delta);
    left.current.rotation.z = -0.3 + Math.sin(t * 1.7) * 0.02 * motion;
    right.current.rotation.z = 0.3 + Math.sin(t * (happy ? 7 : 1.7)) * (happy ? 0.15 : 0.02) * motion;
    const walking=locomotion?.current.moving===true;
    const stride=walking?Math.sin(t*11)*0.38*motion:0;
    left.current.rotation.x=THREE.MathUtils.damp(left.current.rotation.x,-stride,14,delta);
    right.current.rotation.x=THREE.MathUtils.damp(right.current.rotation.x,stride,14,delta);
    if(leftFoot.current&&rightFoot.current){
      leftFoot.current.rotation.x=stride;rightFoot.current.rotation.x=-stride;
      leftFoot.current.position.y=-1.085+Math.max(0,stride)*0.16;
      rightFoot.current.position.y=-1.085+Math.max(0,-stride)*0.16;
    }
    if(walking)root.current.position.y+=Math.abs(Math.sin(t*11))*0.035*motion;
    // Blink closes and reopens without stretching the eyes above their rest size.
    const blink = t % 4.8;
    eyes.current.scale.y = blink < 0.18 ? Math.max(0.06, Math.abs(blink - 0.09) / 0.09) : 1;
    const volume = speaking ? speechLevel.current : 0;
    smile.current.visible = volume < 0.07;
    mouth.current.visible = volume >= 0.07;
    mouth.current.scale.y = THREE.MathUtils.damp(mouth.current.scale.y, 0.12 + volume * 0.8, 24, delta);
    mouth.current.scale.x = THREE.MathUtils.damp(mouth.current.scale.x, 1 - volume * 0.18, 18, delta);
  });
  const density = detail === "town" ? 1800 : size.width < 500 ? 38000 : 70000;
  const limbDensity = detail === "town" ? 150 : 6500;
  const handDensity = detail === "town" ? 150 : 5500;
  return <group ref={root} onPointerDown={onTap} scale={0.96}>
    <Fur geometry={models.body} count={density} maskFace />
    <mesh geometry={models.face} position={[0, 0.74, 0.48]} castShadow>
      <meshPhysicalMaterial map={models.faceMap} roughness={0.84} sheen={0.25} sheenColor="#fff1dc" side={THREE.DoubleSide} />
    </mesh>
    <group ref={eyes} position={[0, 0.795, 0.53]}>
      {[-0.268, 0.268].map(x => <group key={x} position={[x, 0, -0.012]}>
        <mesh scale={[0.05, 0.059, 0.027]}><sphereGeometry args={[1, 32, 24]} /><meshPhysicalMaterial color="#100f10" roughness={0.17} clearcoat={0.9} /></mesh>
        <mesh position={[-0.013, 0.02, 0.026]}><sphereGeometry args={[0.009, 12, 12]} /><meshBasicMaterial color="#fff8ed" /></mesh>
      </group>)}
    </group>
    <mesh ref={smile} geometry={models.smile} position={[0, 0.666, 0.538]}><meshStandardMaterial color="#31201b" roughness={0.8} /></mesh>
    <group ref={mouth} position={[0, 0.648, 0.54]} visible={false}>
      <mesh scale={[0.085, 0.08, 0.016]}><sphereGeometry args={[1, 32, 24]} /><meshBasicMaterial color="#352125" /></mesh>
      <mesh position={[0, -0.034, 0.014]} scale={[0.052, 0.022, 0.008]}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color="#d08787" /></mesh>
    </group>
    <group ref={left} position={[-0.7, -0.04, 0.25]} rotation={[0, 0, -0.3]}>
      <Fur geometry={models.arm} count={limbDensity} />
      <group position={[0.1, -0.08, 0.2]}><Fur geometry={models.hand} count={handDensity} /></group>
    </group>
    <group ref={right} position={[0.7, -0.04, 0.25]} rotation={[0, 0, 0.3]}>
      <Fur geometry={models.arm} count={limbDensity} />
      <group position={[-0.1, -0.08, 0.2]}><Fur geometry={models.hand} count={handDensity} /></group>
    </group>
    {[-0.34, 0.34].map(x => <group key={x} ref={x<0?leftFoot:rightFoot} position={[x, -1.085, 0.045]}><Fur geometry={models.foot} count={limbDensity} /></group>)}
  </group>;
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
