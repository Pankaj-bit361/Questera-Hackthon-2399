import {z} from 'zod';
const Note=z.object({frame:z.number().int().min(0).max(1799),duration:z.number().int().min(1).max(240),midi:z.number().int().min(24).max(96).default(60),velocity:z.number().min(.01).max(1).default(.5),voice:z.enum(['bass','pluck','pad','kick','hat','snare','whoosh','chime'])}).strict();
export const SoundPlanSchema=z.object({mode:z.enum(['generated','asset','silent']),name:z.string().min(1).max(80),assetId:z.string().max(100).nullable().default(null),tempo:z.number().min(60).max(180).default(110),seed:z.number().int().min(1).max(2147483647).default(17),notes:z.array(Note).max(180).default([])}).strict();
export function validateSoundPlan(input,frames,assets=[]){
 const plan=SoundPlanSchema.parse(input);
 if(plan.mode==='generated'){
  if(plan.notes.length<4||!plan.notes.some(n=>['bass','pluck','pad','chime'].includes(n.voice)))throw Error('Compose at least four musical notes plus any sound effects; do not supply only noise or percussion.');
  if(plan.notes.some(n=>n.frame+n.duration>frames))throw Error('Keep sound cues inside the video timeline.');
 }
 if(plan.mode==='asset'){const asset=assets.find(a=>a.id===plan.assetId&&a.kind==='audio');if(!asset||asset.duration*30<frames)throw Error('Choose a supplied audio asset long enough for the project.');}
 return plan;
}
// The AI writes the event score. This renderer synthesizes those notes, not a fixed song.
export function synthesizeScore(input,frames){
 const plan=validateSoundPlan(input,frames),rate=48000,length=Math.round(frames/30*rate),mix=new Float32Array(length);let rng=plan.seed;
 const noise=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296*2-1;};
 for(const note of plan.notes){const start=Math.round(note.frame/30*rate),samples=Math.round(note.duration/30*rate),seconds=samples/rate,freq=440*2**((note.midi-69)/12);let lastNoise=0;
  for(let i=0;i<samples&&start+i<length;i++){
   const t=i/rate,progress=t/seconds,attack=Math.min(1,t/(note.voice==='pad'?.06:.006)),release=Math.min(1,(seconds-t)/.06);let value;
   if(note.voice==='kick')value=Math.sin(2*Math.PI*(45*t+12*(1-Math.exp(-t*24))))*Math.exp(-t*12)*.8;
   else if(note.voice==='hat'){const n=noise();value=(n-lastNoise)*Math.exp(-t*42)*.1;lastNoise=n;}
   else if(note.voice==='snare')value=(noise()*.25+Math.sin(2*Math.PI*180*t)*.12)*Math.exp(-t*18);
   else if(note.voice==='whoosh')value=(noise()*.16+Math.sin(2*Math.PI*(freq*t+500*t*t))*.025)*Math.sin(Math.PI*progress)**2;
   else if(note.voice==='bass')value=(Math.sin(2*Math.PI*freq*t)+.22*Math.sin(4*Math.PI*freq*t))*.24;
   else if(note.voice==='pad')value=(Math.sin(2*Math.PI*freq*t)+.25*Math.sin(2*Math.PI*freq*1.002*t)+.15*Math.sin(4*Math.PI*freq*t))*.13;
   else value=(Math.sin(2*Math.PI*freq*t)+.28*Math.sin(4*Math.PI*freq*t)+.08*Math.sin(6*Math.PI*freq*t))*Math.exp(-t*(note.voice==='chime'?3:8))*.28;
   mix[start+i]+=value*attack*release*note.velocity;
  }
 }
 let peak=0;for(let i=0;i<length;i++){const fade=Math.min(1,i/(rate*.04),(length-1-i)/(rate*.16));mix[i]*=Math.max(0,fade);peak=Math.max(peak,Math.abs(mix[i]));}
 const gain=peak?Math.min(2,.62/peak):1,buffer=Buffer.alloc(44+length*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(length*2,40);
 for(let i=0;i<length;i++)buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,mix[i]*gain))*32767),44+i*2);
 return {buffer,duration:frames/30,mimeType:'audio/wav',peak:peak*gain};
}
