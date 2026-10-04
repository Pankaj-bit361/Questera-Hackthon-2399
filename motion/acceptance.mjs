import fs from 'node:fs/promises';import {exampleProject,newLayer} from './schema.mjs';import {addCaptions,parseSrt} from './captions.mjs';
const base='http://127.0.0.1:4701/api/motion';const session=await fetch(`${base}/local-session`,{method:'POST',headers:{'X-Motion-Local':'1'}});const {token}=await session.json();
const api=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.error}`);return data;};
const upload=async(file,mimeType)=>api('/assets','POST',{name:file.split('/').at(-1),mimeType,data:(await fs.readFile(file)).toString('base64')});
const retry=process.argv.includes('--retry');
const voice=retry?null:await upload('.motion-proof/test-track.wav','audio/wav');const image=retry?null:await upload('.motion-proof/reference.png','image/png');const footage=retry?null:await upload('.motion-proof/reference.mp4','video/mp4');
const report={date:new Date().toISOString(),projects:[],assets:retry?[]:[{id:voice.id,duration:voice.duration},{id:image.id,width:image.width,height:image.height},{id:footage.id,duration:footage.duration}]};
if(retry){const {jobs}=await api('/exports');for(const style of ['launch','type','data']){const j=jobs.find(j=>j.title.startsWith(`Reference · ${style} ·`));if(!j)throw new Error('No reference job to retry.');if(['failed','cancelled'].includes(j.status))await api(`/exports/${j.id}/retry`,'POST',{});report.projects.push({id:j.projectId,jobId:j.id,title:j.title});}}
else for(const [style,format] of [['launch','landscape'],['type','portrait'],['data','square']]){
 let project=exampleProject(style,format);project.title=`Reference · ${style} · ${format}`;
 project.audio=[{id:crypto.randomUUID(),assetId:voice.id,name:'Music · trimmed',start:30,trim:30,duration:210,volume:.25,fade:15},{id:crypto.randomUUID(),assetId:voice.id,name:'Second mixed track',start:120,trim:0,duration:180,volume:.1,fade:20}];
 if(style==='launch')project.scenes[1].layers.push(newLayer('image',{assetId:image.id,name:'Product screenshot',x:.65,y:.3,width:.27,height:.3,animation:'scale',radius:12}));
 if(style==='data')project.scenes[2].layers.unshift(newLayer('video',{assetId:footage.id,name:'Video insert',x:.08,y:.47,width:.4,height:.22,animation:'rise'}));
 project=addCaptions(project,parseSrt(await fs.readFile('.motion-proof/test-captions.srt','utf8')));
 const saved=await api('/projects','POST',{project});const job=await api(`/projects/${saved.id}/export`,'POST',{version:saved.version,requestId:crypto.randomUUID()});report.projects.push({id:saved.id,jobId:job.id,title:saved.project.title});
 // Editing after enqueue must not change the exported snapshot.
 if(style==='launch'){const edited=structuredClone(saved.project);edited.title='Reference · landscape · edited after export';await api(`/projects/${saved.id}`,'PUT',{version:saved.version,project:edited});}
}
await fs.writeFile('.motion-proof/acceptance.json',JSON.stringify(report,null,2));
let done=false;
for(let i=0;i<180;i++){const {jobs}=await api('/exports');const selected=report.projects.map(p=>jobs.find(j=>j.id===p.jobId));if(i%10===0)console.log(JSON.stringify(selected.map(j=>({status:j.status,progress:j.progress,title:j.title}))));if(selected.every(j=>!['queued','processing'].includes(j.status))){for(let n=0;n<selected.length;n++){const j=selected[n];report.projects[n].status=j.status;if(j.status!=='completed')throw new Error(j.error||j.status);const video=await fetch(j.url),poster=await fetch(j.poster);const output=`.motion-proof/${['launch','type','data'][n]}`;await fs.writeFile(`${output}.mp4`,Buffer.from(await video.arrayBuffer()));await fs.writeFile(`${output}.png`,Buffer.from(await poster.arrayBuffer()));report.projects[n].output=`${output}.mp4`;}done=true;break;}await new Promise(r=>setTimeout(r,1000));}
if(!done)throw new Error('Timed out waiting for local exports.');await fs.writeFile('.motion-proof/acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
