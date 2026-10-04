const crypto=require('node:crypto');
async function attachSound({result,assets,store,blobs,userId}){
 const {durationOf,ProjectSchema}=await import('../../motion/schema.mjs');const {validateSoundPlan,synthesizeScore}=await import('../../motion/sound-design.mjs');
 const frames=durationOf(result.project),plan=validateSoundPlan(result.soundPlan,frames,assets),project=structuredClone(result.project);
 if(plan.mode==='silent'){project.audio=[];return {...result,project:ProjectSchema.parse(project)};}
 let asset;if(plan.mode==='asset')asset=assets.find(a=>a.id===plan.assetId);
 else{
  if(assets.length>=200)throw Object.assign(new Error('The asset library is full. Free space before generating new music.'),{status:429});
  const sound=synthesizeScore(plan,frames);asset={id:crypto.randomUUID(),userId,name:plan.name,mimeType:sound.mimeType,kind:'audio',size:sound.buffer.length,duration:sound.duration,generated:true,provenance:'AI event score rendered with local synthesis',soundPlan:plan,createdAt:new Date().toISOString()};
  await blobs.put(asset.id,sound.buffer,sound.mimeType);asset=await store.create('asset',asset);
 }
 project.audio=[{id:crypto.randomUUID(),assetId:asset.id,name:plan.name,start:0,trim:0,duration:frames,volume:.85,fade:6}];
 return {...result,project:ProjectSchema.parse(project),generatedAudio:{mode:plan.mode,assetId:asset.id,name:plan.name,...(plan.mode==='generated'?{notes:plan.notes.length,tempo:plan.tempo,provenance:asset.provenance}:{})}};
}
module.exports={attachSound};
