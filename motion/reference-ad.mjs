// Manually art-directed reference. Uses the same editable schema and renderer as Studio.
// Run fixture first, capture its real Studio UI, then assemble and export.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ProjectSchema,newLayer,durationOf} from './schema.mjs';
const dir=path.resolve('.motion-proof/velos-ads');
const base='http://127.0.0.1:4701/api/motion';
const {token}=await(await fetch(base+'/local-session',{method:'POST',headers:{'X-Motion-Local':'1'}})).json();
const api=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
const report=JSON.parse(await fs.readFile(path.join(dir,'benchmark.json'),'utf8'));
let log;try{log=JSON.parse(await fs.readFile(path.join(dir,'reference-log.json'),'utf8'));}catch{log={method:'Manually art-directed editable project, real Studio screenshots, original synthesized sound. Not an automatic AI result.',createdAt:new Date().toISOString()};}
const persist=()=>fs.writeFile(path.join(dir,'reference-log.json'),JSON.stringify(log,null,2));
const C={paper:'#f0ece3',ink:'#16151a',purple:'#7253ed',lime:'#d8ff78',grey:'#98949f',white:'#ffffff'};
let counter=0;
const layer=(type,name,x,y,w,h,extra={})=>newLayer(type,{id:`ref-${++counter}`,name,x:x/1920,y:y/1080,width:w/1920,height:h/1080,animation:'none',radius:0,entranceDuration:12,exitDuration:0,...extra});
const rect=(name,x,y,w,h,color,extra={})=>layer('rect',name,x,y,w,h,{color,...extra});
const text=(name,copy,x,y,w,h,size,color=C.ink,extra={})=>layer('text',name,x,y,w,h,{text:copy,fontSize:size,color,...extra});
const circle=(name,x,y,diameter,color,extra={})=>layer('circle',name,x,y,diameter,diameter,{color,...extra});
const image=(name,assetId,x,y,w,h,extra={})=>layer('image',name,x,y,w,h,{assetId,fit:'contain',...extra});
const scene=(name,duration,background,layers)=>({id:`shot-${++counter}`,name,duration,background,accent:C.purple,pattern:'plain',transition:'cut',layers});
const logo=(x,y,scale=1)=>[rect('Brand tile',x,y,66*scale,66*scale,C.ink,{radius:14}),image('Actual Velos logo',report.logo.id,x+10*scale,y+12*scale,46*scale,40*scale),text('Velos wordmark','velos',x+84*scale,y-3*scale,240*scale,90*scale,62*scale)];
const pulse=[{frame:0,scale:.65,rotate:-35},{frame:22,scale:1,rotate:0},{frame:85,scale:1.08,rotate:22},{frame:145,scale:1,rotate:45}];
function poster(duration=150){return scene('Ideas move here',duration,C.paper,[
 ...logo(110,80),text('Product descriptor','MOTION STUDIO',1250,93,550,60,34,C.ink,{align:'right'}),
 text('Poster headline','Ideas\nmove\nhere.',110,215,880,700,215,C.ink,{animation:'reveal'}),
 circle('Violet disc',1030,235,690,C.purple,{keyframes:pulse.filter(k=>k.frame<duration)}),
 circle('Paper aperture',1135,340,480,C.paper,{keyframes:pulse.filter(k=>k.frame<duration)}),
 circle('Lime core',1210,415,330,C.lime,{keyframes:[{frame:0,scale:0},{frame:25,scale:1},{frame:Math.min(duration-1,110),scale:.87}]}),
 rect('Graphic cross horizontal',1200,552,350,34,C.ink,{rotation:-35,keyframes:[{frame:0,rotate:-80,scale:.4},{frame:40,rotate:-35,scale:1},{frame:duration-1,rotate:20}]}),
 rect('Graphic cross vertical',1358,392,34,350,C.ink,{rotation:-35,keyframes:[{frame:0,rotate:-80,scale:.4},{frame:40,rotate:-35,scale:1},{frame:duration-1,rotate:20}]}),
 rect('Motion ticket',1145,857,600,104,C.ink,{radius:52,animation:'slide',delay:12}),
 text('Motion ticket copy','BRIEF  →  VIDEO',1175,880,540,70,44,C.lime,{align:'center',delay:12,animation:'slide'}),
 text('Footer','A little imagination. A lot of momentum.',110,976,1000,55,30,C.ink),
 ]);}
const mode=process.argv[2]||'fixture';
if(mode==='fixture'){
 const project=ProjectSchema.parse({schemaVersion:1,title:'Velos · Ideas move here',format:'landscape',fps:30,scenes:[poster()],audio:[]});
 const record=log.fixtureId?await api(`/projects/${log.fixtureId}`,'PUT',{version:(await api(`/projects/${log.fixtureId}`)).version,project}):await api('/projects','POST',{project});
 log.fixtureId=record.id;await persist();console.log(JSON.stringify({fixtureId:record.id,url:`http://127.0.0.1:5173/motion/${record.id}`}));
}else if(mode==='assemble'){
 const upload=async(name,mimeType)=>api('/assets','POST',{name,mimeType,data:(await fs.readFile(path.join(dir,name))).toString('base64')});
 for(const name of ['studio-describe.jpg','studio-refine-before.jpg','studio-refine.jpg'])if(!log[name])log[name]=(await upload(name,'image/jpeg')).id;
 if(!log.soundId)log.soundId=(await upload('reference-sound.wav','audio/wav')).id;
 const shots=[];
 const opening=poster(60);opening.layers=opening.layers.filter(l=>l.name!=='Footer'&&l.name!=='Product descriptor');shots.push(opening);
 shots.push(scene('Make it move',60,C.purple,[
 text('Make it','Make it',110,200,1050,300,220,C.white,{keyframes:[{frame:0,x:-.52,opacity:0},{frame:10,x:110/1920,opacity:1}]}),
 text('Move','move.',110,480,1200,340,260,C.lime,{keyframes:[{frame:0,y:.9,opacity:0,rotate:8},{frame:15,y:480/1080,opacity:1,rotate:0},{frame:59,x:.07}]}),
 circle('Orbit line',1280,230,460,C.ink,{keyframes:[{frame:0,scale:.2},{frame:12,scale:1},{frame:59,scale:1.15}]}),
 circle('Orbit hole',1320,270,380,C.purple,{keyframes:[{frame:0,scale:.2},{frame:12,scale:1},{frame:59,scale:1.15}]}),
 circle('Moving point',1270,260,100,C.lime,{keyframes:[{frame:0,x:.69,y:.25},{frame:18,x:.84,y:.25},{frame:38,x:.86,y:.5},{frame:59,x:.69,y:.62}]}),
 text('Step label','01  /  DESCRIBE YOUR IDEA',110,90,1400,60,34,C.white),
 text('Step invitation','FROM A THOUGHT TO A MOVING STORY',110,920,1600,70,34,C.white),
 ]));
 shots.push(scene('Describe your idea',120,C.ink,[
 text('Describe title','Describe it.',95,65,1400,130,94,C.white),
 text('Describe detail','A brief. A direction. Your next ad.',100,204,1300,80,34,C.grey),
 rect('Screen shadow',100,346,1740,650,'#09090b',{radius:30}),
 image('Real Studio · brief',log['studio-describe.jpg'],110,325,1700,690,{radius:20,keyframes:[{frame:0,zoom:1,opacity:0},{frame:12,opacity:1,zoom:1},{frame:35,zoom:1.12},{frame:119,zoom:1.6,panX:.18,panY:-.2}]}),
 rect('Step badge',1520,75,295,74,C.lime,{radius:37}),text('Step number','01 / CREATE',1540,94,255,60,32,C.ink,{align:'center'}),
 ]));
 shots.push(scene('Refine your scene',105,C.paper,[
 text('Refine title','Make it yours.',95,65,1450,130,94,C.ink),
 text('Refine detail','Change the words. Keep your idea.',100,204,1350,80,34,C.ink),
 rect('Screen shadow',100,346,1740,650,'#d2cdc6',{radius:30}),
 image('Real Studio · before edit',log['studio-refine-before.jpg'],110,325,1700,690,{radius:20,end:40,keyframes:[{frame:0,zoom:1.65,panX:-.12,panY:-.05},{frame:50,zoom:1.65,panX:-.12,panY:-.05},{frame:104,zoom:1.35,panX:-.04,panY:-.02}]}),
 image('Real Studio · scene controls',log['studio-refine.jpg'],110,325,1700,690,{radius:20,delay:40,keyframes:[{frame:0,zoom:1.65,panX:-.12,panY:-.05},{frame:50,zoom:1.65,panX:-.12,panY:-.05},{frame:104,zoom:1.35,panX:-.04,panY:-.02}]}),
 rect('Step badge',1500,75,315,74,C.purple,{radius:37}),text('Step number','02 / REFINE',1520,94,275,60,32,C.white,{align:'center'}),
 ]));
 shots.push(scene('Built for your feed',75,C.ink,[
 text('Formats headline','One idea.\nEvery feed.',100,150,960,560,162,C.white,{animation:'reveal'}),
 rect('Portrait violet frame',1130,160,230,640,C.purple,{radius:30,rotation:-8,keyframes:[{frame:0,scale:.7,rotate:-18},{frame:20,scale:1,rotate:-8},{frame:74,rotate:-4}]}),
 text('Portrait letter','V',1153,270,185,340,220,C.lime,{align:'center',rotation:-8,animation:'scale'}),
 rect('Landscape paper frame',1340,310,470,265,C.paper,{radius:25,rotation:7,keyframes:[{frame:0,scale:.2},{frame:25,scale:1},{frame:74,rotate:0}]}),
 text('Landscape word','MOVE',1370,390,410,145,110,C.ink,{rotation:7,align:'center',animation:'slide',delay:10}),
 rect('Square lime frame',1430,610,340,340,C.lime,{radius:25,rotation:-6,keyframes:[{frame:0,scale:0},{frame:30,scale:1},{frame:74,rotate:2}]}),
 circle('Square graphic',1520,700,160,C.purple,{delay:15,animation:'scale'}),
 text('Formats footnote','PORTRAIT  /  LANDSCAPE  /  SQUARE',100,897,1050,80,32,C.grey),
 ]));
 shots.push(scene('Create with Velos',75,C.purple,[
 image('Actual Velos logo',report.logo.id,570,280,165,165,{animation:'scale'}),
 text('Velos wordmark','velos',780,245,900,270,205,C.white,{animation:'reveal',delay:3}),
 text('Closing promise','Your ideas deserve motion.',290,535,1340,150,82,C.white,{align:'center',animation:'rise',delay:8}),
 rect('Closing CTA',665,756,590,105,C.lime,{radius:52,animation:'scale',delay:12}),
 text('CTA copy','Try Motion Studio',690,785,540,70,42,C.ink,{align:'center',animation:'scale',delay:12}),
 text('Closing descriptor','CREATE  /  REFINE  /  EXPORT',430,946,1060,70,30,C.white,{align:'center',delay:18,animation:'rise'}),
 ]));
 const project=ProjectSchema.parse({schemaVersion:1,title:'Velos · Your ideas deserve motion',format:'landscape',fps:30,scenes:shots,audio:[{id:'ref-sound',assetId:log.soundId,name:'Original reference score + sound design',start:0,trim:0,duration:durationOf({scenes:shots}),volume:.85,fade:8}]});
 const record=log.projectId?await api(`/projects/${log.projectId}`,'PUT',{version:(await api(`/projects/${log.projectId}`)).version,project}):await api('/projects','POST',{project});log.projectId=record.id;log.frames=durationOf(project);await persist();await fs.writeFile(path.join(dir,'reference-project.json'),JSON.stringify(project,null,2));console.log(JSON.stringify({projectId:record.id,frames:log.frames,url:`http://127.0.0.1:5173/motion/${record.id}`}));
}else if(mode==='render'){
 const {bundle}=await import('@remotion/bundler');const {selectComposition,renderMedia,renderStill}=await import('@remotion/renderer');
 const record=await api(`/projects/${log.projectId}`);const {assets}=await api('/assets');const inputProps={project:record.project,urls:Object.fromEntries(assets.map(a=>[a.id,a.url]))};
 const serveUrl=await bundle({entryPoint:path.resolve('motion/entry.jsx'),publicDir:path.resolve('public')});const composition=await selectComposition({serveUrl,id:'VelosMotion',inputProps});
 await renderStill({serveUrl,composition,inputProps,output:path.join(dir,'reference-rebuild.png'),frame:35});
 await renderMedia({serveUrl,composition,inputProps,codec:'h264',outputLocation:path.join(dir,'reference-rebuild.mp4'),concurrency:2});
 for(const frame of [59,95,195,270,360,460])await renderStill({serveUrl,composition,inputProps,output:path.join(dir,`reference-frame-${frame}.png`),frame});
 log.renderMethod='Direct local QA render through the same Studio composition; the eight-ad benchmark already consumed the development daily export allowance. No production quota or billing records were changed.';log.exportedAt=new Date().toISOString();log.video={frames:composition.durationInFrames,width:composition.width,height:composition.height};await persist();console.log(JSON.stringify({status:'completed',file:path.join(dir,'reference-rebuild.mp4')}));
}else if(mode==='export'){
 const record=await api(`/projects/${log.projectId}`);const job=await api(`/projects/${record.id}/export`,'POST',{version:record.version,requestId:crypto.randomUUID()});log.jobId=job.id;await persist();console.log(JSON.stringify({jobId:job.id}));
 for(let tick=0;tick<180;tick++){const {jobs}=await api('/exports');const current=jobs.find(j=>j.id===job.id);if(current.status==='failed')throw Error(current.error);if(current.status==='completed'){for(const [ext,url] of [['mp4',current.url],['png',current.poster]])await fs.writeFile(path.join(dir,`reference-rebuild.${ext}`),Buffer.from(await(await fetch(url)).arrayBuffer()));log.exportedAt=new Date().toISOString();await persist();console.log(JSON.stringify({status:'completed',file:path.join(dir,'reference-rebuild.mp4')}));break;}if(tick%10===0)console.log(JSON.stringify({status:current.status,progress:current.progress}));await new Promise(resolve=>setTimeout(resolve,1000));}
}
