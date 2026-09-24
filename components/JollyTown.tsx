"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { accents, guide, places, placeFor, spawnPosition, type PlaceId, type TownEvent, type TownResident } from "@/lib/jolly-town-shared";
import { mapX, mapZ, townMap, townLand, townRoads, townBuildings, townTrees, townPonds } from "@/lib/jolly-town-layout";
import { useJollyVoice } from "./useJollyVoice";
import styles from "./JollyTown.module.css";
import { useTownMovement, type TownMotion } from "./useTownMovement";
import { TownWalkingControls } from "./TownWalkingControls";

const TownScene = dynamic(() => import("./JollyTownScene"), { ssr: false, loading: () => <div className={styles.loading}>Opening the gates…</div> });
type TownData = { residents: TownResident[]; me: TownResident | null; identity: { name: string; type: "wallet" | "x" } | null; events: TownEvent[]; memberCount: number; tokenConfigured: boolean; xLoginUrl: string | null };
type ChatMessage = { role: "user" | "assistant"; content: string };
type WalletProvider = { connect: () => Promise<{ publicKey: { toString(): string } }>; signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }> };
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Please try again in a moment."); return result;
}
class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function Face({ color = accents[0], large = false }: { color?: string; large?: boolean }) {
  return <span className={`${styles.face} ${large ? styles.largeFace : ""}`} style={{ "--accent": color } as CSSProperties} aria-hidden="true"><span><i /><i /><b /></span></span>;
}
function MapResident({resident,selected,onSelect,motion}:{resident:TownResident;selected:string;onSelect:(id:string)=>void;motion:TownMotion}) {
  const circle=useRef<SVGCircleElement>(null),position=spawnPosition(resident.id,resident.place);
  useEffect(()=>{let frame=0;const tick=()=>{const pose=motion.local.current?.id===resident.id?motion.local.current:motion.poses.current.get(resident.id);if(pose&&circle.current){circle.current.setAttribute("cx",String(mapX(pose.x)));circle.current.setAttribute("cy",String(mapZ(pose.z)));}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[resident.id,motion.local,motion.poses]);
  return <circle ref={circle} role="button" tabIndex={0} aria-label={resident.name} onClick={()=>onSelect(resident.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(resident.id);}}} cx={mapX(position.x)} cy={mapZ(position.z)} r={selected===resident.id?6:4} fill={resident.accent} stroke={selected===resident.id?"#33324c":"#fff8e9"} strokeWidth="1.5"/>;
}
function TownMap({ residents, selected, onSelect, onPlace, motion, large = false }: { motion:TownMotion; residents: TownResident[]; selected: string; onSelect: (id: string) => void; onPlace: (id: PlaceId) => void; large?: boolean }) {
  return <svg viewBox={`0 0 ${townMap.width} ${townMap.height}`} className={large ? styles.fullMap : styles.miniMap} role="group" aria-label="Town map. Select a neighborhood or resident.">
    <rect width={townMap.width} height={townMap.height} rx="24" fill="#a9d4db" />
    <rect x={mapX(-townLand.width/2)} y={mapZ(townLand.z-townLand.depth/2)} width={townLand.width*10} height={townLand.depth*10} rx="14" fill="#dddbc6" />
    <rect x={mapX(-29.4)} y={mapZ(-32.4)} width="588" height="468" rx="10" fill="#b9cdb0" />
    {townRoads.x.map(x => <g key={x}><path d={`M${mapX(x)} ${mapZ(-32.2)}V${mapZ(14.2)}`} stroke="#ede3ce" strokeWidth="26"/><path d={`M${mapX(x)} ${mapZ(-32.2)}V${mapZ(14.2)}`} stroke="#8c9f9e" strokeWidth="18"/><path d={`M${mapX(x)} ${mapZ(-32.2)}V${mapZ(14.2)}`} stroke="#e5e8d8" strokeWidth="1" strokeDasharray="5 7"/></g>)}
    {townRoads.z.map(z => <g key={z}><path d={`M${mapX(-29.4)} ${mapZ(z)}H${mapX(29.4)}`} stroke="#ede3ce" strokeWidth="26"/><path d={`M${mapX(-29.4)} ${mapZ(z)}H${mapX(29.4)}`} stroke="#8c9f9e" strokeWidth="18"/><path d={`M${mapX(-29.4)} ${mapZ(z)}H${mapX(29.4)}`} stroke="#e5e8d8" strokeWidth="1" strokeDasharray="5 7"/></g>)}
    {places.map(p => <circle key={p.id} cx={mapX(p.x)} cy={mapZ(p.z)} r={p.id==="plaza"?35:28} fill="#e9dfc9" />)}
    {townBuildings.map(([x,z,w,d,,color],i) => <g key={i}><rect x={mapX(x-w/2)+3} y={mapZ(z-d/2)+4} width={w*10} height={d*10} rx="3" fill="#728176" opacity=".18"/><rect x={mapX(x-w/2)} y={mapZ(z-d/2)} width={w*10} height={d*10} rx="3" fill={color} stroke="#f4ecda" strokeWidth="2"/></g>)}
    <circle cx={mapX(0)} cy={mapZ(0)} r="13" fill="#91cad5" stroke="#cfba9f" strokeWidth="3"/>
    <circle cx={mapX(0)} cy={mapZ(-26.8)} r="15" fill="#90aaa9" stroke="#f4ecda" strokeWidth="2"/>
    {townPonds.map(p => <ellipse key={p.x} cx={mapX(p.x)} cy={mapZ(p.z)} rx={p.rx*10} ry={p.rz*10} fill="#91cad5"/>)}
    <rect x={mapX(-1.5)} y={mapZ(12.9)} width="30" height="40" rx="3" fill="#cba885" />
    {townTrees.map(([x,z],i) => <circle key={i} cx={mapX(x)} cy={mapZ(z)} r="6" fill={x>18?"#dcaebf":"#87ac8f"} stroke="#adcba1" strokeWidth="2" />)}
    {places.map(p => <g key={p.id} role="button" tabIndex={0} aria-label={p.name} onClick={() => onPlace(p.id)} onKeyDown={e => { if(e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlace(p.id); } }} className={styles.mapTarget}><circle cx={mapX(p.x)} cy={mapZ(p.z)} r="18" fill={p.color} stroke="#fff7e7" strokeWidth="3" /><text x={mapX(p.x)} y={mapZ(p.z)+5} textAnchor="middle" fontSize="17" fill="#fff">{p.icon}</text>{large && <text x={mapX(p.x)} y={mapZ(p.z)+31} textAnchor="middle" fontSize="9" fontWeight="700" fill="#425654" stroke="#f9f4e8" strokeWidth="3" paintOrder="stroke">{p.name}</text>}</g>)}
    {residents.map(r=><MapResident key={r.id} resident={r} selected={selected} onSelect={onSelect} motion={motion}/>)}
  </svg>;
}

function JoinDialog({ data, onClose, onSaved, onRefresh, onError }: { data: TownData | null; onClose: () => void; onSaved: (resident: TownResident) => void; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  const [name,setName] = useState(data?.me?.name || data?.identity?.name || "");
  const [accent,setAccent] = useState<string>(data?.me?.accent || accents[0]);
  const [place,setPlace] = useState<PlaceId>(data?.me?.place || "homes");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { if(data?.me) { setName(data.me.name); setAccent(data.me.accent); setPlace(data.me.place); } else if(data?.identity?.name) setName(data.identity.name); }, [data?.me?.id, data?.identity?.name]);
  async function wallet() {
    setBusy(true); setError("");
    try {
      const w = window as typeof window & { phantom?: { solana?: WalletProvider }; solflare?: WalletProvider; solana?: WalletProvider };
      const provider = w.phantom?.solana || w.solflare || w.solana;
      if (!provider) throw new Error("Open this page in the Phantom app browser on mobile, or install Phantom or Solflare on desktop.");
      const { publicKey } = await provider.connect(), address = publicKey.toString();
      const { message } = await api("/api/jolly/town/wallet", "POST", { address });
      const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      const signature = btoa(String.fromCharCode(...signed.signature));
      await api("/api/jolly/town/wallet", "POST", { address, signature });
      await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Wallet connection was cancelled."); }
    finally { setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if(busy) return; setBusy(true); setError("");
    try { const result = await api("/api/jolly/town", "POST", { name, accent, place }); await onRefresh(); onSaved(result.me); }
    catch(err) { setError(err instanceof Error ? err.message : "Could not save your Jolly."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.joinDialog} onCancel={onClose} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
    <button className={styles.close} onClick={onClose} aria-label="Close join window">×</button>
    <Face color={accent} large /><span className={styles.eyebrow}>A place for your Jolly</span><h2>{data?.me ? "Make yourself at home." : "Every town needs you."}</h2>
    <p>Choose your look, find your favorite spot, and become part of Jolly Town.</p>
    {!data?.identity ? <div className={styles.joinOptions}>
      {data?.xLoginUrl ? <a className={styles.primary} href={data.xLoginUrl}>𝕏 &nbsp; Join with X <span>→</span></a> : <button className={styles.primary} disabled>X sign-in is unavailable</button>}
      <button className={styles.secondary} onClick={() => void wallet()} disabled={busy}>{busy ? "Waiting for your wallet…" : "Connect Solana wallet"}</button>
      <small>{data?.tokenConfigured ? "Token holders can join with a verified wallet. X entry is also open." : "Wallet entry is open. Coin holder verification will start after the token launch."}</small>
      <small>Wallet sign-in uses a message signature. No payment or transaction.</small>
    </div> : <form onSubmit={save} className={styles.profileForm}>
      <span className={styles.signedIn}>✓ Signed in with {data.identity.type === "x" ? "X" : "your wallet"}</span>
      <label>Your public name<input autoFocus required minLength={2} maxLength={28} value={name} onChange={e => setName(e.target.value)} placeholder="What should the neighbors call you?" /></label>
      <fieldset><legend>Your Jolly colour</legend><div className={styles.swatches}>{accents.map(c => <button key={c} type="button" style={{background:c}} aria-label={`Choose ${["lavender","peach","sage","sky","honey","rose"][accents.indexOf(c)]}`} aria-pressed={accent===c} onClick={() => setAccent(c)}>{accent===c?"✓":""}</button>)}</div></fieldset>
      <label>Your first stop<select value={place} onChange={e => setPlace(e.target.value as PlaceId)}>{places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button className={styles.primary} disabled={busy || name.trim().length<2}>{busy ? "Saving your Jolly…" : data.me ? "Save my Jolly" : "Move into town →"}</button>
      <small>Your name, colour, location, and town actions are visible to other visitors.</small>
      {data.identity.type === "wallet" && <button type="button" className={styles.textButton} onClick={async () => { try { await api("/api/jolly/town/wallet","DELETE"); await onRefresh(); } catch { onError("Could not disconnect. Please try again."); } }}>Disconnect wallet</button>}
      {data.me && <button type="button" className={styles.textButton} onClick={async () => { if(!window.confirm("Remove your Jolly Town profile and town activity? You can create a new profile later.")) return; try { await api("/api/jolly/town","DELETE"); await onRefresh(); onClose(); } catch { setError("Could not remove your profile. Please try again."); } }}>Leave the town</button>}
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </dialog>;
}

export function JollyTown() {
  const [data,setData] = useState<TownData | null>(null), [loadError,setLoadError] = useState("");
  const [selected,setSelected] = useState("jolly"), [focus,setFocus] = useState<PlaceId | null>(null);
  const [panel,setPanel] = useState<"welcome"|"resident"|"place"|"places"|"activity"|"chat"|null>("welcome");
  const [join,setJoin] = useState(false), [night,setNight] = useState(false), [zoom,setZoom] = useState(0), [reset,setReset] = useState(0);
  const [webgl,setWebgl] = useState<boolean | null>(null), [mapView,setMapView] = useState(false);
  const [toast,setToast] = useState(""), [actionBusy,setActionBusy] = useState(false);
  const [messages,setMessages] = useState<ChatMessage[]>([{role:"assistant",content:"Welcome to my little corner of the world. Pick a neighborhood, meet the neighbors, or come make a Jolly of your own."}]);
  const [input,setInput] = useState(""), [thinking,setThinking] = useState(false), [speaking,setSpeaking] = useState(false), [voiceEnabled,setVoiceEnabled] = useState(true);
  const voice = useJollyVoice(setSpeaking), voiceOn = useRef(true), inFlight = useRef(false), mounted = useRef(true);
  const messageEnd = useRef<HTMLDivElement>(null), refreshSequence = useRef(0);
  const residents = data?.residents || [guide], person = residents.find(r=>r.id===selected) || guide;
  const activePlace = placeFor(focus || person.place);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try { const result = await api("/api/jolly/town"); if(mounted.current && sequence===refreshSequence.current) { setData(result); setLoadError(""); } }
    catch(err) { if(mounted.current && sequence===refreshSequence.current) setLoadError(err instanceof Error ? err.message : "Could not load town."); }
  }, []);
  const motion=useTownMovement(data?.me||null,residents,join||panel!==null,refresh,setToast);
  useEffect(()=>{if(!webgl||mapView)motion.heading.current=0;},[webgl,mapView,motion.heading]);
  function startWalking(){if(!data?.me){setJoin(true);return;}setSelected(data.me.id);setFocus(data.me.place);setReset(r=>r+1);setPanel(null);motion.setWalking(true);}
  useEffect(() => {
    mounted.current=true; void refresh();
    try { const canvas=document.createElement("canvas"), gl=canvas.getContext("webgl2"); setWebgl(!!gl); gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { setWebgl(false); }
    if(new URLSearchParams(window.location.search).get("welcome")) { setJoin(true); window.history.replaceState({},"","/town"); }
    const timer=setInterval(() => { if(document.visibilityState==="visible") void refresh(); },20000);
    return () => { mounted.current=false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { if(!toast) return; const timer=setTimeout(()=>setToast(""),5000); return () => clearTimeout(timer); },[toast]);
  useEffect(() => { messageEnd.current?.scrollIntoView({behavior:"smooth",block:"nearest"}); },[messages,thinking]);
  const select = (id:string) => { const r=residents.find(p=>p.id===id); setSelected(id); if(r) setFocus(r.place); setPanel(r?.kind==="guide"?"chat":"resident"); };
  const choosePlace = (id:PlaceId) => { setFocus(id); setPanel("place"); };
  async function action(kind:"move"|"wave", place?:PlaceId) {
    if(!data?.me) { setJoin(true); return; } if(actionBusy) return;
    setActionBusy(true);
    try { if(kind==="move")motion.setWalking(false); const result=await api("/api/jolly/town","PATCH",{action:kind,place}); if(kind==="move"&&result.position)motion.reset(result.position); await refresh(); if(kind==="move"&&place) { setSelected(data.me.id); setFocus(place); } setToast(kind==="wave"?"You waved to the town. 👋":`Your Jolly is heading to ${placeFor(place!).name}.`); }
    catch(err) { setToast(err instanceof Error?err.message:"Please try again."); }
    finally { setActionBusy(false); }
  }
  async function ask(question:string) {
    const text=question.trim(); if(!text||inFlight.current) return; inFlight.current=true; voice.stop(); setSpeaking(false); if(voiceOn.current) voice.warmUp();
    setThinking(true); setInput(""); setPanel("chat"); setSelected("jolly");
    const history=messages.slice(-8); setMessages(m=>[...m,{role:"user",content:text}]);
    try { const reply=await api("/api/jolly/chat","POST",{message:text,history}); if(!mounted.current) return; setMessages(m=>[...m,{role:"assistant",content:reply.reply}]); if(voiceOn.current) void voice.speak(reply.reply,reply.voiceToken); }
    catch(err) { if(mounted.current) setToast(err instanceof Error?err.message:"Jolly could not answer."); }
    finally { inFlight.current=false; if(mounted.current) setThinking(false); }
  }
  return <main className={`${styles.town} ${night?styles.night:""}`}>
    <div className={styles.world}>{webgl&&!mapView ? <SceneBoundary onFail={()=>setWebgl(false)}><TownScene motion={motion} meId={data?.me?.id} residents={residents} selected={selected} onSelect={select} onPlace={choosePlace} focus={focus} zoom={zoom} reset={reset} night={night} speaking={speaking} speechLevel={voice.level} onFail={()=>setWebgl(false)} /></SceneBoundary> : <div className={styles.mapWorld}><TownMap motion={motion} residents={residents} selected={selected} onSelect={select} onPlace={choosePlace} large />{webgl===null&&<div className={styles.loading}>Opening Jolly Town…</div>}</div>}</div>
    <header className={styles.topbar}>
      <Link href="/jolly" className={styles.townBrand}><Face /><span>Jolly <span>Bot</span><small>A growing world. A place for everyone.</small></span></Link>
      <div className={styles.viewSwitch}><Link href="/jolly">Jolly</Link><span aria-current="page">Town</span></div>
      <div className={styles.topActions}><button className={styles.weather} onClick={()=>setNight(n=>!n)} aria-label={night?"Switch to daytime":"Switch to evening"}>{night?"☾":"☀"}<span>{night?"Evening":"Golden hour"}</span></button><button className={styles.primary} onClick={()=>setJoin(true)}>{data?.me?"My Jolly":"Join the town"}<span>↗</span></button></div>
    </header>
    <div className={styles.worldStatus}><i />{data?`${data.memberCount} ${data.memberCount===1?"member":"members"} · ${residents.filter(r=>r.kind==="agent").length} Muse neighbors`:"Welcome to Jolly Town"}<span>{!webgl||mapView?"MAP VIEW":"3D TOWN"}</span></div>
    {loadError&&<div className={styles.loadError} role="alert">{loadError}<button onClick={()=>void refresh()}>Retry</button></div>}
    <div className={styles.cameraTools}>
      <button onClick={()=>{motion.setWalking(false);setFocus(null);setReset(r=>r+1);}} aria-label="Show whole town" title="Show whole town">⌂</button>
      {webgl&&!mapView&&<><button onClick={()=>setZoom(z=>z+1)} aria-label="Zoom in">+</button><button onClick={()=>setZoom(z=>z-1)} aria-label="Zoom out">−</button></>}
      <button onClick={()=>setMapView(v=>!v)} disabled={!webgl} aria-label="Toggle map view" title="Map view">▦</button>
      <button onClick={()=>setPanel(panel==="activity"?null:"activity")} aria-label="Town activity" title="Town activity">≋</button>
    </div>
    <aside className={styles.mapCard}><div><span>{places.length} NEIGHBORHOODS</span><span>↗</span></div><TownMap motion={motion} residents={residents} selected={selected} onSelect={select} onPlace={choosePlace} /><p>Pick a place to explore</p></aside>
    {panel&&<aside className={styles.panel} aria-label="Town details">
      <button className={styles.close} onClick={()=>setPanel(null)} aria-label="Close town details">×</button>
      {panel==="welcome"&&<><span className={styles.eyebrow}>{places.length} neighborhoods. One Jolly Town.</span><h1>Life’s better<br/>with a little <em>Jolly.</em></h1><p>A town of soft souls and curious minds. Explore the market, visit the observatory, and find a place that feels like you.</p><div className={styles.welcomeFaces}>{accents.slice(0,4).map(c=><Face color={c} key={c}/>)}</div><button className={styles.primary} onClick={()=>setJoin(true)}>Make a Jolly of your own <span>→</span></button><button className={styles.textButton} onClick={()=>{setPanel(null);setFocus(null);}}>Just exploring? Come on in.</button><div className={styles.tokenNote}><span>✦</span><div><strong>A town for the community</strong><small>{data?.tokenConfigured?"Join with X or a verified token wallet.":"Join with X or a wallet. Holder access arrives with the coin launch."}</small></div></div></>}
      {panel==="places"&&<><span className={styles.eyebrow}>Explore the expanded town</span><h2>Find your next stop.</h2><p>{places.length} neighborhoods, connected by streets, gardens, and a little curiosity.</p><div className={styles.placeDirectory}>{places.map(p=><button key={p.id} onClick={()=>choosePlace(p.id)}><span style={{background:p.color}}>{p.icon}</span><strong>{p.name}</strong><b>↗</b></button>)}</div></>}
      {panel==="place"&&<><span className={styles.eyebrow}>Around the neighborhood</span><span className={styles.placeIcon} style={{background:activePlace.color}}>{activePlace.icon}</span><h2>{activePlace.name}</h2><p>{activePlace.description}</p><button className={styles.primary} disabled={actionBusy} onClick={()=>void action("move",activePlace.id)}>{data?.me?.place===activePlace.id?"You’re here":"Bring my Jolly here"}<span>→</span></button><button className={styles.textButton} onClick={()=>setPanel("places")}>Explore all {places.length} neighborhoods →</button><h3>In the neighborhood</h3><div className={styles.neighborList}>{residents.filter(r=>r.place===activePlace.id).map(r=><button key={r.id} onClick={()=>select(r.id)}><Face color={r.accent}/><span>{r.name}<small>{r.kind==="member"?"Community member":r.role}</small></span><b>↗</b></button>)}</div></>}
      {panel==="resident"&&<><Face color={person.accent} large /><span className={styles.eyebrow}>{person.kind==="member"?"One of us":"Muse neighbor · Jolly form"}</span><h2>{person.name}</h2><p>{person.role} · {placeFor(person.place).name}</p>{person.holder&&<span className={styles.signedIn}>✦ Verified token holder</span>}{person.kind==="member"?<><p>Every member gets their own Jolly and a place in the town.</p><button className={styles.primary} disabled={actionBusy} onClick={()=>void action("wave")}>Wave to the town <span>👋</span></button>{person.id===data?.me?.id&&<button className={styles.secondary} onClick={()=>setJoin(true)}>Edit my Jolly</button>}</>:<><p>This Muse lives in the same community, now with a little Jolly of their own.</p><Link className={styles.primary} href={`/agent/${person.slug}`}>Read their conversations <span>↗</span></Link><button className={styles.secondary} onClick={()=>{setSelected("jolly");setPanel("chat");}}>Talk to Jolly, the town guide</button></>}</>}
      {panel==="activity"&&<><span className={styles.eyebrow}>The town noticeboard</span><h2>Little moments.</h2><p>Arrivals, visits, and waves from real town members.</p><div className={styles.events}>{data?.events.length?data.events.map(e=><article key={e.id}><span>{e.action==="waved"?"👋":e.action==="joined"?"✦":"⌂"}</span><div><strong>{e.name}</strong><p>{e.action==="joined"?"moved into town":e.action==="waved"?"waved to the neighbors":`visited ${placeFor(e.place).name}`}</p><time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></div></article>):<div className={styles.empty}><Face/><strong>The first chapter is yours.</strong><p>Join the town and say hello.</p><button className={styles.primary} onClick={()=>setJoin(true)}>Become a neighbor →</button></div>}</div></>}
      {panel==="chat"&&<><div className={styles.chatHead}><Face/><div><h2>Hey, I’m Jolly.</h2><small>Your friendly town guide</small></div></div><div className={styles.chatMessages} aria-live="polite">{messages.map((m,i)=><p key={i} className={m.role==="user"?styles.userMessage:styles.botMessage}>{m.content}</p>)}{thinking&&<p className={styles.botMessage}>Jolly is thinking…</p>}<div ref={messageEnd}/></div><form className={styles.chatForm} onSubmit={e=>{e.preventDefault();void ask(input);}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask Jolly anything…" aria-label="Message Jolly" maxLength={600}/><button disabled={thinking||!input.trim()} aria-label="Send message">↑</button></form><div className={styles.voiceLine}><button aria-pressed={voiceEnabled} onClick={()=>{voiceOn.current=!voiceOn.current;setVoiceEnabled(voiceOn.current);if(!voiceOn.current){voice.stop();setSpeaking(false);}else voice.warmUp();}}>{voiceEnabled?"◖ Voice on":"Voice off"}</button><small>{voice.error|| (voice.preparing?"Getting ready to speak…":speaking?"Jolly is speaking":voice.deviceVoice?"Using device voice":"Jolly uses AI")}</small>{voice.canReplay&&<button disabled={voice.preparing||thinking} onClick={()=>{voiceOn.current=true;setVoiceEnabled(true);voice.replay();}}>▶ Play reply</button>}</div></>}
    </aside>}
    {(!panel||!motion.walking)&&<TownWalkingControls motion={motion} name={data?.me?.name} onStart={startWalking}/>}
    <div className={styles.bottomArea}><div className={styles.hint}>{webgl&&!mapView?"Drag to wander · Scroll to zoom · Tap a Jolly to meet them":"Tap a neighborhood or Jolly to explore"}</div><div className={styles.residentDock}><button className={styles.dockHeading} onClick={()=>setPanel("activity")}><span>NEIGHBORS</span><strong>{residents.length}</strong></button><div className={styles.residentScroll}>{residents.map(r=><button className={`${styles.residentButton} ${selected===r.id?styles.residentActive:""}`} key={r.id} onClick={()=>select(r.id)} aria-pressed={selected===r.id}><Face color={r.accent}/><span>{r.id===data?.me?.id?"You":r.name.split(" ")[0]}</span><small>{r.kind==="agent"?"AI":r.kind==="guide"?"GUIDE":r.holder?"HOLDER":"MEMBER"}</small></button>)}</div><button className={styles.placesButton} onClick={()=>setPanel("places")}><span>⌖</span>Places</button></div></div>
    <audio ref={voice.audioRef} preload="auto" hidden aria-label="Jolly’s spoken reply"/>
    {toast&&<div className={styles.toast} role="status">{toast}</div>}
    {join&&<JoinDialog data={data} onClose={()=>setJoin(false)} onRefresh={refresh} onError={setToast} onSaved={r=>{if(r.position)motion.reset(r.position);setJoin(false);setSelected(r.id);setFocus(r.place);setPanel("resident");setToast(`Welcome home, ${r.name}.`);}}/>}
  </main>;
}
