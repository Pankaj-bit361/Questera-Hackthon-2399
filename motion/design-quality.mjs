import {FORMATS,sameProject} from './schema.mjs';

const domains=text=>(String(text).match(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|io|ai|app|net|org|co|dev)\b/gi)||[]).map(s=>s.toLowerCase().replace(/^https?:\/\//,''));
export const turnaroundClaims=text=>String(text).match(/\b(?:(?:in|within)\s+(?:(?:just|only)\s+)?(?:seconds|minutes|real[ -]?time)|instantly|instantaneous)\b/gi)||[];
function bounds(layer,pose,width,height,asset){
 let w=layer.width*width,h=layer.height*height;
 const left=(pose.x??layer.x)*width,top=(pose.y??layer.y)*height;
 let x=left,y=top;
 if(asset&&layer.fit==='contain'&&asset.width&&asset.height){const factor=Math.min(w/asset.width,h/asset.height);const aw=asset.width*factor,ah=asset.height*factor;x+=(w-aw)/2;y+=(h-ah)/2;w=aw;h=ah;}
 const angle=(pose.rotate??layer.rotation)*Math.PI/180,scale=pose.scale??1;
 const bw=(Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)))*scale,bh=(Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle)))*scale;
 return {x:x+w/2-bw/2,y:y+h/2-bh/2,w:bw,h:bh};
}
export function designIssues(project,{brief='',previous=null,scope={kind:'all'},assets=[]}={}){
 const [width,height]=FORMATS[project.format],issues=[];
 const allowed=new Set(domains(brief));if(previous)previous.scenes.forEach(s=>s.layers.forEach(l=>domains(l.text).forEach(d=>allowed.add(d))));
 const assetMap=new Map(assets.map(a=>[a.id,a]));
 const unchanged=layer=>previous?.scenes.some(s=>s.layers.some(l=>l.id===layer.id&&sameProject(l,layer)));
 for(const scene of project.scenes){
  if(scope.kind==='scene'&&scope.id!==scene.id)continue;
  const relevant=scene.layers.filter(l=>scope.kind!=='layer'||scope.id===l.id);
  for(const layer of relevant){
   if(!unchanged(layer)&&!['text','counter'].includes(layer.type)&&layer.text)issues.push(`The ${layer.type} layer ${layer.name} does not render its text field. Put readable labels in separate text layers and leave this text empty.`);
   if(layer.type!=='text'||!layer.text||layer.opacity===0||unchanged(layer))continue;
   for(const domain of domains(layer.text))if(!allowed.has(domain))issues.push(`Do not invent destination ${domain}; use a CTA without a URL unless the brief supplies it.`);
   for(const claim of turnaroundClaims(layer.text))if(!brief.toLowerCase().includes(claim.toLowerCase()))issues.push(`Do not invent turnaround promise ${claim}; use factual capability copy unless the brief supplies that claim.`);
   for(const claim of layer.text.match(/(?:\d+(?:\.\d+)?\s*(?:%|x\b|times\b)|[$₹€£]\s*\d+)/gi)||[])if(!brief.toLowerCase().includes(claim.toLowerCase()))issues.push(`Do not invent numerical claim ${claim}; the brief must supply advertised metrics or prices.`);
   if(layer.decorative)continue;
   const poses=[{},...layer.keyframes.filter(k=>k.frame>=Math.max(24,layer.delay)&&k.frame<scene.duration-12&&k.opacity!==0)];
   for(const pose of poses){const b=bounds(layer,pose,width,height);if(b.x<-.5||b.y<-.5||b.x+b.w>width+.5||b.y+b.h>height+.5){issues.push(`Text ${layer.name} in ${scene.name} leaves the canvas. x/y are TOP-LEFT coordinates, not the center; keep the rotated/scaled text box inside the canvas.`);break;}}
  }
  for(const logo of scene.layers.filter(l=>l.type==='image'&&/\blogo\b/i.test(assetMap.get(l.assetId)?.name||''))){
   const b=bounds(logo,{},width,height,assetMap.get(logo.assetId));
   for(const text of scene.layers.filter(l=>l.type==='text'&&l.opacity>0&&!l.decorative)){
   if(scope.kind==='layer'&&scope.id!==logo.id&&scope.id!==text.id)continue;
    if(unchanged(logo)&&unchanged(text))continue;
    if((logo.end??scene.duration)<=text.delay||(text.end??scene.duration)<=logo.delay)continue;
    const t=bounds(text,{},width,height);
    const area=Math.max(0,Math.min(b.x+b.w,t.x+t.w)-Math.max(b.x,t.x))*Math.max(0,Math.min(b.y+b.h,t.y+t.h)-Math.max(b.y,t.y));
    if(area/Math.max(1,Math.min(b.w*b.h,t.w*t.h))>.12)issues.push(`Separate the supplied logo and text ${text.name} in ${scene.name}; their visible regions overlap.`);
   }
  }
 }
 return [...new Set(issues)];
}
