"use client";
import {useEffect,useRef} from "react";
import {Canvas,useFrame,useThree} from "@react-three/fiber";
import * as THREE from "three";
import {JollyPlush} from "./JollyPlush";
const noop=()=>{};
function Miniature({active,motion}:{active:boolean;motion:boolean}) {
  const body=useRef<THREE.Group>(null),shadow=useRef<THREE.Mesh>(null),silent=useRef(0),elapsed=useRef(0);
  const {invalidate}=useThree();
  useEffect(()=>{
    invalidate();if(!active||!motion)return;
    const timer=setInterval(invalidate,1000/30);return()=>clearInterval(timer);
  },[active,motion,invalidate]);
  useFrame((_,delta)=>{
    if(!body.current||!shadow.current)return;
    if(active&&motion)elapsed.current+=Math.min(delta,.06);
    const phase=elapsed.current*2.5,hop=motion?Math.pow(Math.max(0,Math.sin(phase)),1.6):0;
    body.current.position.y=hop*.24;
    body.current.rotation.y=motion?Math.sin(phase*.5)*.2:0;
    body.current.rotation.z=motion?Math.sin(phase)*.035:0;
    body.current.scale.set(1-hop*.025,1+hop*.025,1);
    shadow.current.scale.setScalar(1-hop*.22);
    (shadow.current.material as THREE.MeshBasicMaterial).opacity=.12-hop*.045;
  });
  return <>
    <ambientLight intensity={.55}/>
    <hemisphereLight intensity={.65} color="#fff5e7" groundColor="#94785c"/>
    <directionalLight position={[-3,4,5]} intensity={2.8} color="#fff0d9"/>
    <directionalLight position={[3,2,-3]} intensity={1.8} color="#eee6ff"/>
    <group ref={body}><JollyPlush detail="town" state="idle" onTap={noop} speechLevel={silent}/></group>
    <mesh ref={shadow} rotation={[-Math.PI/2,0,0]} position={[0,-1.4,0]}><circleGeometry args={[.68,32]}/><meshBasicMaterial color="#71553f" transparent opacity={.12} depthWrite={false}/></mesh>
  </>;
}
export default function HeaderJollyScene({active,motion,onFail}:{active:boolean;motion:boolean;onFail:()=>void}) {
  return <Canvas frameloop="demand" dpr={[1,1.5]} camera={{position:[0,.15,6],fov:34,near:.1,far:20}} gl={{alpha:true,antialias:true,powerPreference:"low-power",toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.05}} onCreated={({gl})=>{gl.setClearColor(0,0);gl.domElement.addEventListener("webglcontextlost",onFail,{once:true});}}>
    <Miniature active={active} motion={motion}/>
  </Canvas>;
}
