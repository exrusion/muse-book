"use client";
import {useEffect,useMemo,useRef} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import {lightningLevel,seededUnit,shipPose,type TownEnvironment} from "@/lib/jolly-town-weather";

function Ship({index,now,reduced,night}:{index:number;now:()=>number;reduced:boolean;night:boolean}) {
  const root=useRef<THREE.Group>(null),bob=useRef<THREE.Group>(null);
  useFrame(()=>{if(!root.current)return;const time=reduced?0:now(),p=shipPose(time,index);root.current.position.set(p.x,-0.35,p.z);root.current.rotation.y=p.yaw;if(bob.current){bob.current.rotation.z=reduced?0:Math.sin(time/1600+index)*0.035;bob.current.position.y=reduced?0:Math.sin(time/1200+index)*0.06;}});
  const color=["#7898ad","#d49b82","#91aaa0"][index];
  return <group ref={root}><group ref={bob}>
    <mesh scale={[1.1,0.43,2.7]}><sphereGeometry args={[1,16,8]}/><meshStandardMaterial color={color} roughness={0.65}/></mesh>
    <mesh position={[0,0.32,0]}><boxGeometry args={[1.8,0.18,4]}/><meshStandardMaterial color="#eadcc5"/></mesh>
    <mesh position={[0,0.76,-0.8]}><boxGeometry args={[1.4,0.75,1.7]}/><meshStandardMaterial color="#fff4df"/></mesh>
    <mesh position={[0,1.18,-0.8]}><boxGeometry args={[1.6,0.15,1.8]}/><meshStandardMaterial color={color}/></mesh>
    <mesh position={[0,0.91,0.06]}><boxGeometry args={[1.05,0.27,0.02]}/><meshStandardMaterial color="#789daa" emissive="#ffd89b" emissiveIntensity={night?0.7:0}/></mesh>
    <mesh position={[0,1.45,-1.15]}><cylinderGeometry args={[0.16,0.16,0.5,8]}/><meshStandardMaterial color="#53666b"/></mesh>
    {[-0.7,0.7].map(x=><mesh key={x} position={[x,0.5,1.25]}><sphereGeometry args={[0.08,8,6]}/><meshBasicMaterial color={x<0?"#e7a29a":"#9ed2b1"}/></mesh>)}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.11,-3.3]} scale={[0.95,3.2,1]}><circleGeometry args={[1,16]}/><meshBasicMaterial color="#d4edf0" transparent opacity={0.28} depthWrite={false}/></mesh>
  </group></group>;
}
function Rain({storm,mobile,reduced}:{storm:boolean;mobile:boolean;reduced:boolean}) {
  const count=mobile?280:800;
  const geometry=useMemo(()=>{const g=new THREE.BufferGeometry(),p=new Float32Array(count*6);for(let i=0;i<count;i++){const x=(seededUnit(i*3)-0.5)*85,y=seededUnit(i*3+1)*24,z=(seededUnit(i*3+2)-0.5)*70-9;p.set([x,y,z,x-0.15,y+0.75,z],i*6);}g.setAttribute("position",new THREE.BufferAttribute(p,3));return g;},[count]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame((_,delta)=>{if(reduced)return;const attr=geometry.getAttribute("position");for(let i=0;i<count;i++){const at=i*6;attr.array[at+1]-=Math.min(delta,0.05)*(storm?20:13);if(attr.array[at+1]<0)attr.array[at+1]=24;attr.array[at+4]=attr.array[at+1]+0.75;}attr.needsUpdate=true;});
  return <lineSegments geometry={geometry} frustumCulled={false}><lineBasicMaterial color="#c8deef" transparent opacity={storm?0.5:0.3} depthWrite={false}/></lineSegments>;
}
function Lightning({now,enabled}:{now:()=>number;enabled:boolean}) {
  const flash=useRef<THREE.PointLight>(null),material=useRef<THREE.LineBasicMaterial>(null);
  const bolt=useMemo(()=>{const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-19,22,-21),new THREE.Vector3(-21,18,-20),new THREE.Vector3(-18,18,-20),new THREE.Vector3(-22,13,-19)]);return new THREE.Line(geometry,new THREE.LineBasicMaterial({color:"#d8e7ff",transparent:true,opacity:0}));},[]);
  useEffect(()=>{material.current=bolt.material;return()=>{bolt.geometry.dispose();bolt.material.dispose();};},[bolt]);
  useFrame(()=>{const strength=enabled?lightningLevel(now()):0;if(flash.current)flash.current.intensity=strength*170;if(material.current)material.current.opacity=strength;});
  return <><pointLight ref={flash} position={[-20,17,-20]} color="#c7dcff" intensity={0} distance={85} decay={1}/><primitive object={bolt}/></>;
}
export function JollyTownAtmosphere({environment,mobile,reduced,lightning}:{environment:TownEnvironment;mobile:boolean;reduced:boolean;lightning:boolean}) {
  const anchor=useRef({time:environment.timestamp,at:performance.now()});
  useEffect(()=>{anchor.current={time:environment.timestamp,at:performance.now()};},[environment.timestamp]);
  const now=()=>anchor.current.time+performance.now()-anchor.current.at;
  const clouds=useRef<THREE.Group>(null);
  const wet=environment.weather==="rain"||environment.weather==="storm";
  useFrame(()=>{if(clouds.current&&!reduced)clouds.current.position.x=Math.sin(now()/60000)*5;});
  return <>
    {[0,1,2].map(index=><Ship key={index} index={index} now={now} reduced={reduced} night={environment.night}/>)}
    {environment.weather!=="clear"&&<group ref={clouds}>{Array.from({length:mobile?5:9},(_,i)=><group key={i} position={[(seededUnit(i+90)-0.5)*90,17+seededUnit(i+80)*5,(seededUnit(i+70)-0.5)*65-9]}>{[-2,0,2].map((x,j)=><mesh key={j} position={[x,j===1?0.6:0,0]} scale={[2.8,1,1.8]}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color={wet?"#7d899c":"#dce3e4"} transparent opacity={wet?0.82:0.68} depthWrite={false}/></mesh>)}</group>)}</group>}
    {wet&&<Rain storm={environment.weather==="storm"} mobile={mobile} reduced={reduced}/>}
    <Lightning now={now} enabled={environment.weather==="storm"&&lightning&&!reduced}/>
  </>;
}
