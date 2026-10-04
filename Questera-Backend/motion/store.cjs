const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const valid=value=>typeof value==='string'&&/^[\w-]{1,120}$/.test(value);
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
class FileStore {
 constructor(root){this.root=root;}
 file(kind,id){if(!valid(kind)||!valid(id))throw problem('Invalid resource ID.');return path.join(this.root,kind,`${id}.json`);}
 async get(kind,id,user){try{const data=JSON.parse(await fs.readFile(this.file(kind,id),'utf8'));return user!==undefined&&data.userId!==user?null:data;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async list(kind,user){const dir=path.join(this.root,kind);let names;try{names=await fs.readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}const items=await Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>this.get(kind,n.slice(0,-5),user)));return items.filter(Boolean);}
 async lock(kind,id,fn){const file=this.file(kind,id),lock=`${file}.lock`;await fs.mkdir(path.dirname(file),{recursive:true});let acquired=false;
  for(let i=0;i<200;i++){try{await fs.mkdir(lock);acquired=true;break;}catch(e){if(e.code!=='EEXIST')throw e;const stat=await fs.stat(lock).catch(()=>null);if(stat&&Date.now()-stat.mtimeMs>30000)await fs.rm(lock,{recursive:true,force:true});await new Promise(r=>setTimeout(r,15));}}
  if(!acquired)throw problem('Project is busy. Try again.',409);
  try{return await fn(file);}finally{await fs.rm(lock,{recursive:true,force:true});}
 }
 async create(kind,data){return this.lock(kind,data.id,async file=>{if(await this.get(kind,data.id))throw problem('Resource exists.',409);const result={...data,version:1,updatedAt:new Date().toISOString()};await this.write(file,result);return result;});}
 async write(file,data){const tmp=`${file}.${crypto.randomUUID()}.tmp`;await fs.writeFile(tmp,JSON.stringify(data));await fs.rename(tmp,file);}
 async mutate(kind,id,user,fn,expected){return this.lock(kind,id,async file=>{const data=await this.get(kind,id,user);if(!data)throw problem('Resource not found.',404);if(expected!==undefined&&data.version!==expected)throw problem('This project changed elsewhere. Reload before saving.',409);const changed=fn(structuredClone(data));if(!changed)return null;const next={...changed,id:data.id,userId:data.userId,version:data.version+1,updatedAt:new Date().toISOString()};await this.write(file,next);return next;});}
}
class MongoStore {
 constructor(){const mongoose=require('mongoose');const schema=new mongoose.Schema({kind:String,recordId:String,userId:{type:String,index:true},version:Number,data:mongoose.Schema.Types.Mixed},{timestamps:true,minimize:false});schema.index({kind:1,recordId:1},{unique:true});schema.index({kind:1,userId:1});this.Model=mongoose.models.MotionRecord||mongoose.model('MotionRecord',schema);}
 query(kind,id,user){if(!valid(kind)||!valid(id))throw problem('Invalid resource ID.');return {kind,recordId:id,...(user===undefined?{}:{userId:user})};}
 unpack(doc){return doc?{...doc.data,version:doc.version,updatedAt:doc.updatedAt.toISOString()}:null;}
 async get(kind,id,user){return this.unpack(await this.Model.findOne(this.query(kind,id,user)).lean());}
 async list(kind,user){return (await this.Model.find({kind,...(user===undefined?{}:{userId:user})}).lean()).map(d=>this.unpack(d));}
 async create(kind,data){this.query(kind,data.id);try{return this.unpack((await this.Model.create({kind,recordId:data.id,userId:data.userId,version:1,data})).toObject());}catch(e){if(e.code===11000)throw problem('Resource exists.',409);throw e;}}
 async mutate(kind,id,user,fn,expected){for(let i=0;i<8;i++){const current=await this.get(kind,id,user);if(!current)throw problem('Resource not found.',404);if(expected!==undefined&&expected!==current.version)throw problem('This project changed elsewhere. Reload before saving.',409);const changed=fn(structuredClone(current));if(!changed)return null;
 const data={...changed,id:current.id,userId:current.userId};const doc=await this.Model.findOneAndUpdate({...this.query(kind,id,user),version:current.version},{$set:{data},$inc:{version:1}},{returnDocument:'after'}).lean();if(doc)return this.unpack(doc);}
 throw problem('Resource is busy. Try again.',409);}
}
module.exports={FileStore,MongoStore,problem};
