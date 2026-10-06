import {newLayer,ProjectSchema,offsetsOf,durationOf} from './schema.mjs';
export function parseSrt(text){
 const stamp=s=>{const m=s.match(/(\d+):(\d{2}):(\d{2})[,.](\d{3})/);if(!m)throw new Error('Use SRT captions with HH:MM:SS,mmm timestamps.');return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000;};
 const segments=text.trim().split(/\r?\n\s*\r?\n/).map(block=>{const lines=block.split(/\r?\n/),i=lines.findIndex(l=>l.includes('-->'));if(i<0)throw new Error('A caption timestamp is missing.');const [from,to]=lines[i].split('-->');return {start:stamp(from),end:stamp(to),text:lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'').trim()};});
 if(segments.length>100||segments.some(s=>!s.text||s.text.length>200||s.end<=s.start))throw new Error('Use up to 100 short captions with increasing timestamps.');return segments;
}
export function addCaptions(project,segments,track={start:0,trim:0,duration:durationOf(project)}){
 const p=structuredClone(project),offsets=offsetsOf(p);
 for(const segment of segments){
  if(!Number.isFinite(segment.start)||!Number.isFinite(segment.end)||segment.end<=segment.start||typeof segment.text!=='string')throw new Error('Caption timing is invalid.');
  const start=Math.max(track.start,Math.round(segment.start*30)-track.trim+track.start),end=Math.min(track.start+track.duration,Math.round(segment.end*30)-track.trim+track.start);
  if(end<=start)continue;
  p.scenes.forEach((s,i)=>{const a=Math.max(start,offsets[i]),b=Math.min(end,offsets[i]+s.duration);if(b<=a)return;
   if(s.layers.length>=25)throw new Error('A scene has too many layers for these captions. Shorten the caption file.');
   s.layers.push(newLayer('text',{name:'Caption',text:segment.text.trim().slice(0,200),x:.08,y:.85,width:.84,height:.12,fontSize:38,align:'center',animation:'none',delay:a-offsets[i],end:b-offsets[i],locked:true}));
  });
 }
 return ProjectSchema.parse(p);
}
