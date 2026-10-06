require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env'),quiet:true});
const express=require('express');const crypto=require('node:crypto');const path=require('node:path');const fs=require('node:fs/promises');const jwt=require('jsonwebtoken');
const {FileStore}=require('./store.cjs');const {FileBlobs}=require('./blobs.cjs');const {createMotionRouter}=require('./router.cjs');
async function start(){const root=path.resolve(__dirname,'../../.motion-data');await fs.mkdir(root,{recursive:true});const keyFile=path.join(root,'local-session-key');let secret;try{secret=await fs.readFile(keyFile,'utf8');}catch{secret=crypto.randomBytes(48).toString('hex');await fs.writeFile(keyFile,secret,{mode:0o600});}
 const port=Number(process.env.MOTION_PORT||4701),frontendPort=Number(process.env.MOTION_FRONTEND_PORT||5173);if(!Number.isInteger(frontendPort)||frontendPort<1024||frontendPort>65535)throw new Error('MOTION_FRONTEND_PORT must be a valid development port.');const app=express();app.use(express.json({limit:'58mb'}));app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&&!new Set([`http://127.0.0.1:${frontendPort}`,`http://localhost:${frontendPort}`]).has(origin)){res.status(403).json({error:'Local studio only accepts the development frontend.'});return;}next();});
 app.post('/api/motion/local-session',(req,res)=>{if(req.headers['x-motion-local']!=='1')return res.status(403).json({error:'Local session header required.'});res.json({token:jwt.sign({userId:'local-studio'},secret,{expiresIn:'12h'})});});
 const service=createMotionRouter({root,secret,local:true,store:new FileStore(path.join(root,'records')),blobs:new FileBlobs(path.join(root,'blobs')),baseUrl:`http://127.0.0.1:${port}/api/motion`});app.use('/api/motion',service.router);
 const server=app.listen(port,'127.0.0.1',()=>console.log(`Motion development API: http://127.0.0.1:${port}/api/motion (isolated local data; no production database or publishing crons)`));
 const stop=()=>{service.worker.stop();server.close(()=>process.exit(0));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
start().catch(e=>{console.error(e.message);process.exit(1);});
