// Offline integration proof: authored source + mocked AI/review, real isolated Python rendering.
// This never calls a provider or touches the running workspace's usage records.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {FileStore}=require('../Questera-Backend/motion/store.cjs'),{FileBlobs}=require('../Questera-Backend/motion/blobs.cjs');
const {makeWorker,reserve,wallet}=require('../Questera-Backend/motion/worker.cjs');
const {createPromptVideo,samplesFor}=require('../Questera-Backend/motion/prompt-video.cjs');
const {runPython,pythonStatus}=require('../Questera-Backend/motion/python-renderer.cjs');
const out=path.resolve('.motion-proof/prompt-video'),root=await fs.mkdtemp(path.join(os.tmpdir(),'velos-prompt-proof-'));
await fs.mkdir(out,{recursive:true});
const source=`from engine import *
import math
import numpy as np

RNG = np.random.RandomState(47)
ANGLES = RNG.rand(500) * math.pi * 2
RADII = .15 + RNG.rand(500) * .35
SPEEDS = .5 + RNG.rand(500) * .9
COLORS = np.array([pal(v, [CYAN, VIO, LIME, WHITE]) for v in RNG.rand(500)], np.float32)

def render_frame(fi):
    t = fi / FPS
    U = min(W, H) / 1080
    cv = np.empty((H, W, 3), np.float32)
    cv[:] = INK
    lights(cv, [(W*.35, H*.35, 360*U, VIO, .18), (W*.8, H*.7, 400*U, CYAN, .13)])
    a = ANGLES + t * SPEEDS
    r = RADII * min(W,H) * (.8 + .15*math.sin(t*2))
    px = W*.5 + r*np.cos(a)
    py = H*.45 + r*np.sin(a)*.65
    splat(cv, px, py, COLORS*.45, gain=.7)
    for k in range(3):
        draw_ellipse_ring(cv, W*.5, H*.45, (290+k*60)*U, (130+k*30)*U,
                          t*(.35+k*.07)+k*.65, 2*U, [CYAN,VIO,LIME][k], alpha=.35, add=True)
    if t < 2.5:
        enter = e_out_expo(prog(t,.12,.7))
        draw_text(cv, 'ONE IDEA.', POP_B, 110*U, W*.5, H*.42+(1-enter)*100*U,
                  WHITE, tracking=-3*U, alpha=enter)
        p = e_out_expo(prog(t,.8,.7))
        draw_text(cv, 'ENDLESS MOTION.', POP_B, 43*U, W*.5, H*.57, CYAN,
                  tracking=3*U, alpha=p)
        if t > 2.2:
            cover = smooth(2.2,2.5,t)
            fill_rect(cv, 0, 0, W*e_io3(cover), H, LIME)
    else:
        p = e_out_expo(prog(t,2.5,.25))
        draw_text(cv, 'VELOS', POP_B, 166*U, W*.5, H*.43, WHITE,
                  tracking=-4*U, alpha=p)
        draw_text(cv, 'Make it move.', POP_M, 49*U, W*.5, H*.6, LIME, alpha=p)
        draw_line(cv,W*.36,H*.68,W*.64,H*.68,3*U,LIME,alpha=p,add=True)
    bloom(cv,.65,.35)
    chroma(cv, .7*U)
    grain(cv,.012,fi)
    cv *= (1-.35*VIGN)[...,None]
    return to_u8(cv)
`;
const snapshot={engine:'python',brief:'Offline fixture: one idea becomes motion, ending on Velos. Not an AI-generated ad.',format:'square',duration:5,music:'generated'};
const soundPlan={mode:'generated',name:'Offline fixture score',tempo:120,seed:91,assetId:null,notes:[]};
for(let f=0;f<135;f+=15){soundPlan.notes.push({frame:f,duration:14,midi:36,velocity:.25,voice:'kick'});soundPlan.notes.push({frame:f,duration:12,midi:[60,64,67][Math.floor(f/15)%3],velocity:.22,voice:'pluck'});}
soundPlan.notes.push({frame:75,duration:50,midi:60,velocity:.25,voice:'pad'});
const result={title:'Velos · offline Python integration fixture',summary:'Authored fixture for testing, not creative acceptance.',source,scenes:[{name:'Idea',start:0,end:2.5},{name:'Velos',start:2.5,end:5}],soundPlan};
const assessment={approved:true,score:9,summary:'MOCK assessment for queue testing. No actual AI quality review.',issues:[],criteria:{artDirection:9,motion:9,readability:9,coherence:9},sampledFrameReview:true};
await fs.writeFile(path.join(out,'scene.py'),source);
const store=new FileStore(path.join(root,'records')),blobs=new FileBlobs(path.join(root,'blobs'));
let worker;const userId='offline-proof',id='offline-prompt-video-fixture';
try{
 assert.equal((await pythonStatus()).available,true,'Build the Python image first.');
 const images=await runPython({source,format:'square',duration:5,mode:'preview',samples:samplesFor(result.scenes)});
 for(const image of images)await fs.writeFile(path.join(out,`frame-${image.frame}.jpg`),Buffer.from(image.dataUrl.split(',')[1],'base64'));
 // Check the same source responds to the different aspect ratio and reduced preview dimensions.
 for(const format of ['landscape','portrait']){
  const [image]=await runPython({source,format,duration:5,mode:'preview',samples:[{frame:95,sample:'ending',scene:'Velos'}]});
  await fs.writeFile(path.join(out,`${format}-preview.jpg`),Buffer.from(image.dataUrl.split(',')[1],'base64'));
 }
 const walletId=await reserve(store,userId,id,5);
 await store.create('job',{id,userId,kind:'prompt-video',snapshot,status:'queued',progress:0,title:result.title,revision:1,walletId,createdAt:new Date().toISOString()});
 worker=makeWorker({store,blobs,root,urlsFor:()=>({}),intervalMs:200,promptRenderer:args=>createPromptVideo(args,{generate:async()=>result,review:async()=>assessment})});
 let job;const deadline=Date.now()+180000;
 while(Date.now()<deadline){job=await store.get('job',id,userId);if(['completed','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(job.status,'completed',job.error||'Queue did not complete in time.');
 const video=path.join(out,'offline-integration.mp4');await fs.copyFile(blobs.file(`${id}.mp4`),video);await fs.copyFile(blobs.file(`${id}.png`),path.join(out,'poster.png'));
 const {stdout}=await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,nb_frames,r_frame_rate','-of','json',video]);
 const metadata=JSON.parse(stdout),v=metadata.streams.find(s=>s.codec_type==='video'),a=metadata.streams.find(s=>s.codec_type==='audio');
 assert.equal(v.width,1080);assert.equal(v.height,1080);assert.equal(v.nb_frames,'150');assert.equal(v.codec_name,'h264');assert.equal(a.codec_name,'aac');assert.equal(v.r_frame_rate,'30/1');
 await promisify(execFile)('ffmpeg',['-v','error','-i',video,'-f','null','-'],{timeout:30000});
 const w=await wallet(store,userId);assert.equal(w.reservations[id].state,'settled');
 // A runtime with a forbidden import fails before executing the scene.
 await assert.rejects(()=>runPython({source:'import os\ndef render_frame(fi): return None',format:'square',duration:5,mode:'preview',samples:[{frame:0}]}),/imports/);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),1000);
 try{await assert.rejects(()=>runPython({source:'from engine import *\ndef render_frame(fi):\n    while True: pass',format:'square',duration:5,mode:'preview',samples:[{frame:0}],signal:controller.signal}),/cancelled/);}finally{clearTimeout(timer);}
 await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify({offlineFixture:true,aiGenerated:false,reviewMocked:true,creativeAcceptance:false,queueStatus:job.status,renderMs:job.renderMs,metadata,reservation:w.reservations[id],formatsPreviewed:['square','landscape','portrait'],fullDecode:true,forbiddenImportRejected:true,cancellationVerified:true,realWorkspaceUsageChanged:false},null,2));
 console.log(JSON.stringify({video,renderMs:job.renderMs,offlineFixture:true,creativeAcceptance:false}));
}finally{worker?.stop();await fs.rm(root,{recursive:true,force:true});}
