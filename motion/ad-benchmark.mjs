// Opt-in live provider benchmark. Uses the isolated local Motion API and its quota.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ProjectSchema, durationOf} from './schema.mjs';

const output = path.resolve('.motion-proof/velos-ads');
const base = 'http://127.0.0.1:4701/api/motion';
const concepts = [
  {slug:'01-idea-to-motion',title:'Idea to motion',format:'portrait',seconds:15,brief:'An editorial product launch. Deep charcoal and electric purple. Big staggered typography, a moving accent line, and confident empty space. Three scenes with exact primary copy: "Your idea. / In motion.", "Describe. / Design. / Refine.", "Create with Velos." Show the journey from a brief to an editable video using a simple moving dot or card motif.'},
  {slug:'02-break-the-scroll',title:'Break the scroll',format:'portrait',seconds:10,brief:'A punchy social feed interruption. Charcoal, acid lime and a small purple brand accent. Three short scenes with exact headlines: "Still posting still?", "Make your next post move.", "Meet Velos Motion Studio." Use sharply contrasting scale, diagonals, oversized type and a deliberate cut. Avoid busy backgrounds; make each hook immediately readable.'},
  {slug:'03-one-brief',title:'One brief. A moving story.',format:'landscape',seconds:15,brief:'A calm SaaS explainer using a spatial workflow. Charcoal and purple with white text. Three scenes: "Start with one brief.", "Shape every scene.", "Export your story." Show editable geometric cards labelled Brief / Scenes / MP4, connected visually using rectangles or dots. Vary left and right alignment. Final CTA "Try Velos Motion Studio." No fake app screenshots.'},
  {slug:'04-brand-reveal',title:'Your brand. Every frame.',format:'square',seconds:10,brief:'A minimal logo-led brand reveal. Dark charcoal and luminous purple. Use the supplied real Velos logo prominently with contain fit, without distortion or substituting a made-up icon. Three scenes with primary copy: "Give your ideas momentum.", "Your brand. / Every frame.", "Create with Velos." Build the reveal using an orbiting circle, scale or controlled keyframes, with generous space around the logo.'},
  {slug:'05-precise-control',title:'Change one scene',format:'landscape',seconds:15,brief:'A product-control ad. Charcoal, lavender and purple. Three scenes with primary copy: "Love the story. / Change one scene.", "Refine the details.", "Make it yours with Velos." Show three geometric storyboard cards labelled 01 / 02 / 03; highlight only card 02. Supporting labels can say "Text. Color. Timing." and "Editable scenes. Locked layers." Distinct asymmetrical compositions, no invented metrics.'},
  {slug:'06-words-that-move',title:'Words that move',format:'square',seconds:12,brief:'A kinetic typography manifesto with restrained warm coral accents and purple branding on charcoal. Three scenes using only the headline copy "Good ideas deserve motion.", "Write it. / Move it. / Make it yours.", "Velos Motion Studio." Use bold type as the main graphic, directional slide/reveal, controlled rotation and staggered timing. Keep type readable throughout; avoid overlapping words and decorative paragraphs.'},
  {slug:'07-fit-your-feed',title:'Fit your feed',format:'portrait',seconds:12,brief:'A format versatility ad with purple and mint accents on charcoal. Three scenes with primary copy: "One idea. / Different canvases.", "Portrait. Landscape. Square.", "Make your next ad with Velos." In scene two show three clearly different frame silhouettes: tall, wide, square, with short labels. Use shape layers rather than fake photos, clean layout, no overlapping labels, and a strong CTA.'},
  {slug:'08-create-refine-export',title:'Create. Refine. Export.',format:'landscape',seconds:15,brief:'A direct-response product ad using charcoal and purple. Three scenes with primary copy: "Create. Refine. Export.", "From a brief to editable motion.", "Your next story starts with Velos." Supporting labels may say "AI design", "Scene controls", "Music and captions", "MP4 export". Show a purposeful checklist or stacked cards, then a large closing invitation "Try Motion Studio." No price, speed, audience results or unsupported promises.'},
];
await fs.mkdir(output,{recursive:true});
const session = await fetch(`${base}/local-session`,{method:'POST',headers:{'X-Motion-Local':'1'}});
if(!session.ok)throw new Error('Start npm run motion:dev before this benchmark.');
const {token}=await session.json();
const api=async(url,method='GET',body)=>{
 const response=await fetch(base+url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(210000)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data;
};
const reportFile=path.join(output,'benchmark.json');
let report;
try{report=JSON.parse(await fs.readFile(reportFile,'utf8'));}catch{report={createdAt:new Date().toISOString(),ads:[],method:'Eight original briefs through the local authenticated API; inspect unedited AI output before targeted repairs. No campaign distribution.'};}
const persist=()=>fs.writeFile(reportFile,JSON.stringify(report,null,2));
const upload=async(name,mimeType)=>api('/assets','POST',{name,mimeType,data:(await fs.readFile(path.join(output,name))).toString('base64')});
if(!report.logo){const logo=await upload('velos-logo.png','image/png');report.logo={id:logo.id};await persist();}
if(!report.audio){const audio=await upload('original-motion-bed.wav','audio/wav');report.audio={id:audio.id,duration:audio.duration,source:'Original procedurally synthesized instrumental test bed, 120 BPM.'};await persist();}

for(const concept of concepts){
 let item=report.ads.find(a=>a.slug===concept.slug);
 if(!item){item={...concept,status:'pending'};report.ads.push(item);await persist();}
 if(item.jobId)continue;
 try{
  let record=item.projectId?await api(`/projects/${item.projectId}`):await api('/projects','POST',{format:concept.format});item.projectId=record.id;await persist();
  if(item.status==='design-failed'&&!item.initialFailure)item.initialFailure={error:item.error,startedAt:item.startedAt};
  const brief=`Create an original ${concept.seconds}-second ${concept.format} motion advertisement for Velos Motion Studio. ${concept.brief} Produce exactly three scenes, with at most eight layers per scene. Use a 1080px short edge, text boxes large enough for 80–150px headlines, safe margins of at least 7%, and concise secondary copy at least 28px. Use the supplied Velos logo image as a small brand mark in the closing scene unless the brief calls for a bigger reveal. Never place a logo behind text. Only supported editable 2D primitives. No numerical performance claims, invented product features, fake testimonials, stock URLs or generated code. Leave project.audio empty; the soundtrack will be attached after design. Use a purposeful mix of entrances, transitions and at least one visible keyframed movement. End with a readable brand and CTA. Replace all starter copy and layout.`;
  item.prompt=brief;item.startedAt=new Date().toISOString();await persist();
  const designed=await api(`/projects/${record.id}/design`,'POST',{brief,version:record.version,mode:'create',scope:'create'});
  item.designUsage=designed.designUsage;item.summary=designed.proposal.summary;
  const original=ProjectSchema.parse(designed.proposal.project);
  await fs.writeFile(path.join(output,`${concept.slug}-ai-original.json`),JSON.stringify(original,null,2));
  const project=structuredClone(original);project.title=`Velos Ad ${concept.slug.slice(0,2)} · ${concept.title}`;
  project.audio=[{id:crypto.randomUUID(),assetId:report.audio.id,name:'Original motion bed',start:0,trim:0,duration:durationOf(project),volume:.45,fade:18}];
  record=await api(`/projects/${record.id}`,'PUT',{project:ProjectSchema.parse(project),version:designed.version});
  item.version=record.version;item.scenes=project.scenes.map(s=>({name:s.name,frames:s.duration,layers:s.layers.length}));
  await fs.writeFile(path.join(output,`${concept.slug}.json`),JSON.stringify(record.project,null,2));
  const job=await api(`/projects/${record.id}/export`,'POST',{version:record.version,requestId:crypto.randomUUID()});
  item.jobId=job.id;item.status=job.status;await persist();
  console.log(JSON.stringify({ad:concept.slug,design:item.designUsage,status:item.status,scenes:item.scenes.length}));
 }catch(e){item.status='design-failed';item.error=e.message;await persist();console.log(JSON.stringify({ad:concept.slug,error:e.message}));}
}
for(let tick=0;tick<900;tick++){
 const {jobs}=await api('/exports');let pending=0;
 for(const item of report.ads.filter(a=>a.jobId)){
  const job=jobs.find(j=>j.id===item.jobId);if(!job)throw new Error('An export is missing.');
  item.status=job.status;item.progress=job.progress;item.error=job.error;
  if(['queued','processing'].includes(job.status))pending++;
  if(job.status==='completed'&&!item.downloadedAt){
   for(const [extension,url] of [['mp4',job.url],['png',job.poster]]){const response=await fetch(url);if(!response.ok)throw new Error('Completed export download failed');await fs.writeFile(path.join(output,`${item.slug}.${extension}`),Buffer.from(await response.arrayBuffer()));}
   item.downloadedAt=new Date().toISOString();console.log(JSON.stringify({ad:item.slug,status:'downloaded'}));
  }
 }
 await persist();if(!pending)break;
 if(tick%15===0)console.log(JSON.stringify({exports:report.ads.map(a=>({ad:a.slug,status:a.status,progress:a.progress}))}));
 await new Promise(resolve=>setTimeout(resolve,1000));
}
report.finishedAt=new Date().toISOString();await persist();
console.log(JSON.stringify({completed:report.ads.filter(a=>a.status==='completed').length,total:concepts.length,report:reportFile}));
if(report.ads.some(a=>a.status!=='completed'))process.exitCode=1;
