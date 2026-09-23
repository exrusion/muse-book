"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./HeaderJolly.module.css";

function Portrait() { return <span className={styles.portrait}><img src="/jolly-reference.webp" width="1200" height="1200" alt="" /></span>; }
const Scene=dynamic(()=>import("./HeaderJollyScene"),{ssr:false,loading:()=> <Portrait/>});
class Boundary extends Component<{children:ReactNode;onFail:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFail();}
  render(){return this.state.failed?<Portrait/>:this.props.children;}
}
export function HeaderJolly() {
  const root=useRef<HTMLSpanElement>(null);
  const [visible,setVisible]=useState(false),[awake,setAwake]=useState(true),[motion,setMotion]=useState(false);
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference=()=>setMotion(!media.matches),visibility=()=>setAwake(document.visibilityState==="visible");
    preference();visibility();media.addEventListener("change",preference);document.addEventListener("visibilitychange",visibility);
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:0});
    if(root.current)observer.observe(root.current);
    try {const canvas=document.createElement("canvas"),gl=canvas.getContext("webgl2");setReady(!!gl);gl?.getExtension("WEBGL_lose_context")?.loseContext();}catch{setFailed(true);}
    return()=>{observer.disconnect();media.removeEventListener("change",preference);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const active=visible&&awake;
  return <span ref={root} className={`${styles.mascot} ${active&&motion?styles.animated:""}`} aria-hidden="true">
    {ready&&!failed?<Boundary onFail={()=>setFailed(true)}><Scene active={active} motion={motion} onFail={()=>setFailed(true)}/></Boundary>:<Portrait/>}
  </span>;
}
