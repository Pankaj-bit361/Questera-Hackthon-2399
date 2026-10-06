import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createPromptVideo,samplesFor,validateScenes,generate,assess}=require('../Questera-Backend/motion/prompt-video.cjs');
const {containerArgs}=require('../Questera-Backend/motion/python-renderer.cjs');
const snapshot={engine:'python',brief:'An original silent motion graphic',duration:5,format:'square',music:'silent'};
const result={title:'Fixture',summary:'Offline scene',source:'def render_frame(fi): pass',scenes:[{name:'Hook',start:0,end:2},{name:'Ending',start:2,end:5}],soundPlan:{mode:'silent',name:'Silence',notes:[]}};
const review={approved:true,score:9,issues:[],summary:'Fixture review',criteria:{artDirection:9,motion:9,readability:9,coherence:9}};

test('prompt video repairs a scene runtime failure before review and checkpoints only approved code',async()=>{
 let generates=0,renders=0,reviews=0,checkpoint;const stages=[];
 const output=await createPromptVideo({snapshot,onStage:s=>stages.push(s),onCheckpoint:async g=>{checkpoint=g;}},{generate:async args=>{generates++;if(generates===2)assert.match(args.feedback,/runtime/);return result;},review:async()=>{reviews++;return review;},render:async args=>{renders++;if(renders===1)throw new Error('Invalid frame shape');return args.mode==='preview'?[{frame:8,dataUrl:'fixture'}]:{video:Buffer.from('mp4'),poster:Buffer.from('png')};}});
 assert.equal(generates,2);assert.equal(reviews,1);assert.equal(renders,3);assert.equal(checkpoint.result,result);assert.equal(output.generated,checkpoint);assert.deepEqual(stages,['designing','previewing','repairing','previewing','reviewing','rendering']);
});
test('prompt video fails honest review without exporting and never accepts a low score',async()=>{
 let renders=0,generates=0,checkpoints=0;
 await assert.rejects(()=>createPromptVideo({snapshot,onCheckpoint:()=>{checkpoints++;}},{generate:async()=>{generates++;return result;},review:async()=>({...review,score:7,approved:true,issues:[]}),render:async args=>{renders++;assert.equal(args.mode,'preview');return [];}}),/needs more work/);
 assert.equal(generates,2);assert.equal(renders,2);assert.equal(checkpoints,0);
});
test('an approved checkpoint re-renders without another provider operation',async()=>{
 const generated={result,assessment:review,usage:{calls:2}};let renders=0;
 const output=await createPromptVideo({snapshot,generated},{generate:()=>{throw new Error('Must not regenerate');},review:()=>{throw new Error('Must not re-review');},render:async args=>{renders++;assert.equal(args.mode,'render');assert.equal(args.audio,undefined);return {video:Buffer.from('mp4'),poster:Buffer.from('png')};}});
 assert.equal(renders,1);assert.equal(output.generated,generated);
});
test('failed generation still records every charged provider response',async()=>{
 const accounting=[];
 await assert.rejects(()=>createPromptVideo({snapshot,onAccounting:async usage=>accounting.push(usage)},{generate:async args=>{args.onUsage({total_tokens:25,cost:.01},'fixture-model');throw new Error('Invalid generated scene');}}),/Invalid generated scene/);
 assert.equal(accounting.length,2);assert.equal(accounting.at(-1).calls,2);assert.equal(accounting.at(-1).total_tokens,50);assert.equal(accounting.at(-1).cost,.02);
});
test('scene samples cover actual shot boundaries and reject gaps',()=>{
 validateScenes(result.scenes,5);assert.throws(()=>validateScenes([{name:'Wrong',start:0,end:4}],5),/full video/);assert.throws(()=>validateScenes([{start:0,end:2},{start:3,end:5}],5),/no gaps/);
 const samples=samplesFor(result.scenes);assert.deepEqual(samples.filter(s=>s.sample==='last').map(s=>s.frame),[59,149]);assert.ok(samples.every(s=>s.frame>=0&&s.frame<150));
});
test('container invocation denies network and host writes, limits resources and never pulls at runtime',()=>{
 const args=containerArgs({name:'fixture',input:'/tmp/scene'});for(const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pull=never','--memory=2g','--pids-limit=64'])assert.ok(args.includes(flag));assert.ok(args.includes('type=bind,source=/tmp/scene,target=/input,readonly'));assert.ok(args.some(s=>s.startsWith('--tmpfs=/output:')&&s.includes('size=192m')));
});
test('real provider adapters request original code and images with Gemini 3.8 and Greta, and respect silence',async t=>{
 const oldFetch=globalThis.fetch;let calls=0;t.after(()=>{globalThis.fetch=oldFetch;});
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.model,'google/gemini-3.8-flash');assert.equal(options.headers['X-Title'],'Greta');calls++;if(calls===1)assert.match(body.messages[0].content,/render_frame/);else assert.ok(body.messages[1].content.some(v=>v.type==='image_url'));const content=calls===1?result:{score:10,summary:'Tiny text',issues:[],criteria:{artDirection:9,motion:9,readability:4,coherence:9}};return {ok:true,json:async()=>({model:body.model,choices:[{message:{content:JSON.stringify(content)}}],usage:{total_tokens:100}})};};
 let tokens=0;const generated=await generate({snapshot,deadline:Date.now()+5000,onUsage:u=>{tokens+=u.total_tokens;}});assert.equal(generated.soundPlan.mode,'silent');
 const assessed=await assess({snapshot,result:generated,images:[{scene:'Hook',frame:8,dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ=='}],deadline:Date.now()+5000});assert.equal(assessed.approved,false);assert.ok(assessed.score<9);assert.match(assessed.issues.join(' '),/readability/);assert.equal(tokens,100);
});

test('prompt-video API queues once, checks quotas and ownership, and releases render allowance on cancellation',async t=>{
 const express=require('../Questera-Backend/node_modules/express'),jwt=require('../Questera-Backend/node_modules/jsonwebtoken');
 const {FileStore}=require('../Questera-Backend/motion/store.cjs'),{FileBlobs}=require('../Questera-Backend/motion/blobs.cjs'),{createMotionRouter}=require('../Questera-Backend/motion/router.cjs'),{wallet}=require('../Questera-Backend/motion/worker.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'velos-prompt-api-')),store=new FileStore(path.join(root,'records')),blobs=new FileBlobs(path.join(root,'blobs')),secret='prompt-video-test-secret'.repeat(3),oldKey=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='mock-key';
 const app=express();app.use(express.json());const service=createMotionRouter({root,store,blobs,secret,worker:false,local:true,promptStatus:async()=>({available:true}),baseUrl:'http://localhost/api/motion'});app.use('/api/motion',service.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;});
 const base=`http://127.0.0.1:${server.address().port}/api/motion`,call=async(route,method='GET',body,user='alice')=>{const res=await fetch(base+route,{method,headers:{Authorization:`Bearer ${jwt.sign({userId:user},secret)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 const body={brief:snapshot.brief,duration:5,format:'square',music:'silent',requestId:'idempotent-video-request'};
 const first=await call('/videos','POST',body);assert.equal(first.status,202);const duplicate=await call('/videos','POST',body);assert.equal(duplicate.status,200);assert.equal(duplicate.data.id,first.data.id);
 let w=await wallet(store,'alice');assert.equal(w.designs,1);assert.equal(w.reservations[first.data.id].seconds,5);
 assert.equal((await call('/videos','GET',null,'bob')).data.videos.length,0);assert.equal((await call(`/videos/${first.data.id}`,'GET',null,'bob')).status,404);assert.equal((await call(`/exports/${first.data.id}/cancel`,'POST',{},'bob')).status,404);
 assert.equal((await call('/videos','POST',{...body,brief:'Changed brief'})).status,409);
 assert.equal((await call('/videos','POST',{...body,requestId:'another-video-request'})).status,409);
 await call(`/exports/${first.data.id}/cancel`,'POST',{});w=await wallet(store,'alice');assert.equal(w.reservations[first.data.id].state,'released');
 assert.equal((await call(`/exports/${first.data.id}/retry`,'POST',{})).status,409);
 await store.mutate('usage',w.id,'alice',v=>({...v,designs:30}));assert.equal((await call('/videos','POST',{...body,requestId:'quota-blocked-video'})).status,429);
 await store.mutate('usage',w.id,'alice',v=>({...v,designs:1,limit:2}));assert.equal((await call('/videos','POST',{...body,requestId:'render-quota-blocked'})).status,429);w=await wallet(store,'alice');assert.equal(w.designs,1);
});

test('a recovered prompt-video worker uses its approved checkpoint and settles once',async t=>{
 const {FileStore}=require('../Questera-Backend/motion/store.cjs'),{FileBlobs}=require('../Questera-Backend/motion/blobs.cjs');
 const {makeWorker,reserve,wallet}=require('../Questera-Backend/motion/worker.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'velos-prompt-recovery-')),store=new FileStore(path.join(root,'records')),blobs=new FileBlobs(path.join(root,'blobs'));
 const id='prompt-recover',userId='alice',generated={result,assessment:review};let renderCalls=0;
 const walletId=await reserve(store,userId,id,5);
 await store.create('job',{id,userId,kind:'prompt-video',snapshot,title:'Original',status:'processing',attempts:1,worker:'old',leaseUntil:new Date(0).toISOString(),createdAt:new Date().toISOString(),walletId,generated});
 const worker=makeWorker({store,blobs,root,urlsFor:()=>({}),intervalMs:100000,promptRenderer:async args=>{renderCalls++;assert.deepEqual(args.generated,generated);await args.onStage('rendering');args.onProgress(.5);return {video:Buffer.from('fixture video'),poster:Buffer.from('fixture poster'),generated};}});
 t.after(async()=>{worker.stop();await fs.rm(root,{recursive:true,force:true});});
 let done;for(let i=0;i<100;i++){done=await store.get('job',id,userId);if(done.status==='completed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(done.status,'completed');assert.equal(done.attempts,2);assert.equal(done.title,result.title);assert.equal(renderCalls,1);assert.equal((await wallet(store,userId)).reservations[id].state,'settled');
 await worker.tick();assert.equal(renderCalls,1);
});
