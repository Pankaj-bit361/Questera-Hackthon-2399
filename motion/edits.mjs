import {ProjectSchema,protectLocked} from './schema.mjs';
// Merge by stable IDs so unrelated scenes are protected by code, not prompting alone.
export function editScope(project,brief,scope='auto',targetId=null){
 if(scope==='all'||scope==='create')return {kind:'all'};
 if(scope==='scene'){if(!project.scenes.some(s=>s.id===targetId))throw new Error('Select a valid scene.');return {kind:'scene',id:targetId};}
 if(scope==='layer'){if(!project.scenes.some(s=>s.layers.some(l=>l.id===targetId)))throw new Error('Select a valid layer.');return {kind:'layer',id:targetId};}
 if(scope!=='auto')throw new Error('Choose a supported edit scope.');
 const match=brief.match(/scene\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
 if(!match)return {kind:'all'};
 const words=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];const index=/^\d+$/.test(match[1])?Number(match[1])-1:words.indexOf(match[1].toLowerCase());
 if(!project.scenes[index])throw new Error('That scene does not exist.');
 return {kind:'scene',id:project.scenes[index].id};
}
export function applyDesign(previous,candidate,scope){
 let next=structuredClone(candidate);
 if(scope.kind==='scene'){
  const scene=next.scenes.find(s=>s.id===scope.id);if(!scene)throw new Error('Keep the target scene ID when editing.');
  next=structuredClone(previous);next.scenes=next.scenes.map(s=>s.id===scope.id?scene:s);
 }else if(scope.kind==='layer'){
  const layer=next.scenes.flatMap(s=>s.layers).find(l=>l.id===scope.id);if(!layer)throw new Error('Keep the target layer ID when editing.');
  next=structuredClone(previous);next.scenes.forEach(s=>{s.layers=s.layers.map(l=>l.id===scope.id?layer:l);});
 }
 return ProjectSchema.parse(protectLocked(previous,next));
}
export function retimeProject(project,frames){
 const next=structuredClone(project),total=next.scenes.reduce((n,s)=>n+s.duration,0);
 if(frames<next.scenes.length*30||frames>1800)throw new Error('The requested duration does not fit the scene count.');
 let remaining=frames;
 next.scenes.forEach((s,i)=>{const before=s.duration;const after=i===next.scenes.length-1?remaining:Math.max(30,Math.min(600,Math.round(before*frames/total)));remaining-=after;s.duration=after;s.layers.forEach(l=>{l.delay=Math.min(after-1,Math.round(l.delay*after/before));if(l.end!==null)l.end=Math.max(l.delay+1,Math.min(after,Math.round(l.end*after/before)));const map=new Map(l.keyframes.map(k=>[Math.min(after-1,Math.round(k.frame*after/before)),k]));l.keyframes=[...map].sort((a,b)=>a[0]-b[0]).map(([frame,k])=>({...k,frame}));});});
 next.audio=next.audio.filter(t=>t.start<frames).map(t=>({...t,duration:Math.min(t.duration,frames-t.start)}));return ProjectSchema.parse(next);
}
