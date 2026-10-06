// Explicit operator repairs after inspecting original exports. Originals are retained.
import fs from 'node:fs/promises';
import {ProjectSchema,newLayer,sameProject} from './schema.mjs';
import {designIssues} from './design-quality.mjs';
const dir='.motion-proof/velos-ads',base='http://127.0.0.1:4701/api/motion';
const report=JSON.parse(await fs.readFile(`${dir}/benchmark.json`,'utf8'));
const {token}=await(await fetch(base+'/local-session',{method:'POST',headers:{'X-Motion-Local':'1'}})).json();
const api=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
const {assets}=await api('/assets');
const persist=()=>fs.writeFile(`${dir}/benchmark.json`,JSON.stringify(report,null,2));
const pose=(layer,values)=>{Object.assign(layer,values);for(const k of layer.keyframes)for(const [key,value] of Object.entries(values))if(['x','y'].includes(key)&&k[key]!==undefined)k[key]=value;};
const find=(scene,name)=>scene.layers.find(l=>l.name===name);
for(const ad of report.ads){
 if(ad.repair)continue;
 const record=await api(`/projects/${ad.projectId}`),p=structuredClone(record.project),notes=[];
 for(const s of p.scenes)for(const l of s.layers){
  if(l.type==='text'){
   if(l.x+l.width>1){pose(l,{x:Math.max(.07,.5-l.width/2)});notes.push(`Correct top-left placement: ${l.name}`);}
   if(/velosmotion\.com|velos\.com/i.test(l.text)){l.text=ad.slug==='07-fit-your-feed'?'Try Motion Studio.':'Start creating with Velos.';notes.push('Remove unprovided website.');}
   if(['#7c00ff','#9932cc','#6d28d9','#7c3aed'].includes(l.color.toLowerCase())){l.color='#c3a6ff';notes.push(`Increase purple-text contrast: ${l.name}`);}
   if(l.fontSize<44&&!['Portrait Label','Landscape Label','Square Label'].includes(l.name)){l.fontSize=44;if(p.format!=='portrait'&&l.height<.1)l.height=.1;notes.push(`Increase small copy: ${l.name}`);}
  }
 }
 if(ad.slug==='02-break-the-scroll'){
  // Scene one was repaired through a real scoped AI request before this pass.
  const s=p.scenes[1];pose(find(s,'Headline 2'),{x:.08,y:.32,width:.84,height:.26,rotation:0,fontSize:142,text:'Make your next\npost move.'});pose(find(s,'Accent Rect 2'),{x:.08,y:.64,width:.65,rotation:0});
  const end=p.scenes[2];pose(find(end,'Headline 3'),{x:.08,y:.3,width:.84,height:.22,fontSize:124,text:'Meet Velos\nMotion Studio.'});pose(find(end,'Velos Logo'),{x:.08,y:.56,width:.2,height:.1});pose(find(end,'CTA'),{x:.08,y:.78,width:.84,height:.08});pose(find(end,'Accent Rect 3'),{x:.08,y:.73});notes.push('Scene 1 repaired by AI; remaining headline, underline and closing layout repaired manually.');
 }
 if(ad.slug==='04-brand-reveal'){
  const first=p.scenes[0];pose(find(first,'Velos Logo Reveal'),{x:.3,y:.13,width:.4,height:.4});pose(find(first,'Give ideas momentum'),{y:.65,height:.2});
  const circle=find(first,'Orbiting Circle');circle.y=.35;circle.keyframes.forEach(k=>{if(k.y!==undefined)k.y=.35+(k.y-.5)*.5;});
  pose(find(p.scenes[2],'Velos Logo Small'),{x:.35,y:.15,width:.3,height:.3});notes.push('Separate logo and headline in opening and closing scenes.');
 }
 if(ad.slug==='05-precise-control'){
  const s=p.scenes[0];for(const card of s.layers.filter(l=>l.type==='rect'&&/^Storyboard Card/.test(l.name))){
   const text=card.text;card.text='';s.layers.push(newLayer('text',{name:`Visible card label ${text}`,text,x:card.x,y:card.y+card.height*.3,width:card.width,height:card.height*.4,fontSize:56,align:'center',color:'#f7f7fb',animation:'scale',delay:card.delay,rotation:card.rotation,keyframes:card.keyframes.map(k=>({...k,...(k.x!==undefined?{x:k.x}:{}),...(k.y!==undefined?{y:k.y+card.height*.3}:{})}))}));
  }notes.push('Convert hidden rectangle text metadata into visible editable 01 / 02 / 03 labels.');
 }
 if(ad.slug==='06-words-that-move'){
  pose(find(p.scenes[0],'Good Ideas'),{x:.08,y:.28,width:.84,height:.18});pose(find(p.scenes[0],'Deserve Motion'),{x:.08,y:.51,width:.84,height:.2});
  const s=p.scenes[1];[['Write It',.16],['Move It',.41],['Make It Yours',.66]].forEach(([name,y])=>pose(find(s,name),{x:.1,y,width:.8,height:.16,fontSize:104}));
  [['Line 1',.34],['Line 2',.59],['Line 3',.86]].forEach(([name,y])=>pose(find(s,name),{x:.1,y,width:.2}));
  const end=p.scenes[2];pose(find(end,'Velos Logo'),{x:.375,y:.16});pose(find(end,'Velos Motion Studio'),{x:.08,y:.49,width:.84,height:.2,fontSize:104});pose(find(end,'Call to Action'),{x:.08,y:.78,width:.84,height:.1});notes.push('Recompose clipped typography and align staggered word entrances.');
 }
 if(ad.slug==='07-fit-your-feed'){
  const s=p.scenes[1];pose(find(s,'Headline'),{x:.07,y:.14,width:.86,height:.19,text:'Portrait.\nLandscape. Square.'});
  [['Portrait',.07,.38,.2,.2],['Landscape',.33,.425,.31,.0981],['Square',.7,.412,.23,.1294]].forEach(([name,x,y,width,height])=>{pose(find(s,`${name} Frame`),{x,y,width,height});pose(find(s,`${name} Label`),{x,y:.625,width,height:.06,fontSize:42,align:'center',color:'#f7f7fb'});});
  const end=p.scenes[2];pose(find(end,'Velos Logo'),{x:.375,y:.22,width:.25,height:.1});pose(find(end,'Headline'),{x:.07,y:.43,width:.86,height:.18,fontSize:100});pose(find(end,'CTA Button'),{x:.2,y:.7,width:.6});pose(find(end,'CTA Text'),{x:.22,y:.715,width:.56,height:.06,fontSize:52,align:'center'});notes.push('Correct physical frame aspect ratios and separate all silhouettes and labels.');
 }
 const candidate=ProjectSchema.parse(p);const issues=designIssues(candidate,{assets});if(issues.length)throw Error(`${ad.slug}: ${issues.join(' ')}`);
 if(sameProject(record.project,candidate))continue;
 const saved=await api(`/projects/${record.id}`,'PUT',{version:record.version,project:candidate});const job=await api(`/projects/${record.id}/export`,'POST',{version:saved.version,requestId:crypto.randomUUID()});
 ad.initialJobId=ad.jobId;ad.initialDesignUsage=ad.designUsage;ad.jobId=job.id;ad.version=saved.version;ad.status=job.status;ad.downloadedAt=null;ad.repair={method:'Operator edits to the existing AI-created project; Ad 02 scene one first received a scoped AI repair.',notes:[...new Set(notes)]};
 await fs.writeFile(`${dir}/${ad.slug}.json`,JSON.stringify(candidate,null,2));await persist();console.log(JSON.stringify({ad:ad.slug,status:'repair-export-queued',notes:ad.repair.notes}));
}
for(let tick=0;tick<500;tick++){
 const {jobs}=await api('/exports');let pending=0;
 for(const ad of report.ads){const job=jobs.find(j=>j.id===ad.jobId);ad.status=job.status;ad.progress=job.progress;if(['processing','queued'].includes(job.status))pending++;if(job.status==='failed')throw Error(job.error);if(job.status==='completed'&&!ad.downloadedAt){for(const [ext,url] of [['mp4',job.url],['png',job.poster]]){const res=await fetch(url);if(!res.ok)throw Error('Export download failed');await fs.writeFile(`${dir}/${ad.slug}.${ext}`,Buffer.from(await res.arrayBuffer()));}ad.downloadedAt=new Date().toISOString();console.log(JSON.stringify({ad:ad.slug,status:'repaired-export-downloaded'}));}}
 await persist();if(!pending)break;if(tick%15===0)console.log(JSON.stringify(report.ads.map(a=>({ad:a.slug,status:a.status,progress:a.progress}))));await new Promise(resolve=>setTimeout(resolve,1000));
}
