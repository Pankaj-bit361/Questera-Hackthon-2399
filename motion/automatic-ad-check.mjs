// Live end-to-end check through normal Studio quota, review, save and export routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const dir=path.resolve('.motion-proof/automatic-flow/live-ad');
const base='http://127.0.0.1:4701/api/motion';
const session=await fetch(base+'/local-session',{method:'POST',headers:{'X-Motion-Local':'1'}}).then(r=>r.json());
if(!session.token)throw Error('Start the isolated local Motion API first.');
async function api(route,method='GET',body){const response=await fetch(base+route,{method,headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(270000)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
const status=await api('/status');
if(!status.local)throw Error('This proof requires the isolated local API.');
await fs.mkdir(dir,{recursive:true});
let evidence=JSON.parse(await fs.readFile(path.join(dir,'run.json'),'utf8').catch(()=>'{}'));
let record=evidence.projectId?await api('/projects/'+evidence.projectId):null;
if(!record?.designAutomation){
 if(status.designs>=status.dailyDesignLimit)throw Error('Daily AI allowance reached. Obtain the requested local test allowance before a fresh generation. Usage is not reset.');
 if(status.remainingSeconds<15)throw Error('A 15-second normal queued export needs more render allowance. Existing usage is retained.');
 if(!record){record=await api('/projects','POST',{format:'square'});evidence={projectId:record.id,startedAt:new Date().toISOString(),source:'Normal local Studio automatic pipeline'};await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(evidence,null,2));}
 const brief=await fs.readFile(path.resolve('.motion-proof/automatic-flow/fresh-ad-brief.txt'),'utf8');
 console.log('Generating original composition, rendered-frame critique and sound score…');
 record=await api(`/projects/${record.id}/design`,'POST',{brief,version:record.version,mode:'create',scope:'create',pipeline:'automatic'});
 await fs.writeFile(path.join(dir,'design-response.json'),JSON.stringify(record,null,2));
 await fs.writeFile(path.join(dir,'project.json'),JSON.stringify(record.project,null,2));
 evidence={...evidence,designUsage:record.designUsage,automation:record.designAutomation,generatedAudio:record.generatedAudio,exportWarning:record.exportWarning};
 await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(evidence,null,2));
}
let jobs=(await api('/exports')).jobs;let job=jobs.find(j=>j.projectId===record.id&&j.revision===record.version);
if(!job)job=await api(`/projects/${record.id}/export`,'POST',{version:record.version,requestId:`automatic-proof-${record.id}-${record.version}`});
const deadline=Date.now()+300000;let logged=-1;
while(['queued','processing'].includes(job.status)){
 if(Date.now()>deadline)throw Error('Export still running; rerun this check to resume without generating again.');
 if(Math.floor(job.progress/20)!==logged){logged=Math.floor(job.progress/20);console.log(`Export ${job.status}: ${job.progress}%`);}
 await delay(2000);job=(await api('/exports')).jobs.find(j=>j.id===job.id);
}
if(job.status!=='completed')throw Error(`Export ${job.status}: ${job.error||'inspect Studio'}`);
const video=await fetch(job.url);if(!video.ok)throw Error('Could not download the authenticated export.');
const output=path.join(dir,'velos-original-ad.mp4');await fs.writeFile(output,Buffer.from(await video.arrayBuffer()));
evidence={...evidence,projectId:record.id,studio:`http://127.0.0.1:5173/motion/${record.id}`,jobId:job.id,revision:job.revision,output,completedAt:new Date().toISOString(),statusAfter:await api('/status')};await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({studio:evidence.studio,output,designUsage:evidence.designUsage,remaining:evidence.statusAfter.remainingSeconds}));
