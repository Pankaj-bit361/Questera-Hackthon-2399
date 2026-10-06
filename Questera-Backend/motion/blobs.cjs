const fs=require('node:fs/promises');
const path=require('node:path');
class FileBlobs {
 constructor(root){this.root=root;}
 file(id){if(!/^[\w-]{1,140}(?:\.(?:mp4|png))?$/.test(id))throw new Error('Invalid file.');return path.join(this.root,id);}
 async put(id,buffer){await fs.mkdir(this.root,{recursive:true});await fs.writeFile(this.file(id),buffer);}
 async send(id,res){await fs.access(this.file(id));await new Promise((resolve,reject)=>res.sendFile(this.file(id),{dotfiles:'allow'},e=>e&&!res.destroyed&&!['ECONNABORTED','ECONNRESET','EPIPE'].includes(e.code)?reject(e):resolve()));}
}
class S3Blobs {
 constructor(){const {S3Client}=require('@aws-sdk/client-s3');this.client=new S3Client({region:process.env.AWS_REGION});this.bucket=process.env.AWS_S3_BUCKET_NAME;if(!this.bucket)throw new Error('Motion S3 storage requires AWS_S3_BUCKET_NAME.');}
 async put(id,buffer,type){const {PutObjectCommand}=require('@aws-sdk/client-s3');await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:`motion/${id}`,Body:buffer,ContentType:type}));}
 async send(id,res,req){const {GetObjectCommand}=require('@aws-sdk/client-s3');const out=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:`motion/${id}`,...(req?.headers.range&&/^bytes=\d*-\d*$/.test(req.headers.range)?{Range:req.headers.range}:{})}));if(out.ContentRange){res.status(206);res.setHeader('Content-Range',out.ContentRange);}res.setHeader('Accept-Ranges','bytes');if(out.ContentLength)res.setHeader('Content-Length',out.ContentLength);out.Body.on('error',()=>res.destroy());res.on('close',()=>out.Body.destroy());out.Body.pipe(res);}
}
module.exports={FileBlobs,S3Blobs};
