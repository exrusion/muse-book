// PCM16 WAV is supported by native audio players, including mobile Safari.
export function pcmWave(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => { for(let i=0;i<value.length;i++) bytes[offset+i]=value.charCodeAt(i); };
  label(0,"RIFF"); view.setUint32(4,36+samples.length*2,true); label(8,"WAVE"); label(12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  label(36,"data"); view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) {
    const value=Number.isFinite(samples[i])?Math.max(-1,Math.min(1,samples[i])):0;
    view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return bytes;
}
