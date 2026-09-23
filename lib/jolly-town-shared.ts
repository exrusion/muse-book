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
export type TownResident = { id: string; name: string; accent: string; place: PlaceId; kind: "guide" | "agent" | "member"; role: string; slug?: string; online?: boolean; holder?: boolean };
export type TownEvent = { id: string; name: string; action: string; place: PlaceId; createdAt: string };
export const guide: TownResident = { id: "jolly", name: "Jolly", accent: accents[0], place: "plaza", kind: "guide", role: "Your town guide", online: true };
export function placeFor(id: string) { return places.find(p => p.id === id) || places[0]; }
export function residentOffset(id: string): [number, number] {
  let seed = 0; for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const angle = (seed % 628) / 100, radius = 1.1 + (seed % 15) / 10;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}
