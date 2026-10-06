import { z } from 'zod';
export const uid = () => crypto.randomUUID();
export const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] };
export const ANIMATIONS = ['rise', 'slide', 'scale', 'reveal', 'float', 'none'];
export const TRANSITIONS = ['fade', 'wipe', 'cut'];
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(100).regex(/^[\w-]+$/);
const coordinate = z.number().min(-1).max(2);
const Keyframe = z.object({ frame: z.number().int().min(0).max(1800), x: coordinate.optional(), y: coordinate.optional(), scale: z.number().min(0).max(5).optional(), rotate: z.number().min(-720).max(720).optional(), opacity: z.number().min(0).max(1).optional(), zoom: z.number().min(.5).max(5).optional(), panX: z.number().min(-1).max(1).optional(), panY: z.number().min(-1).max(1).optional() }).strict();
export const LayerSchema = z.object({
  id, name: z.string().min(1).max(80), type: z.enum(['text', 'rect', 'circle', 'image', 'video', 'chart', 'counter']),
  text: z.string().max(600).default(''), assetId: id.nullable().default(null),
  x: coordinate.default(.08), y: coordinate.default(.2), width: z.number().min(.01).max(2).default(.84), height: z.number().min(.001).max(2).default(.2),
  color: color.default('#f7f7fb'), fontSize: z.number().min(12).max(260).default(80), align: z.enum(['left', 'center', 'right']).default('left'),
  opacity: z.number().min(0).max(1).default(1), decorative: z.boolean().default(false), filled: z.boolean().default(true), strokeColor: color.nullable().default(null), strokeWidth: z.number().min(0).max(30).default(0), shadow: z.enum(['none','soft','glow']).default('none'), tracking: z.number().min(-.1).max(.2).default(-.045), textAnimation: z.enum(['block','words','lines']).default('block'), stagger: z.number().int().min(0).max(8).default(2), easing: z.enum(['out','linear','smooth']).default('out'), rotation: z.number().min(-720).max(720).default(0), radius: z.number().min(0).max(500).default(24),
  animation: z.enum(ANIMATIONS).default('rise'), entranceDuration: z.number().int().min(1).max(90).default(24), exitDuration: z.number().int().min(0).max(90).default(12), delay: z.number().int().min(0).max(1800).default(0),
  end:z.number().int().min(1).max(600).nullable().default(null),
  keyframes: z.array(Keyframe).max(30).default([]), locked: z.boolean().default(false),
  fit: z.enum(['cover', 'contain']).default('cover'), zoom: z.number().min(.5).max(5).default(1), panX: z.number().min(-1).max(1).default(0), panY: z.number().min(-1).max(1).default(0), values: z.array(z.number().min(0).max(1000000)).max(10).default([]),
}).strict();
export const SceneSchema = z.object({ id, name: z.string().min(1).max(100), duration: z.number().int().min(30).max(600), background: color, accent: color,
  pattern: z.enum(['grid', 'dots', 'plain', 'glow']).default('glow'), transition: z.enum(TRANSITIONS).default('fade'), layers: z.array(LayerSchema).min(1).max(25),
}).strict();
export const AudioSchema = z.object({ id, assetId: id, name: z.string().max(80), start: z.number().int().min(0).max(1800).default(0), trim: z.number().int().min(0).max(18000).default(0),
  duration: z.number().int().min(1).max(1800), volume: z.number().min(0).max(1).default(.5), fade: z.number().int().min(0).max(90).default(15),
}).strict();
export const ProjectSchema = z.object({ schemaVersion: z.literal(1), title: z.string().min(1).max(120), format: z.enum(['landscape', 'portrait', 'square']), fps: z.literal(30),
  scenes: z.array(SceneSchema).min(1).max(12), audio: z.array(AudioSchema).max(4).default([]),
}).strict().superRefine((p, ctx) => {
  const total = durationOf(p), ids = new Set();
  if (total > 1800) ctx.addIssue({ code: 'custom', message: 'Videos are limited to 60 seconds.' });
  const seen = (value) => { if (ids.has(value)) ctx.addIssue({ code: 'custom', message: 'Scene, layer and audio IDs must be unique.' }); ids.add(value); };
  p.scenes.forEach(s => { seen(s.id); s.layers.forEach(l => { seen(l.id); if (l.delay >= s.duration || (l.end!==null&&(l.end<=l.delay||l.end>s.duration)) || l.keyframes.some(k => k.frame >= s.duration)) ctx.addIssue({ code: 'custom', message: `Animation timing exceeds scene ${s.name}.` });
    if (['image','video'].includes(l.type) && !l.assetId) ctx.addIssue({ code:'custom', message:'Media layers need an asset.' });
    if (l.keyframes.some((k,i,a) => i > 0 && k.frame <= a[i-1].frame)) ctx.addIssue({ code:'custom', message:'Keyframes must be strictly ordered.' });
  }); });
  p.audio.forEach(t => { seen(t.id); if (t.start + t.duration > total) ctx.addIssue({ code:'custom', message:'Audio extends past the project.' }); });
});
export function durationOf(p) { return p.scenes.reduce((n,s) => n+s.duration,0); }
export function offsetsOf(p) { let n=0; return p.scenes.map(s => {const start=n; n+=s.duration;return start;}); }
export const newLayer = (type='text', extras={}) => LayerSchema.parse({id:uid(),name:type==='text'?'Headline':type,type,text:type==='text'?'Your next big idea.':'',...extras});
export function exampleProject(style='launch', format='landscape') {
  const styles = {
    launch: {title:'Make your next move.', accent:'#b8ff65', bg:'#12151b', lines:['Make your\nnext move.','Less friction.\nMore possibility.','Built for what\ncomes next.'], labels:['INTRODUCING / VELOS','DESIGNED TO MOVE YOU','YOUR NEXT CHAPTER'], sub:['Ideas deserve a better beginning.','A smarter way to bring your vision to life.','Create something worth watching.']},
    type: {title:'Words in motion',accent:'#ff956b',bg:'#201611',lines:['Good ideas\nnever sit still.','Give your\nwords momentum.','Say it.\nMake it move.'],labels:['A STUDY IN MOTION','EVERY WORD MATTERS','MAKE AN IMPRESSION'],sub:['Typography with a point of view.','A little rhythm goes a long way.','Your story starts here.']},
    data: {title:'A story in numbers',accent:'#ab9aff',bg:'#151328',lines:['Small steps.\nBig change.','Progress you\ncan see.','The next step\nis yours.'],labels:['THE BIG PICTURE','ILLUSTRATIVE DATA','KEEP MOVING FORWARD'],sub:['An animated story of steady growth.','Example values: 24 / 48 / 72 / 96.','Turn a number into a narrative.']},
  };
  const t=styles[style]||styles.launch;
  return ProjectSchema.parse({schemaVersion:1,title:t.title,format,fps:30,audio:[],scenes:t.lines.map((text,i)=>({id:uid(),name:['The opening','The story','The invitation'][i],duration:150,background:t.bg,accent:t.accent,pattern:i===1?'grid':'glow',transition:'fade',layers:[
    newLayer('text',{name:'Eyebrow',text:t.labels[i],x:.08,y:.12,fontSize:22,color:t.accent,delay:0,height:.08}),
    newLayer('text',{name:'Headline',text,x:.08,y:.27,fontSize:format==='portrait'?98:110,height:.36,width:style==='data'&&i===1?.52:.84,delay:7}),
    ...(style==='data'&&i===1?[newLayer('chart',{name:'Growth bars',x:.65,y:.28,width:.27,height:.4,color:t.accent,values:[24,48,72,96],delay:12})]:[]),
    newLayer('text',{name:'Supporting line',text:t.sub[i],x:.08,y:.75,fontSize:27,color:'#aab0bd',height:.12,delay:18}),
    newLayer('rect',{name:'Accent line',x:.08,y:.88,width:.12,height:.006,color:t.accent,animation:'reveal',delay:20,radius:2}),
  ]}))});
}
export function validateAssets(project, assets) {
  const byId=new Map(assets.map(a=>[a.id,a]));
  const problems=[];
  project.scenes.forEach(s=>s.layers.forEach(l=>{ if(l.assetId && (!byId.has(l.assetId) || byId.get(l.assetId).kind !== l.type)) problems.push(`Missing or incompatible asset for ${l.name}.`); }));
  project.audio.forEach(t=>{const a=byId.get(t.assetId);if(!a||a.kind!=='audio') problems.push(`Missing audio for ${t.name}.`); else if(a.duration && (t.trim+t.duration)/30 > a.duration+.1) problems.push(`Audio trim exceeds ${t.name}.`);});
  return problems;
}
export function protectLocked(previous, candidate) {
  const next=structuredClone(candidate);
  previous.scenes.forEach(s=>s.layers.filter(l=>l.locked).forEach(l=>{
    const dest=next.scenes.find(ns=>ns.id===s.id);
    if(!dest) throw new Error('A scene containing locked layers cannot be removed by AI.');
    const i=dest.layers.findIndex(nl=>nl.id===l.id); if(i<0) dest.layers.push(structuredClone(l));else dest.layers[i]=structuredClone(l);
  }));
  return ProjectSchema.parse(next);
}
export function sameProject(a,b){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
