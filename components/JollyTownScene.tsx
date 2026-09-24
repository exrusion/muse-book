"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as Controls } from "three-stdlib";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { places, placeFor, residentOffset, spawnPosition, walkable, type TownResident, type PlaceId } from "@/lib/jolly-town-shared";
import { townBuildings, townLand, townRoads, townTrees, townPonds } from "@/lib/jolly-town-layout";
import { JollyPlush } from "./JollyPlush";
import type { TownMotion } from "./useTownMovement";
import styles from "./JollyTown.module.css";

// Merge the city by material: hundreds of windows and trees become a few draw calls.
function buildCity() {
  const batches = new Map<string, THREE.BufferGeometry[]>();
  function add(color: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rotation = 0) {
    geometry.rotateY(rotation); geometry.translate(x, y, z);
    const group = batches.get(color) || []; group.push(geometry); batches.set(color, group);
  }
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, rotation = 0) => add(color, new THREE.BoxGeometry(w, h, d), x, y, z, rotation);
  const ball = (color: string, x: number, y: number, z: number, radius: number) => add(color, new THREE.IcosahedronGeometry(radius, 1), x, y, z);
  function tree(x: number, z: number, size = 1, pink = false) {
    add("#967b62", new THREE.CylinderGeometry(0.09, 0.14, 1.3 * size, 6), x, 0.7 * size, z);
    ball(pink ? "#e5b1c4" : "#86ad87", x, 1.6 * size, z, 0.7 * size);
    ball(pink ? "#f2c8d4" : "#a5c098", x - 0.18, 1.95 * size, z, 0.5 * size);
  }
  function building(x: number, z: number, w: number, d: number, h: number, color: string, roof = false) {
    box(color, x, h / 2 + 0.18, z, w, h, d);
    box("#f6eddf", x, h + 0.2, z, w + 0.22, 0.22, d + 0.22);
    box("#d9d4c5", x, 0.28, z, w + 0.2, 0.35, d + 0.2);
    if (roof) add("#879fa9", new THREE.ConeGeometry(w * 0.81, 1.45, 4), x, h + 1, z, Math.PI / 4);
    else { box("#b5beb4", x + 0.4, h + 0.5, z, w * 0.28, 0.45, d * 0.4); }
    const floors = Math.floor(h / 0.85);
    for (let f = 0; f < floors; f++) for (let col = 0; col < 3; col++) {
      const yy = 0.85 + f * 0.83;
      box("#7f9fae", x - w * 0.31 + col * w * 0.31, yy, z + d / 2 + 0.012, w * 0.17, 0.43, 0.025);
      box("#a9c4ce", x + w / 2 + 0.012, yy, z - d * 0.3 + col * d * 0.3, 0.025, 0.43, d * 0.17);
      if (h > 4) box("#f5eade", x, yy - 0.3, z + d / 2 + 0.055, w + 0.07, 0.065, 0.18);
    }
    box("#4c6570", x, 0.64, z + d / 2 + 0.025, 0.6, 0.95, 0.05);
  }
  box("#d6c7aa", 0, -0.65, townLand.z, townLand.width, 1.3, townLand.depth);
  box("#e9e2d3", 0, 0.015, townLand.z, townLand.width - 0.3, 0.13, townLand.depth - 0.3);
  box("#aac6a2", 0, 0.09, townLand.z, townLand.width - 2.2, 0.12, townLand.depth - 2.2);
  // Connected avenues lead from the old center into the new outer districts.
  for (const x of townRoads.x) {
    box("#e9dfc9", x, 0.14, townLand.z, 2.6, 0.05, 46.4);
    box("#809194", x, 0.17, townLand.z, 1.8, 0.06, 46.4);
    for (let z = -31; z < 14; z += 1.5) box("#e8e5d6", x, 0.205, z, 0.055, 0.015, 0.55);
  }
  for (const z of townRoads.z) {
    box("#e9dfc9", 0, 0.14, z, 58.8, 0.05, 2.6);
    box("#809194", 0, 0.17, z, 58.8, 0.06, 1.8);
    for (let x = -28; x < 29; x += 1.5) box("#e8e5d6", x, 0.205, z, 0.55, 0.015, 0.055);
  }
  for (const x of townRoads.x) for (const z of townRoads.z) for (let i = -2; i <= 2; i++) {
    box("#f8f2dc", x + i * 0.25, 0.22, z + 1.15, 0.14, 0.02, 0.55);
    box("#f8f2dc", x + 1.15, 0.22, z + i * 0.25, 0.55, 0.02, 0.14);
  }
  for (const p of places) {
    add("#e9dfc9", new THREE.CylinderGeometry(p.id === "plaza" ? 3.5 : 2.8, p.id === "plaza" ? 3.5 : 2.8, 0.08, 48), p.x, 0.18, p.z);
  }
  // Central fountain, a small landmark visible from every street.
  add("#cfba9f", new THREE.CylinderGeometry(1.25, 1.4, 0.38, 48), 0, 0.36, 0);
  add("#8ecbd2", new THREE.CylinderGeometry(1.1, 1.1, 0.03, 48), 0, 0.57, 0);
  add("#e8dcc7", new THREE.CylinderGeometry(0.16, 0.28, 1.25, 16), 0, 1.07, 0);
  add("#dbcdb8", new THREE.CylinderGeometry(0.7, 0.27, 0.17, 32), 0, 1.5, 0);
  ball("#b1e0df", 0, 1.7, 0, 0.23);
  for (const [x,z,w,d,h,color,roof] of townBuildings) building(x,z,w,d,h,color,roof);
  // Café awning and outdoor tables.
  for (let i = 0; i < 8; i++) box(i % 2 ? "#e9a893" : "#fff3df", -13.9 + i * 0.4, 1.6, 3, 0.4, 0.12, 1.3);
  for (const x of [-12.8, -10.6]) {
    add("#c19670", new THREE.CylinderGeometry(0.35, 0.35, 0.09, 20), x, 0.7, 4.6);
    box("#86745f", x, 0.4, 4.6, 0.08, 0.6, 0.08);
  }
  // Garden pond and winding stepping stones.
  for (const pond of townPonds) add("#86bdca", new THREE.CylinderGeometry(1, 1, 0.07, 32).scale(pond.rx, 1, pond.rz), pond.x, 0.23, pond.z);
  for (let i = 0; i < 7; i++) add("#e4dcc9", new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), 10 + Math.sin(i) * 0.4, 0.25, i * 0.55);
  for (const [x,z] of townTrees) tree(x,z,0.8 + Math.abs(x % 3) * 0.15,x > 18 || (x > 6 && z > -4 && z < 7));
  // A copper dome crowns the observatory; the courtyard remains open to walkers.
  add("#90aaa9", new THREE.SphereGeometry(1.65,24,12,0,Math.PI*2,0,Math.PI/2),0,3.8,-26.8);
  box("#e8dcc7",0,5.3,-26.8,0.12,0.7,0.12);
  ball("#f5dfac",0,5.7,-26.8,0.18);
  // Striped market awnings and lanterns over the western lane.
  for (const [x,z,color] of [[-26,-7,"#e9a893"],[-21.5,-8,"#a8c9b4"]] as const) {
    for(let i=0;i<6;i++) box(i%2 ? color : "#fff3df",x-1.1+i*0.4,1.65,z+0.8,0.4,0.12,1.2);
  }
  for (let x=-27;x<=-18;x+=1.5) {
    ball("#f5cf9c",x,2.7,-4.4,0.13);
    box("#86745f",x,2.86,-4.4,1.5,0.025,0.025);
  }
  for (const x of [-27.5,-17.5]) box("#86745f",x,1.55,-4.4,0.08,2.7,0.08);

  for (const x of [-3.2, 3.2]) for (const z of [-1, 4.5]) {
    box("#ba9874", x, 0.5, z, 1.15, 0.14, 0.45);
    box("#ba9874", x, 0.82, z - 0.18, 1.15, 0.35, 0.07);
    for (const dx of [-0.4, 0.4]) box("#697977", x + dx, 0.3, z, 0.06, 0.35, 0.3);
  }
  for (const x of [-17.25, -6.25, 6.25, 17.25]) for (const z of [-26, -19, -10, -1, 5, 11]) {
    box("#647d7b", x, 1.1, z, 0.055, 1.9, 0.055);
    ball("#ffedbf", x, 2.1, z, 0.16);
  }
  box("#bc9671", 0, 0.15, 14.9, 3, 0.3, 4);
  for (let z = 13.2; z <= 16.5; z += 0.35) box("#d7b492", 0, 0.32, z, 3, 0.04, 0.06);
  for (const x of [-1.3,1.3]) for (const z of [13.5,16]) box("#95775c", x, 0.52, z, 0.15, 0.9, 0.15);
  // A little sailboat beside the harbor.
  add("#f6e9d7", new THREE.SphereGeometry(1, 16, 8).scale(0.6, 0.3, 1.4), 5, -0.32, 17);
  box("#947d66", 5, 0.8, 17, 0.055, 2.2, 0.055);
  add("#f8d4b8", new THREE.ConeGeometry(0.75, 1.75, 3).scale(0.1, 1, 1), 5, 0.95, 17.25);
  const result = [...batches].map(([color, parts]) => { const geometry = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return { color, geometry }; });
  return result;
}

function City() {
  const meshes = useMemo(buildCity, []);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  return <group>{meshes.map(m => <mesh key={m.color} geometry={m.geometry} castShadow receiveShadow><meshStandardMaterial color={m.color} roughness={0.85} /></mesh>)}</group>;
}
function Neighbor({ resident, selected, onSelect, speaking, speechLevel, reduced, motion, mine }: { resident: TownResident; selected: boolean; onSelect: () => void; speaking: boolean; speechLevel: RefObject<number>; reduced: boolean; motion:TownMotion; mine:boolean }) {
  const root = useRef<THREE.Group>(null), silent = useRef(0);
  const character=useRef<THREE.Group>(null),gait=useRef({moving:false});
  const p = spawnPosition(resident.id,resident.place), offset = residentOffset(resident.id);
  const initial = useRef<[number,number,number]>([p.x, 0.91, p.z]);
  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const live=mine?motion.local.current:motion.poses.current.get(resident.id);
    if(live&&resident.kind==="member"){
      const fresh=mine||performance.now()-(motion.poses.current.get(resident.id)?.receivedAt||0)<1500;
      gait.current.moving=live.moving&&live.online&&fresh;
      root.current.position.x=mine?live.x:THREE.MathUtils.damp(root.current.position.x,live.x,16,delta);
      root.current.position.z=mine?live.z:THREE.MathUtils.damp(root.current.position.z,live.z,16,delta);
      if(character.current){const a=character.current.rotation.y;const difference=Math.atan2(Math.sin(live.yaw-a),Math.cos(live.yaw-a));character.current.rotation.y+=difference*(1-Math.exp(-15*delta));}
      return;
    }
    const wander = resident.kind === "agent" && !selected && !reduced ? Math.sin(clock.elapsedTime * 0.18 + offset[0]) * 0.65 : 0;
    const wanderX = walkable(p.x + wander,p.z) ? p.x + wander : p.x;
    root.current.position.x = THREE.MathUtils.damp(root.current.position.x, wanderX, 2.5, delta);
    root.current.position.z = THREE.MathUtils.damp(root.current.position.z, p.z, 2.5, delta);
  });
  return <group ref={root} position={initial.current} onClick={e => { e.stopPropagation(); onSelect(); }}>
    <group ref={character} scale={0.48} rotation={[0, 0.45, 0]}>
      <JollyPlush detail="town" state={speaking ? "speaking" : selected&&!mine ? "happy" : "idle"} onTap={onSelect} speechLevel={speaking ? speechLevel : silent} locomotion={gait} />
      <mesh position={[0, 0.24, 0.43]}><sphereGeometry args={[0.105, 12, 8]} /><meshStandardMaterial color={resident.accent} /></mesh>
    </group>
    {selected && <mesh rotation={[-Math.PI / 2,0,0]} position={[0,-0.65,0]}><ringGeometry args={[0.55,0.64,40]} /><meshBasicMaterial color={resident.accent} /></mesh>}
    <Html position={[0,0.9,0]} center distanceFactor={28} zIndexRange={[12,1]}><button className={`${styles.nameTag} ${selected ? styles.selectedTag : ""}`} onClick={e => { e.stopPropagation(); onSelect(); }}><i style={{ background: resident.accent }} />{resident.name}{resident.kind === "member" && resident.online && <span className={styles.onlineDot} />}</button></Html>
  </group>;
}
function CameraRig({ focus, zoom, reset, motion }: { focus: PlaceId | null; zoom: number; reset: number; motion:TownMotion }) {
  const controls = useRef<Controls>(null);
  useEffect(() => {
    if (!controls.current) return;
    const p = focus ? placeFor(focus) : { x: 0, z: townLand.z };
    controls.current.target.set(p.x, 0, p.z);
    const aspect = (controls.current.object as THREE.PerspectiveCamera).aspect || 1;
    const distance = focus ? 15 : (aspect < 1 ? 80 : 55);
    controls.current.object.position.set(p.x + distance * 0.7, distance * 0.8, p.z + distance * 0.9);
    controls.current.update();
  }, [focus, reset]);
  const lastZoom = useRef(zoom);
  useFrame((_,delta)=>{
    const control=controls.current;if(!control)return;
    const offsetX=control.object.position.x-control.target.x,offsetZ=control.object.position.z-control.target.z;
    motion.heading.current=Math.atan2(offsetX,offsetZ);
    if(motion.walking&&motion.local.current){
      const x=THREE.MathUtils.damp(control.target.x,motion.local.current.x,4,delta)-control.target.x;
      const z=THREE.MathUtils.damp(control.target.z,motion.local.current.z,4,delta)-control.target.z;
      control.target.x+=x;control.target.z+=z;control.object.position.x+=x;control.object.position.z+=z;
      control.update();
    }
  });
  useEffect(() => { if (zoom === lastZoom.current) return; if (controls.current) { const camera = controls.current.object; camera.position.sub(controls.current.target).multiplyScalar(zoom > lastZoom.current ? 0.8 : 1.25).add(controls.current.target); controls.current.update(); } lastZoom.current = zoom; }, [zoom]);
  return <OrbitControls ref={controls} makeDefault minDistance={7} maxDistance={115} minPolarAngle={0.18} maxPolarAngle={Math.PI / 2.2} enablePan={!motion.walking} enableDamping dampingFactor={0.08} />;
}
export default function JollyTownScene({ residents, selected, onSelect, onPlace, focus, zoom, reset, night, speaking, speechLevel, onFail, motion, meId }: { residents: TownResident[]; selected: string; onSelect: (id: string) => void; onPlace: (id: PlaceId) => void; focus: PlaceId | null; zoom: number; reset: number; night: boolean; speaking: boolean; speechLevel: RefObject<number>; onFail: () => void; motion:TownMotion; meId?:string }) {
  const reduced = useRef(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; setMobile(window.innerWidth < 700); }, []);
  const shown = useMemo(() => {
    const chosen = residents.filter(r => r.id === selected || r.id === meId);
    const nearby = residents.filter(r => !chosen.includes(r)).sort((a,b) => Number(b.kind === "member"&&b.online)*2-Number(a.kind === "member"&&a.online)*2+Number(b.place === focus)-Number(a.place === focus));
    return [...nearby.slice(0, mobile ? 10 : 22), ...chosen];
  }, [residents, selected, focus, mobile, meId]);
  return <Canvas shadows dpr={[1,1.5]} camera={{ position: [38.5,44,40.5], fov: 43, near: 0.1, far: 240 }} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: night ? 0.85 : 1.08 }} onCreated={({gl}) => { gl.domElement.addEventListener("webglcontextlost", onFail, { once: true }); }} aria-label="Interactive 3D Jolly Town. Drag to orbit, pinch or scroll to zoom.">
    <color attach="background" args={[night ? "#252a4b" : "#c9e2e3"]} />
    <fog attach="fog" args={[night ? "#252a4b" : "#c9e2e3", 110, 210]} />
    <ambientLight intensity={night ? 0.5 : 0.65} />
    <hemisphereLight color={night ? "#b7c1fc" : "#fff5e5"} groundColor="#9bbeb6" intensity={1.3} />
    <directionalLight castShadow position={[-25,50,20]} intensity={night ? 1 : 3} color={night ? "#9ab8ff" : "#fff0d5"} shadow-mapSize={[2048,2048]} shadow-camera-left={-55} shadow-camera-right={55} shadow-camera-top={55} shadow-camera-bottom={-55} shadow-camera-far={130} shadow-normalBias={0.05} shadow-bias={-0.0001} />
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.5,0]} receiveShadow><planeGeometry args={[180,180]} /><meshStandardMaterial color={night ? "#3d6280" : "#9acbd4"} roughness={0.35} metalness={0.15} /></mesh>
    <City />
    {places.map(p => <Html key={p.id} position={[p.x,2.6,p.z]} center distanceFactor={43} zIndexRange={[10,1]}><button className={styles.placeTag} onClick={() => onPlace(p.id)}><span style={{color:p.color}}>{p.icon}</span>{p.name}</button></Html>)}
    {shown.map(r => <Neighbor key={r.id} resident={r} selected={selected === r.id} onSelect={() => onSelect(r.id)} speaking={r.id === "jolly" && speaking} speechLevel={speechLevel} reduced={reduced.current} motion={motion} mine={r.id===meId} />)}
    <CameraRig focus={focus} zoom={zoom} reset={reset} motion={motion} />
  </Canvas>;
}
