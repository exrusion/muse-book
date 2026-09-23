"use client";
import { useCallback,useEffect,useRef,useState, type RefObject } from "react";
import { spawnPosition,walkStep,WALK_SPEED,type TownPosition,type TownResident } from "@/lib/jolly-town-shared";
export type LivePose=TownPosition & { receivedAt:number };
export type TownMotion={ poses:RefObject<Map<string,LivePose>>; local:RefObject<TownPosition|null>; heading:RefObject<number>; walking:boolean; connected:boolean; setWalking:(value:boolean)=>void; stick:RefObject<{x:number;z:number}>; reset:(position:TownPosition)=>void };
export function useTownMovement(me:TownResident|null,residents:TownResident[],blocked:boolean,onRoster:()=>Promise<void>,onError:(message:string)=>void):TownMotion {
  const poses=useRef(new Map<string,LivePose>()),local=useRef<TownPosition|null>(null),authoritative=useRef<TownPosition|null>(null);
  const heading=useRef(0),stick=useRef({x:0,z:0}),keys=useRef(new Set<string>());
  const [walking,setWalking]=useState(false),[connected,setConnected]=useState(false);
  const settings=useRef({me,blocked,walking,connected,onRoster,onError});settings.current={me,blocked,walking,connected,onRoster,onError};
  const inFlight=useRef(false);
  const reset=useCallback((position:TownPosition)=>{local.current={...position};authoritative.current={...position};poses.current.set(position.id,{...position,receivedAt:performance.now()});},[]);
  useEffect(()=>{
    for(const resident of residents) if(resident.position&&!poses.current.has(resident.id))poses.current.set(resident.id,{...resident.position,receivedAt:performance.now()});
    if(me&&local.current?.id!==me.id)reset(me.position||{id:me.id,...spawnPosition(me.id,me.place),yaw:0,moving:false,version:0,online:true});
    if(!me){local.current=null;authoritative.current=null;setWalking(false);}
  },[me,residents,reset]);
  useEffect(()=>{
    let source:EventSource|null=null,disposed=false,lastRoster=0;
    function accept(position:TownPosition) {
      const previous=poses.current.get(position.id);
      if(previous&&previous.version>position.version)return;
      poses.current.set(position.id,{...position,receivedAt:performance.now()});
      if(position.id===local.current?.id&&position.version>local.current.version&&!inFlight.current) reset(position);
    }
    function open() {
      source?.close();if(disposed||document.visibilityState!=="visible")return;
      source=new EventSource("/api/jolly/town/live");
      source.onmessage=event=>{
        try {
          const update=JSON.parse(event.data);
          if(update.type==="position")accept(update.position);
          if(update.type==="snapshot") { update.players.forEach(accept); setConnected(true); }
          if(update.type==="roster"&&Date.now()-lastRoster>1000){lastRoster=Date.now();void settings.current.onRoster();}
          if(update.type==="unavailable"){setConnected(false);keys.current.clear();stick.current={x:0,z:0};}
        }catch{/* An incomplete stream packet is replaced by the next snapshot. */}
      };
      source.onerror=()=>{if(!disposed){setConnected(false);keys.current.clear();stick.current={x:0,z:0};}};
    }
    const visibility=()=>{keys.current.clear();stick.current={x:0,z:0};if(document.visibilityState==="visible")open();else{source?.close();setConnected(false);}};
    open();document.addEventListener("visibilitychange",visibility);
    return ()=>{disposed=true;source?.close();document.removeEventListener("visibilitychange",visibility);};
  },[reset]);
  useEffect(()=>{
    const codes=new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight"]);
    const down=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(!settings.current.walking||settings.current.blocked||target?.closest("input,textarea,select,[contenteditable=true],dialog"))return;
      if(codes.has(event.code)){event.preventDefault();keys.current.add(event.code);}
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code);
    const clear=()=>{keys.current.clear();stick.current={x:0,z:0};};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",clear);
    return ()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",clear);};
  },[]);
  useEffect(()=>{
    if(!walking||blocked){keys.current.clear();stick.current={x:0,z:0};}
  },[walking,blocked]);
  useEffect(()=>{
    let frame=0,disposed=false,lastFrame=performance.now(),lastSend=0,lastMoving=false;
    let abort:AbortController|null=null;
    async function send(position:TownPosition) {
      if(inFlight.current)return;inFlight.current=true;lastSend=performance.now();lastMoving=position.moving;
      abort=new AbortController();const timeout=setTimeout(()=>abort?.abort(),5000);
      try {
        const response=await fetch("/api/jolly/town/position",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(position),signal:abort.signal});
        const body=await response.json();if(disposed||local.current?.id!==position.id)return;
        if(response.status===409&&body.position){reset(body.position);return;}
        if(!response.ok)throw new Error(body.error||"Movement is reconnecting.");
        authoritative.current=body.position;
        if(local.current&&body.position.version>=local.current.version){local.current.version=body.position.version;local.current.online=true;}
      }catch(error){
        if(!disposed){setWalking(false);keys.current.clear();stick.current={x:0,z:0};if(authoritative.current)reset({...authoritative.current,moving:false});settings.current.onError(error instanceof Error&&error.name!=="AbortError"?error.message:"Movement paused. Check your connection and tap Walk again.");}
      }finally{clearTimeout(timeout);inFlight.current=false;}
    }
    function tick(now:number) {
      const dt=Math.min((now-lastFrame)/1000,0.05);lastFrame=now;
      const state=settings.current,position=local.current;
      if(position&&state.me&&state.connected&&document.visibilityState==="visible"){
        let dx=0,dz=0;
        if(state.walking&&!state.blocked){
          dx=Number(keys.current.has("KeyD")||keys.current.has("ArrowRight"))-Number(keys.current.has("KeyA")||keys.current.has("ArrowLeft"))+stick.current.x;
          dz=Number(keys.current.has("KeyS")||keys.current.has("ArrowDown"))-Number(keys.current.has("KeyW")||keys.current.has("ArrowUp"))+stick.current.z;
        }
        const length=Math.hypot(dx,dz);let moving=false;
        if(length>0){
          dx/=Math.max(1,length);dz/=Math.max(1,length);
          const angle=heading.current,wx=dx*Math.cos(angle)+dz*Math.sin(angle),wz=-dx*Math.sin(angle)+dz*Math.cos(angle);
          const next=walkStep(position.x,position.z,wx*WALK_SPEED*dt,wz*WALK_SPEED*dt);
          moving=Math.hypot(next.x-position.x,next.z-position.z)>0.0001;
          position.x=next.x;position.z=next.z;position.yaw=Math.atan2(wx,wz);
        }
        position.moving=moving;
        poses.current.set(position.id,{...position,receivedAt:now});
        if(!inFlight.current&&((moving&&now-lastSend>=200)||(!moving&&lastMoving)||now-lastSend>10000))void send({...position});
      }
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    return ()=>{disposed=true;abort?.abort();cancelAnimationFrame(frame);keys.current.clear();};
  },[reset]);
  return {poses,local,heading,stick,walking,connected,setWalking,reset};
}
