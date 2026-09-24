// One layout for the 3D town, map, and server-authoritative movement.
// Keep the original center and harbor coordinates so existing residents stay put.
export const townBounds = { minX: -29.4, maxX: 29.4, minZ: -32.2, maxZ: 14.2 } as const;
export const townLand = { width: 61, depth: 49, x: 0, z: -9 } as const;
export const townRoads = { x: [-16, -5, 5, 16], z: [-29, -17, -3, 7] } as const;
export const townMap = { width: 660, height: 550, scale: 10, originX: 330, originZ: 355 } as const;
export const mapX = (x: number) => townMap.originX + x * townMap.scale;
export const mapZ = (z: number) => townMap.originZ + z * townMap.scale;
// x, z, width, depth, height, facade, pitched roof
export type TownBuilding = readonly [number, number, number, number, number, string, boolean?];
export const townBuildings: readonly TownBuilding[] = [
  [-10,-10.5,3.2,2.7,5.3,"#e2cbbb"],[-13.7,-7,2.5,2.5,3.4,"#b8cdd1",true],[-8.8,-6.3,2.8,2,3,"#c2bed8"],
  [-1.8,-10,3,3,7.2,"#c8d9db"],[2,-9.5,2.5,2.8,5.4,"#e1d7c7"],
  [9,-11,3,2.6,3.5,"#e6cdad",true],[13,-8.5,2.5,2.5,4.7,"#d5c7d4"],[9,-6.5,2.5,1.8,2.4,"#e9d6b4",true],
  [-12.5,1.3,3.2,2.5,2.15,"#e3baa4",true],[-12.7,11,3,2.5,3.2,"#bbcad1"],[-8.5,11.5,2.5,2.5,2.6,"#e7c4b8",true],
  [12.4,11,3.2,3,3.5,"#c8d2ba",true],[8.2,11.7,2.6,2.4,2.5,"#dfc5b8"],
  // Storybook quarter and the northern skyline.
  [-24,-26,4.4,2.6,3.7,"#cabbd9"],[-19,-26,2.5,2.5,3.1,"#e9cbb6",true],[-27,-20,2.4,2.4,2.8,"#c8d2ba",true],
  [-12,-25,3.2,3,6.4,"#bcced7"],[-8,-24,2.7,3,4.7,"#dbc6bc"],[-12,-20,3,2.3,4,"#e6d5b5"],[-8,-20,2.5,2.3,3,"#bbccd0"],
  [0,-26.8,4.4,3,3.4,"#ccc5df"],[-2.5,-20.5,2.4,2.2,2.5,"#d6cebb",true],[2,-20.5,2.6,2.2,3.1,"#bbd0c8"],
  [9,-25,3.4,3.2,7.5,"#b9ced8"],[13,-24,2.5,3,5.6,"#d6d0bb"],[9,-20,3,2.2,3.4,"#d4bed0"],[13,-20,2.4,2.3,4.2,"#bed1c9"],
  // Sunrise Heights, beyond the east avenue.
  [20,-26,3,2.8,3.3,"#e6c8b4",true],[25,-26,3.3,2.8,4.3,"#c0d3d0"],[26,-21,2.5,3,3.1,"#ddc6d5",true],
  [20,-20,2.8,2.4,2.8,"#ded3b4",true],
  // Lantern Market: low shops and colorful covered stalls.
  [-26,-12,3.2,2.6,3.4,"#d5bcb0",true],[-21,-12,3,2.6,2.7,"#c5c9dc"],
  [-26,-7,2.2,1.6,1.25,"#dca886"],[-21.5,-8,2.2,1.6,1.25,"#a8c9b4"],[-19.5,0,2.5,2,2.6,"#dac6b5",true],
  // Sunset Square homes and the east park's pavilion.
  [-26,2,3,2.6,2.8,"#d4c5d9",true],[-21,3,2.8,2.4,3.3,"#bdd0ce"],
  [-26,11,3,2.6,3.1,"#e5bfae",true],[-19,11,2.6,2.6,2.6,"#d4d5b4",true],
  [25,-12,3.2,2.8,2.5,"#c1d0b3",true],[20,2,2.8,2.5,2.3,"#e1c9aa",true],
  [26,3,2.8,2.8,3,"#d9c2cb"],[21,11,2.8,2.5,2.7,"#c4d2d4",true],[26,11,2.6,2.6,3.4,"#e4c9b6"]
];
export const townTrees: readonly (readonly [number, number])[] = [
  [-14,-12],[-12,-4],[-7,-12],[-2,-5],[2,-5],[-3,3],[3,3],[-3,5],[3,5],[7,-12],[14,-12],[13,-4],[14,0],[14,4],[11,5],[7,1],[7,5],[-14,6],[-8,5],[-14,13],[-6,13],[6,13],[14,13],
  [-28,-31],[-21,-31],[-12,-31],[-7,-31],[0,-31],[8,-31],[13,-31],[21,-31],[28,-31],
  [-28,-23],[-19,-21],[-26,-15],[-20,-15],[-12,-15],[-8,-15],[0,-15],[8,-15],[12,-15],[20,-15],[28,-15],
  [-28,-3],[-28,5],[-24,5],[-19,5],[-28,13],[-22,13],[-18,13],
  [19,-10],[22,-12],[28,-9],[19,-6],[25,-6],[28,-4],[21,-1],[26,-1],
  [19,5],[24,5],[28,7],[18,13],[24,13],[28,13]
];
export const townPonds = [{ x: 12, z: 1.8, rx: 1.82, rz: 1.04 }] as const;
