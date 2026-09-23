export const places = [
  { id: "plaza", name: "Jolly Plaza", icon: "✦", x: 0, z: 0, color: "#b59ade", description: "The heart of the town. Meet your neighbors and make yourself at home." },
  { id: "cafe", name: "Cloud Café", icon: "☕", x: -9, z: 3, color: "#eaa991", description: "A warm corner for small talk, big ideas, and one more coffee." },
  { id: "garden", name: "Daydream Gardens", icon: "❀", x: 8, z: 4, color: "#8abe9b", description: "Take the scenic route. A little green space to slow things down." },
  { id: "studio", name: "Muse Studios", icon: "✧", x: -8, z: -7, color: "#8ebad4", description: "A neighborhood for makers, curious minds, and things that do not exist yet." },
  { id: "homes", name: "Moonrise Homes", icon: "⌂", x: 8, z: -7, color: "#dbb877", description: "Your own little place in a town full of familiar faces." },
  { id: "harbor", name: "Peach Harbor", icon: "≈", x: 0, z: 10, color: "#dc9dac", description: "Meet by the water and watch the world drift by." }
] as const;
export type PlaceId = typeof places[number]["id"];
export const accents = ["#b59ade", "#eaa991", "#8abe9b", "#8ebad4", "#dbb877", "#dc9dac"] as const;
export type TownPosition = { id: string; x: number; z: number; yaw: number; moving: boolean; version: number; online: boolean };
export type TownResident = { id: string; name: string; accent: string; place: PlaceId; kind: "guide" | "agent" | "member"; role: string; slug?: string; online?: boolean; holder?: boolean; position?: TownPosition };
export type TownEvent = { id: string; name: string; action: string; place: PlaceId; createdAt: string };
export const guide: TownResident = { id: "jolly", name: "Jolly", accent: accents[0], place: "plaza", kind: "guide", role: "Your town guide", online: true };
export function placeFor(id: string) { return places.find(p => p.id === id) || places[0]; }
export function residentOffset(id: string): [number, number] {
  let seed = 0; for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const angle = (seed % 628) / 100, radius = 1.1 + (seed % 15) / 10;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}
export const WALK_SPEED = 4;
// Footprints match the buildings in JollyTownScene, with room for a plush body.
export const townObstacles = [
  [-10,-10.5,3.2,2.7],[-13.7,-7,2.5,2.5],[-8.8,-6.3,2.8,2],[-1.8,-10,3,3],[2,-9.5,2.5,2.8],
  [9,-11,3,2.6],[13,-8.5,2.5,2.5],[9,-6.5,2.5,1.8],[-12.5,1.3,3.2,2.5],
  [-12.7,11,3,2.5],[-8.5,11.5,2.5,2.5],[12.4,11,3.2,3],[8.2,11.7,2.6,2.4]
];
export function walkable(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x)>15.4 || z < -14.2 || z > 14.2) return false;
  if (Math.hypot(x,z)<1.65 || ((x-12)/2.1)**2+((z-1.8)/1.4)**2<1) return false;
  return !townObstacles.some(([cx,cz,w,d]) => Math.abs(x-cx)<w/2+0.35 && Math.abs(z-cz)<d/2+0.35);
}
export function walkStep(x: number, z: number, dx: number, dz: number) {
  if (walkable(x+dx,z+dz)) return { x:x+dx,z:z+dz };
  if (walkable(x+dx,z)) return { x:x+dx,z };
  if (walkable(x,z+dz)) return { x,z:z+dz };
  return { x,z };
}
export function clearWalkPath(x: number,z: number,nx: number,nz: number) {
  const steps=Math.max(1,Math.ceil(Math.hypot(nx-x,nz-z)/0.15));
  for(let i=1;i<=steps;i++) if(!walkable(x+(nx-x)*i/steps,z+(nz-z)*i/steps)) return false;
  return true;
}
export function spawnPosition(id: string, place: string) {
  const p=placeFor(place), o=residentOffset(id);
  if(walkable(p.x+o[0],p.z+o[1])) return {x:p.x+o[0],z:p.z+o[1]};
  for(let radius=1.8;radius<4;radius+=0.4) for(let angle=0;angle<Math.PI*2;angle+=0.4) {
    const x=p.x+Math.sin(angle)*radius,z=p.z+Math.cos(angle)*radius;
    if(walkable(x,z)) return {x,z};
  }
  return {x:0,z:3};
}
export function nearestPlace(x:number,z:number):PlaceId {
  return places.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b).id;
}
