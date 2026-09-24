"use client";
import {useState} from "react";
import {weatherIcons,weatherLabels,type TownWeather} from "@/lib/jolly-town-weather";
import type {useTownEnvironment} from "./useTownEnvironment";
import styles from "./JollyTown.module.css";
export function TownWeatherControls({climate}:{climate:ReturnType<typeof useTownEnvironment>}) {
  const [open,setOpen]=useState(false),{environment,ready,weather,setWeather,lightning,setLightning,reduced}=climate;
  return <div className={styles.weatherWidget}>
    <button className={styles.weatherClock} onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-controls="town-weather-options" aria-label="Town time and weather settings"><span aria-hidden="true">{environment.weather==="clear"&&environment.night?"☾":weatherIcons[environment.weather]}</span><span><strong>{ready?environment.clock:"--:--"} <small>ET</small></strong><small>US Eastern · {environment.period} · {weatherLabels[environment.weather]}</small></span></button>
    {open&&<div className={styles.weatherOptions} id="town-weather-options"><strong>{ready?environment.date:"Town clock"} · US Eastern</strong><p>Day and night follow New York time. Town weather is simulated and changes throughout the day. Manual previews affect only your view.</p><label>Weather<select value={weather??"auto"} onChange={e=>setWeather(e.target.value==="auto"?undefined:e.target.value as TownWeather)}><option value="auto">Automatic town weather</option>{Object.entries(weatherLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className={styles.lightningOption}><input type="checkbox" checked={lightning&&!reduced} disabled={reduced} onChange={e=>setLightning(e.target.checked)}/>Lightning effects</label>{reduced&&<small>Reduced motion is active.</small>}<button className={styles.textButton} onClick={()=>setOpen(false)}>Done</button></div>}
  </div>;
}
