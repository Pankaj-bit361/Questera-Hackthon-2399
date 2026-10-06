// Operator-designed quality reference, not a claim of automatic AI generation.
// Direct offline QA uses the shared renderer; no provider or queued export allowance is used.
import fs from 'node:fs/promises';import path from 'node:path';import {bundle} from '@remotion/bundler';import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';import {ProjectSchema,newLayer,durationOf} from './schema.mjs';import {synthesizeScore} from './sound-design.mjs';
const dir=path.resolve('.motion-proof/launch-reference');await fs.mkdir(dir,{recursive:true});const base='http://127.0.0.1:4701/api/motion';const {token}=await fetch(base+'/local-session',{method:'POST',headers:{'X-Motion-Local':'1'}}).then(r=>r.json());async function api(route,method='GET',body){const r=await fetch(base+route,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
let log=JSON.parse(await fs.readFile(path.join(dir,'evidence.json'),'utf8').catch(()=>'{}'));let serveUrl;
if(!log.resultAssetId){const actual=await api('/projects/d061f767-8e79-4e41-9bf9-cb407492fba3');const assets=(await api('/assets')).assets,inputProps={project:actual.project,urls:Object.fromEntries(assets.map(a=>[a.id,a.url]))};serveUrl=await bundle({entryPoint:path.resolve('motion/entry.jsx'),publicDir:path.resolve('public')});const composition=await selectComposition({serveUrl,id:'VelosMotion',inputProps});const output=path.join(dir,'actual-product-result.mp4');await renderMedia({serveUrl,composition,inputProps,codec:'h264',pixelFormat:'yuv420p',outputLocation:output,concurrency:2});log.resultAssetId=(await api('/assets','POST',{name:'Actual edited Studio project · rendered result',mimeType:'video/mp4',data:(await fs.readFile(output)).toString('base64')})).id;log.resultSourceProjectId=actual.id;log.resultSourceRevision=actual.version;await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(log,null,2));}
const C={paper:'#f0ece3',ink:'#16151a',lime:'#d8ff78',purple:'#7253ed',white:'#ffffff'};let serial=0;
const L=(type,name,x,y,w,h,extra={})=>newLayer(type,{id:`launch-${++serial}`,name,x:x/1080,y:y/1080,width:w/1080,height:h/1080,animation:'none',entranceDuration:10,exitDuration:0,radius:0,...extra});const T=(name,text,x,y,w,h,fontSize,color=C.ink,extra={})=>L('text',name,x,y,w,h,{text,fontSize,color,...extra});const R=(name,x,y,w,h,color,extra={})=>L('rect',name,x,y,w,h,{color,...extra});const O=(name,x,y,d,color,extra={})=>L('circle',name,x,y,d,d,{color,...extra});const I=(name,assetId,x,y,w,h,extra={})=>L('image',name,x,y,w,h,{assetId,fit:'contain',...extra});const S=(name,duration,background,layers)=>({id:`launch-shot-${++serial}`,name,duration,background,accent:C.lime,pattern:'plain',transition:'cut',layers});
const logo='6af6bd55-7313-4c97-aaa6-644cf2d1691c',before='19578518-5a29-49b2-b34c-48288b8ac74d',after='4ac1ceda-65fa-495a-b075-557fd963f69f';
const brand=(color=C.ink)=>[R('Logo contrast tile',74,64,56,56,C.ink,{radius:12}),I('Actual Velos logo',logo,80,70,44,44),T('Brand','velos',146,60,230,65,48,color)];
const shots=[
S('The idea becomes a composition',60,C.paper,[...brand(),
T('Hook','Your idea.',76,193,928,174,136),
R('Brief cursor',80,385,12,82,C.purple,{keyframes:[{frame:0,opacity:1},{frame:8,opacity:0},{frame:16,opacity:1},{frame:23,opacity:0}],end:24}),
T('Brief becomes motion','In motion.',76,384,928,182,140,C.ink,{delay:12,textAnimation:'words',stagger:4,entranceDuration:12}),
R('A direction',80,638,610,145,C.ink,{radius:22,keyframes:[{frame:0,x:-.65,opacity:0},{frame:14,x:80/1080,opacity:1},{frame:40,x:80/1080},{frame:59,x:.11,rotate:-3}]}),
T('Brief content','Make it move.',110,676,525,85,62,C.paper,{delay:10,animation:'slide'}),
O('Idea orb',760,640,170,C.lime,{keyframes:[{frame:0,scale:.2,x:.8,y:.8},{frame:16,scale:1,x:760/1080,y:640/1080},{frame:39,x:.735,y:.64},{frame:59,scale:1.16,x:.71,y:.625}]}),
R('Motion streak 1',180,871,590,12,C.purple,{keyframes:[{frame:0,scale:0},{frame:22,scale:.4},{frame:59,scale:1.28}]}),
R('Motion streak 2',295,912,590,8,C.ink,{keyframes:[{frame:0,scale:0},{frame:30,scale:.4},{frame:59,scale:1.28}]})]),
S('Type takes off',60,C.ink,[
T('Motion headline A','MAKE',72,221,936,260,248,C.paper,{keyframes:[{frame:0,x:-.9,rotate:-4,opacity:0},{frame:8,x:.067,rotate:0,opacity:1},{frame:38,x:.067},{frame:59,x:.078}]}),
T('Motion headline B','IT MOVE.',74,509,930,212,176,C.lime,{delay:8,textAnimation:'words',stagger:4,keyframes:[{frame:8,y:.62,rotate:5,opacity:0},{frame:18,y:509/1080,rotate:0,opacity:1},{frame:59,y:.48}]}),
O('Purple orbit',764,785,185,C.purple,{keyframes:[{frame:0,x:.71,y:.8,scale:1.07},{frame:18,x:.78,y:.75,scale:.86},{frame:40,x:.66,y:.76,scale:1.08},{frame:59,x:.74,y:.72,scale:1}]}),
R('Accent slash',142,811,15,170,C.lime,{rotation:25,keyframes:[{frame:0,rotate:-20,scale:0},{frame:18,rotate:25,scale:1},{frame:59,rotate:40}]}),
T('Product category','VELOS MOTION STUDIO',74, 70,940,70,40,C.paper,{tracking:.04})]),
S('Actual before and after',105,C.paper,[...brand(),
T('Demo title','Make it yours.',75,168,930,140,106),
R('Screen frame', 60,334,960,566,C.ink,{radius:26,shadow:'soft'}),
I('Actual editor before',before,72,346,936,542,{fit:'cover',radius:18,end:50,keyframes:[{frame:0,zoom:1},{frame:18,zoom:1.05},{frame:49,zoom:1.12,panY:.015}]}),
I('Actual editor after',after,72,346,936,542,{fit:'cover',radius:18,delay:50,keyframes:[{frame:50,zoom:1.12,panY:.015},{frame:75,zoom:1.18,panY:.025},{frame:104,zoom:1.23,panY:.03}]}),
R('Edit status',75,933,315,72,C.purple,{radius:36,end:50}),T('Before status','BEFORE',104,950,258,50,36,C.white,{end:50,align:'center',tracking:.03}),
R('Edit status after',75,933,315,72,C.lime,{radius:36,delay:50}),T('After status','YOUR WORDS',95,950,275,50,36,C.ink,{delay:50,align:'center',tracking:.02}),
T('Edit benefit','Your direction.',430,947,580,65,46,C.ink),
O('Real edit focus',908,646,68,C.lime,{filled:false,strokeWidth:3,strokeColor:C.lime,delay:40,end:82,keyframes:[{frame:40,scale:1.3,opacity:0},{frame:48,scale:1,opacity:.9},{frame:65,scale:.88,opacity:.9},{frame:81,scale:1.35,opacity:0}]})]),
S('The finished canvas',120,C.purple,[
T('Result title','Ready to move.',75,84,930,150,104,C.white,{animation:'rise'}),
R('Output canvas border',61,288,958,556,C.paper,{radius:22,shadow:'soft'}),
L('video','Actual rendered edited project',75,302,930,528,{assetId:log.resultAssetId,fit:'cover',radius:14,zoom:1,keyframes:[{frame:0,zoom:1},{frame:119,zoom:1.04}]}),
T('Product control','Create. Refine. Export.',75,906,930,86, 60,C.white,{align:'center',textAnimation:'words',stagger:4,delay:8})]),
S('A clear invitation',105,C.ink,[
O('Brand halo',665,113,270,C.purple,{filled:false,strokeWidth:3,strokeColor:C.purple,keyframes:[{frame:0,scale:.5,opacity:0},{frame:18,scale:1,opacity:1},{frame:104,scale:1.15,opacity:.6}]}),
I('Closing Velos logo',logo,75, 70, 70, 70),T('Closing wordmark','velos',165, 60,680,126,88,C.paper),
T('Closing invitation','Create your\nfirst motion ad.',75,328,930,310,113,C.paper,{textAnimation:'lines',stagger:4,entranceDuration:12}),
R('Action underline',75,690,930,11,C.lime,{animation:'reveal',delay:12,entranceDuration:20}),
T('Product name','Velos Motion Studio',75,811,930,80,52,C.lime),
T('Closing subline','Your idea. In motion.',75,929,930, 70,46,C.paper)])
];

const frames=durationOf({scenes:shots}),notes=[];
const cue=(frame,duration,midi,voice,velocity)=>{if(frame<frames)notes.push({frame,duration:Math.min(duration,frames-frame),midi,voice,velocity});};
const chords=[[45,57,60,64],[41,53,57,60],[48,55,60,64],[43,55,59,62]];
for(let beat=0;beat<28;beat++){const f=beat*15,chord=chords[Math.floor(beat/8)%4];cue(f,24,chord[0],'bass',.42);if(beat%2===0)cue(f,8,60,'kick',.5);if(beat%4===2)cue(f,7,60,'snare',.28);cue(f+7,5,72,'hat',.17);if(beat%2===1)cue(f,18,chord[1+(beat%3)],'pluck',.35);if(beat%8===0)for(const n of chord.slice(1))cue(f,110,n,'pad',.32);}
for(const frame of [0,60,120,170,225,345])cue(frame,18, 70,'whoosh',.28);for(const midi of [57,60,64, 70])cue(354,90,midi,'chime',.28);
const soundPlan={mode:'generated',name:'Velos launch reference · original operator score',assetId:null,tempo:120,seed:90210,notes},sound=synthesizeScore(soundPlan,frames);await fs.writeFile(path.join(dir,'score.wav'),sound.buffer);
{log.audioAssetId=(await api('/assets','POST',{name:'Velos launch reference · original operator score',mimeType:'audio/wav',data:sound.buffer.toString('base64')})).id;}
const project=ProjectSchema.parse({schemaVersion:1,title:'Velos · Your idea. In motion. · quality reference',format:'square',fps:30,scenes:shots,audio:[{id:'launch-score',assetId:log.audioAssetId,name:soundPlan.name,start:0,trim:0,duration:frames,volume:.9,fade:6}]});
const record=log.projectId?await api(`/projects/${log.projectId}`,'PUT',{project,version:(await api(`/projects/${log.projectId}`)).version}):await api('/projects','POST',{project});
await fs.writeFile(path.join(dir,'project.json'),JSON.stringify(project,null,2));await fs.writeFile(path.join(dir,'sound-plan.json'),JSON.stringify(soundPlan,null,2));log={...log,projectId:record.id,method:'Manually designed editable reference using real supplied product captures and an original operator-composed instrumental score. Direct local QA render, not an automatic AI benchmark or normal queued export.',frames,qualityTarget:9,qualityVerdict:'Pending inspection; target is not a result.',studio:`http://127.0.0.1:5173/motion/${record.id}`};await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(log,null,2));
const assets=(await api('/assets')).assets,inputProps={project,urls:Object.fromEntries(assets.map(a=>[a.id,a.url]))};serveUrl||=await bundle({entryPoint:path.resolve('motion/entry.jsx'),publicDir:path.resolve('public')});const composition=await selectComposition({serveUrl,id:'VelosMotion',inputProps});
for(const frame of [8,35,65,105,140,183,196,237,270,315,360,395,449])await renderStill({serveUrl,composition,inputProps,frame,output:path.join(dir,`frame-${frame}.jpg`),imageFormat:'jpeg',scale:.5});
await renderMedia({serveUrl,composition,inputProps,codec:'h264',pixelFormat:'yuv420p',outputLocation:path.join(dir,'velos-launch-reference.mp4'),concurrency:2});console.log(JSON.stringify({studio:log.studio,file:path.join(dir,'velos-launch-reference.mp4'),frames,notes:notes.length,peak:sound.peak}));
