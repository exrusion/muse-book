"use client";
import {useEffect,useRef,useState} from "react";
import {townEnvironment,type TownWeather} from "@/lib/jolly-town-weather";
export function useTownEnvironment(serverTime?:number) {
  const [timestamp,setTimestamp]=useState<number|null>(null),[weather,setWeather]=useState<TownWeather|undefined>(),[lightning,setLightning]=useState(true),[reduced,setReduced]=useState(false);
  const anchor=useRef<{time:number;at:number}|null>(null);
  useEffect(()=>{if(serverTime){anchor.current={time:serverTime,at:performance.now()};setTimestamp(serverTime);}},[serverTime]);
  useEffect(()=>{
    const tick=()=>setTimestamp(anchor.current?anchor.current.time+performance.now()-anchor.current.at:Date.now());
    const preference=window.matchMedia("(prefers-reduced-motion: reduce)"),update=()=>setReduced(preference.matches);
    tick();update();const timer=setInterval(tick,10000);document.addEventListener("visibilitychange",tick);preference.addEventListener("change",update);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",tick);preference.removeEventListener("change",update);};
  },[]);
  const environment=townEnvironment(timestamp??Date.UTC(2026,0,1,17),weather);
  return {environment,ready:timestamp!==null,weather,setWeather,lightning,setLightning,reduced};
}
