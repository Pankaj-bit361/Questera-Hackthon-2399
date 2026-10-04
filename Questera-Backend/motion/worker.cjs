const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {bundle}=require('@remotion/bundler');
const remotion=require('@remotion/renderer');
const {problem}=require('./store.cjs');
const day=()=>new Date().toISOString().slice(0,10);
const clean=message=>String(message).replace(/(?:https?|mongodb(?:\+srv)?):\/\/[^\s]+/g,'[private resource]').slice(0,350);
async function wallet(store,userId){
 const id=crypto.createHash('sha256').update(`${userId}_${day()}`).digest('hex');let w=await store.get('usage',id,userId);
 if(!w){try{w=await store.create('usage',{id,userId,day:day(),limit:Number(process.env.MOTION_DAILY_SECONDS||300),reservations:{},designs:0});}catch(e){if(e.status!==409)throw e;w=await store.get('usage',id,userId);}}
 return w;
}
async function reserve(store,userId,id,seconds){
 const w=await wallet(store,userId);
 await store.mutate('usage',w.id,userId,v=>{
  v.reservations=v.reservations||{};const used=Object.values(v.reservations).filter(r=>r.state!=='released').reduce((n,r)=>n+r.seconds,0);
  if(v.reservations[id]&&v.reservations[id].state!=='released')return null;
  if(used+seconds>v.limit)throw problem('Daily render allowance reached. Try again tomorrow.',429);
  v.reservations[id]={seconds,state:'reserved'};return v;
 });return w.id;
}
async function settle(store,job,success){
 if(!job.walletId)return;
 await store.mutate('usage',job.walletId,job.userId,w=>{const r=w.reservations?.[job.id];if(!r||r.state!=='reserved')return null;r.state=success?'settled':'released';return w;});
}
function makeWorker({store,blobs,root,urlsFor,renderer,promptRenderer,intervalMs=1500}){
 const render=renderer||{bundle,...remotion};let running=false,stopped=false,bundlePromise,activeCancel;const workerId=crypto.randomUUID();
 const bundleURL=()=>bundlePromise||(bundlePromise=render.bundle({entryPoint:path.resolve(__dirname,'../../motion/entry.jsx'),publicDir:path.resolve(__dirname,'../../public')}).catch(e=>{bundlePromise=null;throw e;}));
 const owns=(current,job)=>current?.status==='processing'&&current.worker===workerId&&current.leaseId===job.leaseId;
 async function tick(){
  if(running||stopped)return;running=true;
  try{
   const jobs=(await store.list('job')).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
   for(const candidate of jobs){
    if(candidate.status==='admitting'&&Date.parse(candidate.updatedAt)<Date.now()-45000){
     const failed=await store.mutate('job',candidate.id,candidate.userId,j=>j.status==='admitting'&&Date.parse(j.updatedAt)<Date.now()-45000?{...j,status:'failed',error:'Video request was interrupted before it could be queued. Create a new video.'}:null);
     if(failed)await settle(store,failed,false);continue;
    }
    if(['completed','failed','cancelled'].includes(candidate.status)){await settle(store,candidate,candidate.status==='completed');continue;}
    if(!['queued','processing'].includes(candidate.status))continue;
    if(candidate.status==='processing'&&Date.parse(candidate.leaseUntil)>Date.now())continue;
    const claimed=await store.mutate('job',candidate.id,candidate.userId,j=>{
     if(j.status!=='queued'&&!(j.status==='processing'&&!(Date.parse(j.leaseUntil)>Date.now())))return null;
     return {...j,status:'processing',worker:workerId,leaseId:crypto.randomUUID(),leaseUntil:new Date(Date.now()+45000).toISOString(),progress:0,attempts:(j.attempts||0)+1};
    });
    if(!claimed)continue;await run(claimed);break;
   }
  }catch(e){console.error('[MOTION] Worker:',clean(e.message));}finally{running=false;}
 }
 async function run(job){
  const started=Date.now(),tempDir=path.join(root,'renders',`${job.id}-${job.leaseId}`),video=path.join(tempDir,'video.mp4'),poster=path.join(tempDir,'poster.png');
  const {cancelSignal,cancel:cancelRemotion}=render.makeCancelSignal();const controller=new AbortController();const cancel=()=>{cancelRemotion();controller.abort();};activeCancel=cancel;let heartbeatError,lastProgress=0,beating=false;
  const beat=setInterval(async()=>{
   if(beating)return;beating=true;
   try{
    const current=await store.get('job',job.id,job.userId);if(!owns(current,job)||stopped){cancel();return;}
    await store.mutate('job',job.id,job.userId,j=>owns(j,job)?{...j,leaseUntil:new Date(Date.now()+45000).toISOString(),progress:Math.max(j.progress||0,lastProgress)}:null);
   }catch(e){heartbeatError=e;cancel();}finally{beating=false;}
  },2500);
  try{
   await fs.mkdir(tempDir,{recursive:true});
   if(job.attempts>3)throw new Error('Export stopped after three recovery attempts.');
   if(job.kind==='prompt-video'){
    const create=promptRenderer||require('./prompt-video.cjs').createPromptVideo;
    const stageProgress={designing:5,previewing:15,reviewing:25,repairing:30,rendering:40};
    const update=async fields=>{const changed=await store.mutate('job',job.id,job.userId,j=>owns(j,job)?{...j,...fields}:null);if(!changed){cancel();throw new Error('Video job no longer owns its worker lease.');}};
    const output=await create({snapshot:job.snapshot,generated:job.generated,signal:controller.signal,
     onStage:async stage=>{lastProgress=Math.max(lastProgress,stageProgress[stage]||0);await update({stage,progress:lastProgress});},
     onCheckpoint:async generated=>update({generated,title:generated.result.title}),
     onAccounting:async designUsage=>update({designUsage}),
     onProgress:progress=>{lastProgress=Math.max(lastProgress,40+Math.round(progress*54));}});
    if(heartbeatError)throw heartbeatError;
    if(stopped||!owns(await store.get('job',job.id,job.userId),job))return;
    await blobs.put(`${job.id}.mp4`,output.video,'video/mp4');await blobs.put(`${job.id}.png`,output.poster,'image/png');
    const done=await store.mutate('job',job.id,job.userId,j=>owns(j,job)?{...j,status:'completed',stage:'completed',progress:100,generated:output.generated,title:output.generated.result.title,renderMs:Date.now()-started,completedAt:new Date().toISOString(),error:null}:null);
    if(done)await settle(store,job,true);return;
   }
   const serveUrl=await bundleURL(),assets=await store.list('asset',job.userId),inputProps={project:job.snapshot,urls:urlsFor(assets)};
   const composition=await render.selectComposition({serveUrl,id:'VelosMotion',inputProps});
   if(stopped||!owns(await store.get('job',job.id,job.userId),job))return;
   await render.renderMedia({serveUrl,composition,inputProps,codec:'h264',pixelFormat:'yuv420p',outputLocation:video,concurrency:Number(process.env.MOTION_RENDER_CONCURRENCY||2),timeoutInMilliseconds:60000,cancelSignal,onProgress:({progress})=>{lastProgress=Math.round(progress*94);}});
   if(heartbeatError)throw heartbeatError;
   if(stopped||!owns(await store.get('job',job.id,job.userId),job))return;
   await render.renderStill({serveUrl,composition,inputProps,output:poster,frame:Math.min(45,composition.durationInFrames-1)});
   if(stopped||!owns(await store.get('job',job.id,job.userId),job))return;
   await blobs.put(`${job.id}.mp4`,await fs.readFile(video),'video/mp4');await blobs.put(`${job.id}.png`,await fs.readFile(poster),'image/png');
   const done=await store.mutate('job',job.id,job.userId,j=>owns(j,job)?{...j,status:'completed',progress:100,renderMs:Date.now()-started,completedAt:new Date().toISOString(),error:null}:null);
   if(done)await settle(store,job,true);
  }catch(e){
   const current=await store.get('job',job.id,job.userId);
   if(!stopped&&owns(current,job)){
    const failed=await store.mutate('job',job.id,job.userId,j=>owns(j,job)?{...j,status:'failed',error:clean(e.message),progress:0}:null);
    if(failed)await settle(store,job,false);
   }
  }finally{
   clearInterval(beat);activeCancel=null;
   const current=await store.get('job',job.id,job.userId);if(current?.status==='cancelled')await settle(store,job,false);
   await fs.rm(tempDir,{recursive:true,force:true});
  }
 }
 const timer=setInterval(tick,intervalMs);timer.unref();tick();
 return {tick,stop:()=>{stopped=true;clearInterval(timer);activeCancel?.();},status:()=>({running})};
}
module.exports={makeWorker,reserve,settle,wallet};
