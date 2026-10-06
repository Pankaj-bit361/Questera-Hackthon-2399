const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {problem}=require('./store.cjs');
const IMAGE=()=>process.env.MOTION_PYTHON_IMAGE||'velos-motion-python:local';
const DOCKER=()=>process.env.MOTION_DOCKER||'docker';
const FORMATS={landscape:[1920,1080],square:[1080,1080],portrait:[1080,1920]};

async function pythonStatus(){
 try{await promisify(execFile)(DOCKER(),['image','inspect',IMAGE()],{timeout:5000,maxBuffer:10000});return {available:true};}
 catch{return {available:false,message:'Prompt video rendering is unavailable. Build the motion Python worker image.'};}
}
function containerArgs({name,input}){
 return ['run','--rm','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL',
  '--security-opt=no-new-privileges','--user=10001:10001','--memory=2g','--memory-swap=2g',
  '--cpus=2','--pids-limit=64','--ulimit=nofile=128:128',
  '--tmpfs=/tmp:rw,nosuid,noexec,size=64m,uid=10001,gid=10001',
  '--tmpfs=/output:rw,nosuid,noexec,size=192m,uid=10001,gid=10001',
  '--mount',`type=bind,source=${input},target=/input,readonly`,IMAGE()];
}
async function runPython({source,format,duration,mode='render',samples=[],audio,signal,onProgress,timeoutMs=600000}){
 const dims=FORMATS[format];if(!dims||!Number.isFinite(duration)||duration<5||duration>30)throw problem('Use a supported format and a duration from 5 to 30 seconds.');
 if(typeof source!=='string'||!source.trim()||source.length>80000)throw problem('Scene code is missing or too large.',422);
 if(!['preview','render'].includes(mode))throw problem('Unknown Python render mode.');
 if(signal?.aborted)throw problem('Video rendering was cancelled.',499);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'velos-python-')),name=`velos-motion-${crypto.randomUUID()}`;
 let child,timer,abort,stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;child?.kill('SIGTERM');promisify(execFile)(DOCKER(),['rm','-f',name],{timeout:10000,maxBuffer:10000}).catch(()=>{});};
 try{
  await fs.chmod(dir,0o755);await fs.writeFile(path.join(dir,'scene.py'),source,{mode:0o644});
  await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({mode,width:dims[0],height:dims[1],duration,samples}),{mode:0o644});
  if(audio)await fs.writeFile(path.join(dir,'audio.wav'),audio,{mode:0o644});
  const output=await new Promise((resolve,reject)=>{
   child=spawn(DOCKER(),containerArgs({name,input:dir}),{stdio:['ignore','pipe','pipe']});
   let bytes=0,errors='',lineBuffer='';const chunks=[];
   const fail=message=>{stop();reject(problem(message,422));};
   abort=()=>fail('Video rendering was cancelled.');signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   timer=setTimeout(()=>fail('Scene rendering exceeded its time limit. Simplify the scene and try again.'),timeoutMs);
   child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>144*1024*1024){fail('Rendered output exceeded its size limit.');return;}chunks.push(chunk);});
   child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-4000);lineBuffer+=chunk.toString();const lines=lineBuffer.split('\n');lineBuffer=lines.pop().slice(-2000);for(const line of lines){const match=/^MOTION_PROGRESS ([0-9.]+)$/.exec(line);if(match)onProgress?.(Math.min(1,Number(match[1])));}});
   child.on('error',()=>fail('Docker could not start the isolated motion worker.'));
   child.on('close',code=>{if(stopped)return;if(code!==0){reject(problem(`Scene render failed. ${errors.replace(/https?:\/\/\S+/g,'[resource]').slice(-1400)}`,422));return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(problem('Scene worker returned invalid output.',422));}});
  });
  if(mode==='preview'){
   if(!Array.isArray(output.images)||output.images.length!==samples.length)throw problem('Preview frames are missing.',422);
   return output.images.map((im,i)=>({...samples[i],dataUrl:`data:image/jpeg;base64,${im.data}`}));
  }
  if(output.frames!==Math.round(duration*30)||output.width!==dims[0]||output.height!==dims[1])throw problem('Rendered video dimensions or timing are incorrect.',422);
  const video=Buffer.from(output.video||'','base64'),poster=Buffer.from(output.poster||'','base64');
  if(video.length<12||video.toString('ascii',4,8)!=='ftyp'||poster.length<8||!poster.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw problem('Worker output is not a valid MP4 and PNG.',422);
  return {video,poster,frames:output.frames};
 }finally{
  clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);
  await promisify(execFile)(DOCKER(),['rm','-f',name],{timeout:10000,maxBuffer:10000}).catch(()=>{});
  await fs.rm(dir,{recursive:true,force:true});
 }
}
module.exports={runPython,pythonStatus,containerArgs,FORMATS};
