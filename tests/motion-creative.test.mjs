import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {composePlan,LAYOUTS,planIssues,CreativePlanSchema} from '../motion/creative-plan.mjs';
import {ProjectSchema,durationOf} from '../motion/schema.mjs';
import {applyDesign} from '../motion/edits.mjs';
const require=createRequire(import.meta.url);
const assets=[{id:'logo',name:'actual-logo.png',kind:'image',width:576,height:468},{id:'screen',name:'studio.jpg',kind:'image',width:1280,height:720},{id:'after',name:'studio-after.jpg',kind:'image',width:1280,height:720}];
const story=layout=>({version:1,title:'Ideas deserve motion',brand:'Velos',descriptor:'MOTION STUDIO',direction:'editorial',seconds:12,palette:{paper:'#f0ece3',ink:'#16151a',accent:'#7253ed',pop:'#d8ff78'},logoAssetId:'logo',shots:[{layout,name:'Opening',weight:1,headline:'Ideas move here.',words:['CREATE','REFINE','EXPORT'],...(layout==='editor'?{assetId:'screen',focus:'left'}:layout==='refine'?{assetId:'screen',afterAssetId:'after'}:{})},{layout:'collage',name:'The story',weight:1.5,headline:'Make it yours.',words:['TEXT','COLOR','TIMING']},{layout:'close',name:'Invitation',weight:.5,headline:'Try Motion Studio'}]});
test('every guided layout composes all formats with exact timing, valid assets and readable close',()=>{
 for(const format of ['landscape','portrait','square'])for(const layout of Object.keys(LAYOUTS)){
  const {project}=composePlan(story(layout),{format,assets,seconds:15});assert.equal(durationOf(project),450);assert.ok(project.scenes.at(-1).duration>=84&&project.scenes.at(-1).duration<=108);assert.ok(project.scenes.every(s=>s.layers.length<=25));assert.equal(ProjectSchema.parse(project).format,format);assert.ok(project.scenes.every(s=>s.layers.every(l=>l.exitDuration===0)));
 }
});
test('guided stories reject unprovided media, fake numerical claims, weak contrast and malformed code',()=>{
 const p=story('editor');p.shots[0].assetId='unknown';assert.throws(()=>composePlan(p,{assets}),/supplied image|Unknown image/);
 p.shots[0].assetId='screen';p.shots[0].headline='10x more views';assert.throws(()=>composePlan(p,{assets}),/invent numerical/);assert.equal(planIssues(CreativePlanSchema.parse(p),{assets,brief:'10x more views'}).length,0);
 p.shots[0].headline='Your next ad';p.palette.ink='#cccccc';assert.throws(()=>composePlan(p,{assets}),/7:1 contrast/);
 const bad=story('poster');bad.shots[0].script='fetch()';assert.throws(()=>CreativePlanSchema.parse(bad));bad.shots[0].script=undefined;bad.shots[0].layout='execute-code';assert.throws(()=>CreativePlanSchema.parse(bad));
 const url=story('poster');url.shots[0].headline='Visit invented-example.com';assert.throws(()=>composePlan(url,{assets}),/Do not invent destination/);
});
test('compiled story retains unrelated scenes and locked branding through targeted refinement',()=>{
 const {project}=composePlan(story('refine'),{assets,format:'landscape'});project.scenes[0].layers[1].locked=true;
 const candidate=structuredClone(project);candidate.scenes.forEach(s=>s.layers.find(l=>l.type==='text').text='Changed');
 const next=applyDesign(project,candidate,{kind:'scene',id:project.scenes[1].id});assert.deepEqual(next.scenes[0],project.scenes[0]);assert.deepEqual(next.scenes[2],project.scenes[2]);assert.notDeepEqual(next.scenes[1],project.scenes[1]);
});
test('guided provider repairs a story and accounts all attempts without consuming raw geometry',async t=>{
 const {design}=require('../Questera-Backend/motion/design.cjs'),oldFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';t.after(()=>{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;});
 let calls=0;globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.headers['X-Title'],'Greta');assert.equal(JSON.parse(options.body).model,process.env.MOTION_LLM_MODEL||'google/gemini-3.8-flash');const plan=story('editor');if(calls===1)plan.shots[0].assetId='invented';else assert.match(JSON.parse(options.body).messages.at(-1).content,/supplied image|Unknown image/);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({plan,summary:'A product story in three shots.'})}}],usage:{total_tokens:100,prompt_tokens:70,completion_tokens:30,cost:.001}})};};
 const result=await design({brief:'Create a 15-second Velos ad',assets,format:'portrait',project:null,mode:'create',pipeline:'guided'});assert.equal(result.pipeline,'guided');assert.equal(result.attempts,2);assert.equal(result.usage.total_tokens,200);assert.equal(result.usage.cost,.002);assert.equal(durationOf(result.project),450);assert.equal(result.plan.brand,'Velos');
});

test('explicit storyboard selections are validated before a project is proposed',()=>{const p=story('refine');delete p.shots[0].assetId;delete p.shots[0].afterAssetId;p.shots[0].selected=2;assert.throws(()=>composePlan(p,{assets,brief:'only 02 highlighted'}),/zero-based/);p.shots[0].selected=1;assert.ok(composePlan(p,{assets,brief:'only 02 highlighted'}).project);});

test('Motion default stays on Gemini 3.8 independently of legacy autopilot settings',t=>{const {motionModel,providerHeaders,generationOptions}=require('../Questera-Backend/motion/provider.cjs');const oldMotion=process.env.MOTION_LLM_MODEL,oldAgent=process.env.AUTOPILOT_LLM_MODEL;t.after(()=>{if(oldMotion===undefined)delete process.env.MOTION_LLM_MODEL;else process.env.MOTION_LLM_MODEL=oldMotion;if(oldAgent===undefined)delete process.env.AUTOPILOT_LLM_MODEL;else process.env.AUTOPILOT_LLM_MODEL=oldAgent;});delete process.env.MOTION_LLM_MODEL;process.env.AUTOPILOT_LLM_MODEL='legacy-model';assert.equal(motionModel(),'google/gemini-3.8-flash');assert.equal(providerHeaders()['X-Title'],'Greta');assert.equal(generationOptions(motionModel(),4500).reasoning.effort,'high');process.env.MOTION_LLM_MODEL='explicit-model';assert.equal(motionModel(),'explicit-model');});

test('unprovided turnaround promises fail creative validation',()=>{const p=story('poster');p.shots[0].detail='Create an ad in seconds';assert.throws(()=>composePlan(p,{assets}),/turnaround promise/);assert.ok(composePlan(p,{assets,brief:'Create an ad in seconds'}).project);p.shots[0].detail='Custom scenes emerge instantly.';assert.throws(()=>composePlan(p,{assets}),/turnaround promise/);});
