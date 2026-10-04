import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ProjectSchema,exampleProject,validateAssets,protectLocked,durationOf,sameProject} from '../motion/schema.mjs';
import {addCaptions,parseSrt} from '../motion/captions.mjs';
import {editScope,applyDesign,retimeProject} from '../motion/edits.mjs';
import {designIssues} from '../motion/design-quality.mjs';
const require=createRequire(import.meta.url);const express=require('../Questera-Backend/node_modules/express');const jwt=require('../Questera-Backend/node_modules/jsonwebtoken');
const {FileStore}=require('../Questera-Backend/motion/store.cjs');const {FileBlobs}=require('../Questera-Backend/motion/blobs.cjs');const {reserve,settle,wallet}=require('../Questera-Backend/motion/worker.cjs');const {createMotionRouter}=require('../Questera-Backend/motion/router.cjs');
const copy=x=>structuredClone(x);
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'velos-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('all starters validate in all formats; timing, IDs, and code are bounded',()=>{
 for(const style of ['launch','type','data'])for(const format of ['landscape','portrait','square'])assert.equal(durationOf(ProjectSchema.parse(exampleProject(style,format))),450);
 const p=exampleProject();p.scenes[1].layers[0].id=p.scenes[0].layers[0].id;assert.throws(()=>ProjectSchema.parse(p));
 const long=exampleProject();long.scenes.forEach(s=>s.duration=600);long.scenes.push({...copy(long.scenes[0]),id:'extra'});assert.throws(()=>ProjectSchema.parse(long));
 const code=exampleProject();code.scenes[0].layers[0].script='fetch()';assert.throws(()=>ProjectSchema.parse(code));
 const time=exampleProject();time.scenes[0].layers[0].keyframes=[{frame:60,x:.2},{frame:30,x:.1}];assert.throws(()=>ProjectSchema.parse(time));
});
test('targeted AI edits preserve unrelated scenes, project metadata, audio, and locked layers',()=>{
 const p=exampleProject();p.scenes[0].layers[1].locked=true;p.scenes[0].layers[1].text='Manual headline';
 const candidate=copy(p);candidate.title='Wrong title';candidate.scenes.forEach(s=>s.layers[1].text='AI rewrite');candidate.scenes[1].duration=210;
 const scope=editScope(p,'Slow scene two down');const next=applyDesign(p,candidate,scope);assert.deepEqual(next.scenes[0],p.scenes[0]);assert.deepEqual(next.scenes[2],p.scenes[2]);assert.equal(next.title,p.title);assert.equal(next.scenes[1].duration,210);
 const locked=protectLocked(p,candidate);assert.equal(locked.scenes[0].layers[1].text,'Manual headline');
 const layer=applyDesign(p,candidate,{kind:'layer',id:p.scenes[1].layers[1].id});assert.deepEqual(layer.scenes[1].layers[0],p.scenes[1].layers[0]);assert.equal(layer.scenes[1].layers[1].text,'AI rewrite');assert.equal(layer.scenes[1].duration,150);
 assert.throws(()=>editScope(p,'Change scene 8'));candidate.scenes=[];assert.throws(()=>applyDesign(p,candidate,scope));
});
test('media references and actual audio trims are validated',()=>{
 const p=exampleProject();p.audio=[{id:'track',assetId:'voice',name:'voice',start:0,trim:30,duration:300,volume:.5,fade:15}];assert.equal(validateAssets(p,[]).length,1);assert.equal(validateAssets(p,[{id:'voice',kind:'audio',duration:5}]).length,1);assert.equal(validateAssets(p,[{id:'voice',kind:'audio',duration:15}]).length,0);
});
test('file persistence, ownership, and simultaneous saves enforce revision conflicts',async t=>{
 const root=await temporary(t),a=new FileStore(root),b=new FileStore(root);await a.create('project',{id:'one',userId:'alice',project:exampleProject()});assert.equal(await b.get('project','one','bob'),null);
 const results=await Promise.allSettled([a.mutate('project','one','alice',p=>({...p,n:1}),1),b.mutate('project','one','alice',p=>({...p,n:2}),1)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal((await b.get('project','one','alice')).version,2);assert.throws(()=>a.file('project','../escape'));
});
test('concurrent quotas cannot overdraw; settlement and refunds are idempotent',async t=>{
 const store=new FileStore(await temporary(t));const w=await wallet(store,'alice');await store.mutate('usage',w.id,'alice',v=>({...v,limit:30}));
 const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>reserve(store,'alice',`job-${i}`,15)));assert.equal(attempts.filter(a=>a.status==='fulfilled').length,2);
 let current=await store.get('usage',w.id,'alice');const jobs=Object.keys(current.reservations);await settle(store,{id:jobs[0],userId:'alice',walletId:w.id},false);await settle(store,{id:jobs[0],userId:'alice',walletId:w.id},false);await reserve(store,'alice','job-new',15);await settle(store,{id:'job-new',userId:'alice',walletId:w.id},true);await settle(store,{id:'job-new',userId:'alice',walletId:w.id},false);current=await store.get('usage',w.id,'alice');assert.equal(current.reservations['job-new'].state,'settled');
});
test('API authenticates ownership, revision history, media links, exports, and cancellation',async t=>{
 const root=await temporary(t);const store=new FileStore(path.join(root,'records'));const secret='motion-test-secret'.repeat(3);const app=express();app.use(express.json({limit:'58mb'}));const service=createMotionRouter({store,blobs:new FileBlobs(path.join(root,'.private','blobs')),root,secret,worker:false,baseUrl:'http://localhost/api/motion'});app.use('/api/motion',service.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/api/motion`;
 const call=async(p,method='GET',body,user='alice')=>{const response=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:`Bearer ${jwt.sign({userId:user},secret)}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 assert.equal((await call('/projects','GET',null,null)).status,401);const p=(await call('/projects','POST',{style:'data'})).data;assert.equal((await call(`/projects/${p.id}`,'GET',null,'bob')).status,404);assert.equal((await call('/projects','GET',null,'bob')).data.projects.length,0);
 const changed=copy(p.project);changed.title='Saved manual edit';const saved=await call(`/projects/${p.id}`,'PUT',{project:changed,version:p.version});assert.equal(saved.status,200);assert.equal(saved.data.history[0].version,1);assert.equal((await call(`/projects/${p.id}/revisions/1`)).data.project.title,p.project.title);assert.equal((await call(`/projects/${p.id}`,'PUT',{project:changed,version:1})).status,409);
 assert.equal((await call(`/projects/${p.id}/archive`,'POST',{archived:true})).status,400);assert.equal((await call(`/projects/${p.id}/archive`,'POST',{archived:true,version:2})).data.archived,true);const restored=(await call(`/projects/${p.id}/archive`,'POST',{archived:false,version:3})).data;
 assert.equal((await call('/assets','POST',{name:'bad',mimeType:'image/png',data:Buffer.from('not a PNG').toString('base64')})).status,400);
 // Valid 1x1 PNG, checked by ffprobe before upload.
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDVEAAAAASUVORK5CYII=';
 const upload=await call('/assets','POST',{name:'logo',mimeType:'image/png',data:png});assert.equal(upload.status,201);const media=new URL(upload.data.url);const ticketAttempt=await fetch(base+'/projects',{headers:{Authorization:'Bearer '+media.searchParams.get('ticket')}});assert.equal(ticketAttempt.status,401);assert.throws(()=>jwt.verify(media.searchParams.get('ticket'),secret));assert.equal((await fetch(base+media.pathname.replace('/api/motion','')+media.search)).status,200);assert.equal((await fetch(base+`/assets/${upload.data.id}/file`)).status,401);assert.equal((await call('/assets','GET',null,'bob')).data.assets.length,0);
 const job=(await call(`/projects/${p.id}/export`,'POST',{version:restored.version,requestId:'request-id-one'})).data;const duplicate=(await call(`/projects/${p.id}/export`,'POST',{version:restored.version,requestId:'request-id-one'})).data;assert.equal(job.id,duplicate.id);assert.equal((await store.list('job','alice')).length,1);assert.equal((await call(`/exports/${job.id}/cancel`,'POST',{},'bob')).status,404);assert.equal((await call(`/exports/${job.id}/cancel`,'POST',{})).data.status,'cancelled');await call(`/exports/${job.id}/cancel`,'POST',{});assert.equal((await call('/status')).data.remainingSeconds,300);const w=await wallet(store,'alice');assert.equal((await store.get('usage',w.id,'alice')).reservations[job.id].state,'released');
 const retried=await call(`/exports/${job.id}/retry`,'POST',{});assert.equal(retried.status,202);assert.equal(retried.data.id,job.id);assert.equal((await call('/status')).data.remainingSeconds,285);await store.mutate('job',job.id,'alice',j=>({...j,status:'completed',progress:100}));await service.blobs.put(`${job.id}.mp4`,Buffer.from('test video bytes'));const complete=(await call('/exports')).data.jobs.find(j=>j.id===job.id);const url=new URL(complete.url);const download=await fetch(base+url.pathname.replace('/api/motion','')+url.search);assert.equal(download.status,200);assert.equal(await download.text(),'test video bytes');
});

test('requested duration is exact and captions retain actual timed segments',()=>{const p=exampleProject('type','portrait');const timed=retimeProject(p,600);assert.equal(durationOf(timed),600);const segments=parseSrt('1\n00:00:04,500 --> 00:00:06,000\nA timed caption.');const captioned=addCaptions(p,segments);const one=captioned.scenes[0].layers.at(-1),two=captioned.scenes[1].layers.at(-1);assert.equal(one.delay,135);assert.equal(one.end,150);assert.equal(two.delay,0);assert.equal(two.end,30);assert.equal(two.locked,true);assert.throws(()=>parseSrt('Broken subtitle'));});
test('durable worker claims once, recovers expired leases, and releases failures/cancellation',async t=>{
 const root=await temporary(t),store=new FileStore(path.join(root,'records')),blobs=new FileBlobs(path.join(root,'.blobs'));const {makeWorker}=require('../Questera-Backend/motion/worker.cjs');const {makeCancelSignal}=require('@remotion/renderer');let calls=0;
 const render={bundle:async()=>'',selectComposition:async({inputProps})=>({durationInFrames:durationOf(inputProps.project)}),makeCancelSignal,renderMedia:async({inputProps,outputLocation,onProgress})=>{calls++;if(inputProps.project.title==='failure')throw new Error('Unavailable https://private.test/file?ticket=secret');if(inputProps.project.title==='slow')await new Promise(r=>setTimeout(r,120));onProgress({progress:1});await fs.writeFile(outputLocation,'video');},renderStill:async({output})=>fs.writeFile(output,'poster')};
 const create=async(id,title,status='queued')=>{const snapshot=exampleProject();snapshot.title=title;const walletId=await reserve(store,'alice',id,15);return store.create('job',{id,userId:'alice',snapshot,status,progress:0,createdAt:new Date().toISOString(),walletId,...(status==='processing'?{worker:'dead',leaseId:'dead',leaseUntil:new Date(0).toISOString(),attempts:1}:{})});};
 const until=async(fn)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Worker did not reach expected state');};
 await create('recover','recovery','processing');const a=makeWorker({store,blobs,root,urlsFor:()=>({}),renderer:render,intervalMs:30}),b=makeWorker({store,blobs,root,urlsFor:()=>({}),renderer:render,intervalMs:30});t.after(()=>{a.stop();b.stop();});await until(async()=> (await store.get('job','recover','alice')).status==='completed');assert.equal(calls,1);assert.equal((await store.get('job','recover','alice')).attempts,2);
 await create('failure','failure');await until(async()=>(await store.get('job','failure','alice')).status==='failed');assert.equal((await store.get('job','failure','alice')).error.includes('secret'),false);const w=await wallet(store,'alice');await until(async()=>(await store.get('usage',w.id,'alice')).reservations.failure.state==='released');
 await create('cancel','slow');await until(async()=>(await store.get('job','cancel','alice')).status==='processing');await store.mutate('job','cancel','alice',j=>({...j,status:'cancelled'}));await until(async()=>(await store.get('usage',w.id,'alice')).reservations.cancel.state==='released');assert.equal((await store.get('job','cancel','alice')).status,'cancelled');
 a.stop();b.stop();await until(()=>!a.status().running&&!b.status().running);
 await create('restart','slow');const c=makeWorker({store,blobs,root,urlsFor:()=>({}),renderer:render,intervalMs:30});await until(async()=>(await store.get('job','restart','alice')).status==='processing');c.stop();await until(()=>!c.status().running);assert.equal((await store.get('job','restart','alice')).status,'processing');await store.mutate('job','restart','alice',j=>({...j,leaseUntil:new Date(0).toISOString()}));const d=makeWorker({store,blobs,root,urlsFor:()=>({}),renderer:render,intervalMs:30});t.after(()=>d.stop());await until(async()=>(await store.get('job','restart','alice')).status==='completed');assert.equal((await store.get('job','restart','alice')).attempts,2);
});
test('AI scene patch validation preserves the original and rejects a no-op',async t=>{
 const {design}=require('../Questera-Backend/motion/design.cjs');const originalFetch=globalThis.fetch,originalKey=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-provider-key';t.after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=originalKey;});
 const original=exampleProject();const scene=copy(original.scenes[1]);scene.layers[1].animation='slide';scene.layers[1].fontSize=130;globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({scene,summary:'Changed only scene two.'})}}]})});const result=await design({brief:'Change scene 2',project:original,assets:[],format:'landscape',mode:'edit',scope:{kind:'scene',id:scene.id}});assert.deepEqual(result.project.scenes[0],original.scenes[0]);assert.equal(result.project.scenes[1].layers[1].fontSize,130);assert.equal(original.scenes[1].layers[1].fontSize,110);
 let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({project:original,summary:'Pretend edit.'})}}]})};};await assert.rejects(()=>design({brief:'Change the look',project:original,assets:[],format:'landscape',mode:'edit',scope:{kind:'all'}}),e=>e.status===422);assert.equal(calls,2);
});

test('project equality ignores validation field ordering but preserves meaningful edits',()=>{const p=exampleProject();p.scenes[0].layers[1].keyframes=[{frame:30,x:.1,y:.2,rotate:0,opacity:1,scale:1}];assert.equal(sameProject(p,ProjectSchema.parse(p)),true);const changed=copy(p);changed.scenes[0].layers[1].keyframes[0].x=.2;assert.equal(sameProject(p,changed),false);});

test('AI quality rejects clipped settled text while allowing decorative and entrance motion',()=>{
 const p=exampleProject('launch','portrait'),l=p.scenes[0].layers[1];l.x=.5;assert.match(designIssues(p).join(' '),/TOP-LEFT/);
 l.x=.08;l.keyframes=[{frame:0,x:-.9},{frame:30,x:.08}];assert.equal(designIssues(p).length,0);
 l.keyframes[1].x=.6;assert.match(designIssues(p).join(' '),/leaves the canvas/);
 l.keyframes=[];p.scenes[0].layers.at(-1).x=1.2;assert.equal(designIssues(p).length,0);
 const badPrevious=copy(p);badPrevious.scenes[0].layers[1].x=.5;const candidate=copy(badPrevious);candidate.scenes[1].layers[1].color='#ff0000';assert.equal(designIssues(candidate,{previous:badPrevious}).length,0);
});

test('AI quality rejects invented destinations and overlapping supplied logos',()=>{
 const p=exampleProject();p.scenes[0].layers[1].text='Visit VelosMotion.com';assert.match(designIssues(p).join(' '),/Do not invent/);assert.equal(designIssues(p,{brief:'Use VelosMotion.com as the destination'}).length,0);
 p.scenes[0].layers.push({id:'logo',type:'image',name:'Brand',assetId:'brand',x:.08,y:.27,width:.3,height:.2,rotation:0,fit:'contain',delay:0,end:null});const assets=[{id:'brand',name:'velos-logo.png',width:576,height:468}];assert.match(designIssues(p,{brief:'Use VelosMotion.com',assets}).join(' '),/visible regions overlap/);
 p.scenes[0].layers.at(-1).y=.02;p.scenes[0].layers.at(-1).height=.08;assert.equal(designIssues(p,{brief:'Use VelosMotion.com',assets}).length,0);
});

test('AI quality requires visible labels as text layers rather than hidden shape metadata',()=>{const p=exampleProject();p.scenes[0].layers.at(-1).text='01';assert.match(designIssues(p).join(' '),/separate text layers/);});

test('AI repair feedback rejects unsafe layout and accounts for both provider attempts',async t=>{
 const {design}=require('../Questera-Backend/motion/design.cjs'),originalFetch=globalThis.fetch,originalKey=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';t.after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=originalKey;});
 const good=exampleProject(),bad=copy(good);bad.scenes[0].layers[1].x=.5;let calls=0;globalThis.fetch=async(url,options)=>{calls++;if(calls===2)assert.match(JSON.parse(options.body).messages.at(-1).content,/TOP-LEFT/);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({project:calls===1?bad:good,summary:'Corrected layout.'})}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15,cost:.001}})};};
 const result=await design({brief:'Create a launch ad',project:null,assets:[],format:'landscape',mode:'create',scope:{kind:'all'},pipeline:'freeform'});assert.equal(result.attempts,2);assert.equal(result.usage.total_tokens,30);assert.equal(result.usage.cost,.002);assert.equal(result.usage.accounting,'all-provider-attempts');
});

test('entrance and exit timings preserve legacy projects and allow crisp cuts',()=>{
 const old=exampleProject();const layer=old.scenes[0].layers[0];delete layer.entranceDuration;delete layer.exitDuration;
 const parsed=ProjectSchema.parse(old);assert.equal(parsed.scenes[0].layers[0].entranceDuration,24);assert.equal(parsed.scenes[0].layers[0].exitDuration,12);
 const cut=copy(parsed);cut.scenes[0].layers[0].entranceDuration=8;cut.scenes[0].layers[0].exitDuration=0;assert.equal(ProjectSchema.parse(cut).scenes[0].layers[0].exitDuration,0);
 cut.scenes[0].layers[0].entranceDuration=0;assert.throws(()=>ProjectSchema.parse(cut));cut.scenes[0].layers[0].entranceDuration=8;cut.scenes[0].layers[0].exitDuration=91;assert.throws(()=>ProjectSchema.parse(cut));
});

test('media camera keyframes are bounded and preserved through targeted edits',()=>{
 const p=exampleProject();const l=p.scenes[0].layers[1];l.type='image';l.assetId='screenshot';l.text='';l.zoom=1.5;l.panX=-.2;l.panY=.1;l.keyframes=[{frame:0,zoom:1,panX:0,panY:0},{frame:60,zoom:2,panX:-.3,panY:.2}];
 const parsed=ProjectSchema.parse(p);const edit=copy(parsed);edit.scenes[1].layers[1].text='Changed';const next=applyDesign(parsed,edit,{kind:'scene',id:p.scenes[1].id});assert.deepEqual(next.scenes[0],parsed.scenes[0]);
 l.keyframes[1].zoom=5.1;assert.throws(()=>ProjectSchema.parse(p));l.keyframes[1].zoom=2;l.keyframes[1].panX=-1.1;assert.throws(()=>ProjectSchema.parse(p));
});
