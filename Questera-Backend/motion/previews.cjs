const path=require('node:path');const fs=require('node:fs/promises');const os=require('node:os');
const {bundle}=require('@remotion/bundler');const {selectComposition,renderStill,openBrowser}=require('@remotion/renderer');
let bundled;
const bundleURL=()=>bundled||(bundled=bundle({entryPoint:path.resolve(__dirname,'../../motion/entry.jsx'),publicDir:path.resolve(__dirname,'../../public')}).catch(e=>{bundled=null;throw e;}));
function previewSamples(project){let offset=0;const frames=[];for(const scene of project.scenes){for(const [sample,local] of [['opening',Math.min(8,scene.duration-1)],['action',Math.floor(scene.duration*.35)],['settled',Math.floor(scene.duration*.7)],['last-frame',scene.duration-1]])frames.push({sceneId:scene.id,scene:scene.name,frame:offset+local,sample});offset+=scene.duration;}return frames;}
async function renderPreviews({project,urls={},deadline}){
 const frames=previewSamples(project);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'velos-design-preview-'));let browser;
 try{const serveUrl=await bundleURL(),inputProps={project:{...project,audio:[]},urls},composition=await selectComposition({serveUrl,id:'VelosMotion',inputProps});browser=await openBrowser('chrome');
  const scale=Math.min(1,640/Math.max(composition.width,composition.height)),images=[];
  for(const sample of frames){const remaining=deadline?deadline-Date.now():60000;if(remaining<=0)throw Object.assign(new Error('Automatic preview timed out. Your saved project is safe.'),{status:504});const output=path.join(dir,`${sample.frame}.jpg`);await renderStill({serveUrl,composition,inputProps,frame:sample.frame,output,imageFormat:'jpeg',jpegQuality:80,scale,puppeteerInstance:browser,timeoutInMilliseconds:Math.min(60000,remaining)});images.push({...sample,dataUrl:`data:image/jpeg;base64,${(await fs.readFile(output)).toString('base64')}`});}
  return images;
 }finally{if(browser)await browser.close({silent:true});await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={renderPreviews,previewSamples};
