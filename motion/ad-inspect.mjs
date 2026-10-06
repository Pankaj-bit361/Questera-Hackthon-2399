import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),output=path.resolve('.motion-proof/velos-ads');
const report=JSON.parse(await fs.readFile(path.join(output,'benchmark.json'),'utf8'));
const results=[];
for(const item of report.ads){
 if(!item.jobId)continue;
 const job=JSON.parse(await fs.readFile(path.resolve(`.motion-data/records/job/${item.jobId}.json`),'utf8'));
 if(job.status!=='completed')continue;
 const file=path.resolve(`.motion-data/blobs/${job.id}.mp4`);
 const {stdout}=await run('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_frames,duration:format=duration,size','-of','json',file]);
 const media=JSON.parse(stdout);const project=job.snapshot;
 await run('ffmpeg',['-y','-v','error','-i',file,'-vf',`fps=8/${item.seconds},scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x141519,tile=4x2`,'-frames:v','1',path.join(output,`${item.slug}-frames.jpg`)]);
 let offset=0;
 for(let index=0;index<project.scenes.length;index++){
  const scene=project.scenes[index],time=(offset+Math.min(scene.duration-18,Math.max(30,scene.duration*.55)))/30;
  await run('ffmpeg',['-y','-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=540:540:force_original_aspect_ratio=decrease',path.join(output,`${item.slug}-scene-${index+1}.png`)]);offset+=scene.duration;
 }
 const video=media.streams.find(s=>s.codec_name==='h264');const audio=media.streams.find(s=>s.codec_name==='aac');
 results.push({slug:item.slug,video,audio,bytes:Number(media.format.size),renderMs:job.renderMs,attempts:job.attempts,revision:job.revision,sceneCount:project.scenes.length,logoPresent:project.scenes.some(s=>s.layers.some(l=>l.type==='image'&&l.assetId===report.logo.id)),keyframes:project.scenes.flatMap(s=>s.layers).reduce((n,l)=>n+l.keyframes.length,0),editableLayers:project.scenes.reduce((n,s)=>n+s.layers.length,0),motionFrames:project.scenes.reduce((n,s)=>n+s.duration,0)});
}
await fs.writeFile(path.join(output,'media-inspection.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
