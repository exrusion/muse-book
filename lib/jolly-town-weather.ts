export const TOWN_TIME_ZONE = "America/New_York";
export type TownWeather = "clear" | "cloudy" | "rain" | "storm";
export const weatherLabels: Record<TownWeather,string> = {clear:"Clear skies",cloudy:"Cloudy",rain:"Rain",storm:"Thunderstorm"};
export const weatherIcons: Record<TownWeather,string> = {clear:"☀",cloudy:"☁",rain:"☂",storm:"ϟ"};
const hours = new Intl.DateTimeFormat("en-US",{timeZone:TOWN_TIME_ZONE,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const clock = new Intl.DateTimeFormat("en-US",{timeZone:TOWN_TIME_ZONE,hour:"numeric",minute:"2-digit",hour12:true});
const date = new Intl.DateTimeFormat("en-US",{timeZone:TOWN_TIME_ZONE,month:"short",day:"numeric"});
export function seededUnit(seed:number) { let n=Math.imul(seed^0x9e3779b9,0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return ((n^(n>>>16))>>>0)/4294967296; }
export function townEnvironment(timestamp:number,override?:TownWeather) {
  const parts=hours.formatToParts(timestamp),part=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  const hour=part("hour")+part("minute")/60+part("second")/3600;
  const daylight=Math.min(1,Math.max(0,(hour-6)/1.5),Math.max(0,(20-hour)/1.5));
  const period=hour<6||hour>=20?"Night":hour<7.5?"Sunrise":hour<18.5?"Daytime":"Sunset";
  const roll=seededUnit(Math.floor(timestamp/(45*60*1000)));
  const weather=override||(roll<0.45?"clear":roll<0.7?"cloudy":roll<0.9?"rain":"storm");
  return {timestamp,hour,daylight,night:daylight<0.3,period,weather,clock:clock.format(timestamp),date:date.format(timestamp)};
}
export type TownEnvironment = ReturnType<typeof townEnvironment>;
// Shared, occasional single lightning pulses. No repeated strobing.
export function lightningLevel(timestamp:number) {
  const slot=Math.floor(timestamp/40000),phase=timestamp%40000;
  const start=8000+seededUnit(slot)*19000;
  const age=phase-start;
  return age>=0&&age<700?Math.sin(Math.PI*age/700)*0.65:0;
}
// Elliptical sea lanes always clear the entire 61 × 49 island and harbor.
export function shipPose(timestamp:number,index:number) {
  const direction=index%2?-1:1, angle=timestamp/1000*(0.008+index*0.0015)*direction+index*2.1;
  const rx=49+index*5,rz=42+index*4;
  return {x:Math.cos(angle)*rx,z:-9+Math.sin(angle)*rz,yaw:Math.atan2(-Math.sin(angle)*rx*direction,Math.cos(angle)*rz*direction)};
}
