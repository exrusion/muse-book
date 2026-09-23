"use client";
import type { TownMotion } from "./useTownMovement";
import styles from "./JollyTown.module.css";
export function TownWalkingControls({motion,name,onStart}:{motion:TownMotion;name?:string;onStart:()=>void}) {
  return <div className={styles.walkControls}>
    <div className={styles.walkBar}><span className={motion.connected?styles.connected:styles.reconnecting}>{motion.connected?"● Live town":"◌ Reconnecting"}</span><button onClick={()=>motion.walking?motion.setWalking(false):onStart()} disabled={!!name&&!motion.connected}>{motion.walking?"Stop walking":name?"Walk as "+name:"Join to walk"}</button></div>
    {motion.walking&&<><p>WASD / arrow keys · Drag to look around</p><div className={styles.dpad} role="group" aria-label="Walking controls">{[{label:"Walk forward",mark:"↑",x:0,z:-1},{label:"Walk left",mark:"←",x:-1,z:0},{label:"Walk backward",mark:"↓",x:0,z:1},{label:"Walk right",mark:"→",x:1,z:0}].map(d=><button key={d.label} aria-label={d.label} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);motion.stick.current={x:d.x,z:d.z};}} onPointerUp={()=>{motion.stick.current={x:0,z:0};}} onPointerCancel={()=>{motion.stick.current={x:0,z:0};}} onLostPointerCapture={()=>{motion.stick.current={x:0,z:0};}}>{d.mark}</button>)}</div></>}
  </div>;
}
