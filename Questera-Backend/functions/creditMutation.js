// Compare-and-swap keeps balances and their audit transactions in one document.
// Every successful mutation advances __v; a losing writer re-reads before retrying.
async function mutateCredits(Model,userId,transform){
 for(let attempt=0;attempt<12;attempt++){
  const doc=await Model.findOne({userId});if(!doc)throw new Error('Credits record missing.');
  const current=doc.toObject();const next=transform(current);if(!next)return doc;
  delete next._id;delete next.__v;delete next.createdAt;delete next.updatedAt;
  const saved=await Model.findOneAndUpdate({_id:doc._id,__v:doc.__v},{$set:next,$inc:{__v:1}},{returnDocument:'after',runValidators:true});if(saved)return saved;
 }
 throw new Error('Credits are busy. Retry the operation.');
}
module.exports={mutateCredits};
