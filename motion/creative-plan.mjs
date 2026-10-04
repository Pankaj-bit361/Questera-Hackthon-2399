import {z} from 'zod';
import {FORMATS,ProjectSchema,newLayer} from './schema.mjs';
import {designIssues,turnaroundClaims} from './design-quality.mjs';
export const DIRECTIONS=['editorial','kinetic','workflow','orbit','spotlight','formats','collage','ribbon'];
export const LAYOUTS={
 poster:'Oversized editorial headline and a dimensional orbit graphic; asymmetrical on wide canvases.',
 kinetic:'Staggered words, contrasting scale and directional type blocks. Text is the moving graphic.',
 workflow:'A spatial journey between Brief, Scenes and MP4 cards with a traveling focus marker.',
 editor:'An actual supplied product image in a framed close-up. Requires an image assetId.',
 refine:'Three scene cards, only the chosen card changes. Or a real image before/after when both assets are supplied.',
 formats:'Physical portrait, landscape and square canvases in one animated arrangement.',
 orbit:'A supplied logo or brand name, surrounded by precision rings and orbiting points.',
 collage:'An arrangement of graphic cards, type fragments and a central product message.',
 ribbon:'Large moving diagonal type ribbons, anchored by a separate readable foreground headline.',
 close:'A clear branded closing invitation with a readable CTA and restrained finishing motion.',
};
const hex=z.string().regex(/^#[\da-f]{6}$/i),asset=z.string().regex(/^[\w-]{1,100}$/).nullable();
export const CreativePlanSchema=z.object({version:z.literal(1),title:z.string().min(1).max(100),brand:z.string().min(1).max(28),direction:z.enum(DIRECTIONS),descriptor:z.string().max(24).default(''),seconds:z.number().min(5).max(60),
 palette:z.object({paper:hex,ink:hex,accent:hex,pop:hex}).strict(),logoAssetId:asset.default(null),
 shots:z.array(z.object({layout:z.enum(Object.keys(LAYOUTS)),name:z.string().min(1).max(80),weight:z.number().min(.5).max(8),headline:z.string().min(1).max(80),label:z.string().max(40).default(''),detail:z.string().max(100).default(''),words:z.array(z.string().min(1).max(24)).max(3).default([]),assetId:asset.default(null),afterAssetId:asset.default(null),selected:z.number().int().min(0).max(2).default(1),focus:z.enum(['left','center','right']).default('center')}).strict()).min(3).max(8),
}).strict();
export function contrastRatio(a,b){const light=c=>{const channels=c.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};const x=light(a),y=light(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function planIssues(plan,{brief='',assets=[]}={}){
 const byId=new Map(assets.map(a=>[a.id,a])),issues=[];if(contrastRatio(plan.palette.paper,plan.palette.ink)<7)issues.push('Paper and ink need at least 7:1 contrast for supporting copy.');
 const image=id=>id&&byId.get(id)?.kind==='image';
 if(plan.logoAssetId&&!image(plan.logoAssetId))issues.push('The logo must refer to a supplied image.');
 for(const shot of plan.shots){if(shot.layout==='editor'&&!image(shot.assetId))issues.push(`The ${shot.name} editor shot requires a supplied image; choose a geometric layout if none is available.`);if(shot.assetId&&!image(shot.assetId))issues.push(`Unknown image in ${shot.name}.`);if(shot.afterAssetId&&(!image(shot.afterAssetId)||!image(shot.assetId)))issues.push('A before/after requires two actual supplied images.');}
 if(plan.shots.at(-1).headline.length>32)issues.push('Keep the final invitation at most 32 characters so the CTA stays readable.');
 if(plan.shots.at(-1).layout!=='close')issues.push('End with the close layout and a readable invitation.');
 const requestedCard=brief.match(/only\s+(?:(?:scene|card)\s+)?0?([123])\s+(?:highlighted|selected)/i);if(requestedCard&&plan.shots.some(s=>s.layout==='refine'&&!s.assetId&&s.selected!==Number(requestedCard[1])-1))issues.push(`The brief selects card 0${requestedCard[1]}; selected is zero-based, so use ${Number(requestedCard[1])-1}.`);
 const all=[plan.title,plan.brand,...plan.shots.flatMap(s=>[s.headline,s.detail,s.label,...s.words])].join(' ');
 for(const claim of turnaroundClaims(all))if(!brief.toLowerCase().includes(claim.toLowerCase()))issues.push(`Do not invent turnaround promise ${claim}.`);
 const claims=all.match(/(?:\d+(?:\.\d+)?\s*(?:%|x\b|times\b)|[$₹€£]\s*\d+)/gi)||[];for(const claim of claims)if(!brief.toLowerCase().includes(claim.toLowerCase()))issues.push(`Do not invent numerical claim ${claim}.`);
 const numericLabel=all.match(/\b\d+\s*(?:users|customers|sales|conversions|followers|views|downloads)\b/gi)||[];for(const claim of numericLabel)if(!brief.toLowerCase().includes(claim.toLowerCase()))issues.push(`Do not invent claim ${claim}.`);
 return [...new Set(issues)];
}
function durations(shots,total){
 const mins=shots.map((s,i)=>i===shots.length-1?84:30);if(total<mins.reduce((a,b)=>a+b,0))throw Error('The duration is too short for this shot count and a readable closing.');
 const caps=shots.map((s,i)=>i===shots.length-1?108:600);const frames=[...mins];let extra=total-frames.reduce((a,b)=>a+b,0);const weights=shots.map(s=>s.weight);while(extra){const eligible=frames.map((n,i)=>n<caps[i]?i:null).filter(i=>i!==null);if(!eligible.length)throw Error('The shot count cannot hold the requested duration.');const weight=eligible.reduce((sum,i)=>sum+weights[i],0);const additions=eligible.map(i=>({i,exact:extra*weights[i]/weight}));let used=0;for(const a of additions){const n=Math.min(caps[a.i]-frames[a.i],Math.floor(a.exact));frames[a.i]+=n;used+=n;}extra-=used;if(!used||extra<eligible.length){for(const a of additions.sort((a,b)=>(b.exact%1)-(a.exact%1))){if(extra&&frames[a.i]<caps[a.i]){frames[a.i]++;extra--;}}}}
 return frames;
}
export function composePlan(raw,{format='landscape',brief='',assets=[],seconds}={}){
 const plan=CreativePlanSchema.parse(raw);if(seconds!==undefined)plan.seconds=seconds;const checks=planIssues(plan,{brief,assets});if(checks.length)throw Error(checks.join(' '));
 const [W,H]=FORMATS[format],U=Math.min(W,H),portrait=H>W,wide=W>H;
 const C=plan.palette;const on=bg=>contrastRatio(bg,C.paper)>=contrastRatio(bg,C.ink)?C.paper:C.ink;let serial=0;const lengths=durations(plan.shots,Math.round(plan.seconds*30));
 const layer=(type,name,x,y,w,h,opts={})=>newLayer(type,{id:`design-${++serial}`,name,x,y,width:w,height:h,animation:'none',entranceDuration:12,exitDuration:0,radius:0,...opts});
 const T=(name,text,x,y,w,h,size,color,opts={})=>layer('text',name,x,y,w,h,{text,fontSize:size,color,tracking:-.05,...opts});
 const R=(name,x,y,w,h,color,opts={})=>layer('rect',name,x,y,w,h,{color,...opts});
 const D=(name,cx,cy,diam,color,opts={})=>layer('circle',name,cx-diam*U/W/2,cy-diam*U/H/2,diam*U/W,diam*U/H,{color,...opts});
 const I=(name,id,x,y,w,h,opts={})=>layer('image',name,x,y,w,h,{assetId:id,fit:'contain',radius:24,...opts});
 const header=(fg,bg)=>{
 const icon=.055*U/W,iconH=.055*U/H;return [...(plan.logoAssetId?[R('Logo tile',.065,.045,icon,iconH,C.ink,{radius:10}),I('Supplied logo',plan.logoAssetId,.069,.048,icon-.008,iconH-.006)]:[]),T('Brand',plan.brand.toUpperCase(),plan.logoAssetId ? .065+icon+.016 : .07,.047,.55,.055,26,fg,{tracking:.08}),T('Brand descriptor',plan.descriptor,wide?.71:.55,.047,wide?.22:.38,.055,wide?22:20,fg,{align:'right',tracking:.08})];
 };
 const ring=(name,cx,cy,diam,color,thick,opts={})=>D(name,cx,cy,diam,color,{filled:false,strokeColor:color,strokeWidth:thick,...opts});
 const orbit=(name,cx,cy,diam,point,color,duration,phase=0)=>{const radius=diam*U/2,px=point*U/W/2,py=point*U/H/2;const frames=Array.from({length:25},(_,i)=>{const a=phase+i/24*Math.PI*2;return {frame:Math.round(i*(duration-1)/24),x:cx+Math.cos(a)*radius/W-px,y:cy+Math.sin(a)*radius/H-py};});return D(name,cx+radius/W,cy,point,color,{easing:'linear',keyframes:frames});};
 const wordsOf=s=>s.words.length?s.words:s.headline.split(/[\n.!]+/).filter(Boolean).slice(0,3);
 const scenes=plan.shots.map((s,index)=>{
 const d=lengths[index],last=d-1,dark=['workflow','orbit','formats','ribbon','close'].includes(s.layout),bg=dark?C.ink:C.paper,fg=dark?C.paper:C.ink;
 let ls=[];const label=s.label||plan.descriptor||plan.brand.toUpperCase();
 if(s.layout==='poster'){
  ls=[...header(fg,bg),T('Opening hook',s.headline,.065,wide?.22:.15,wide?.51:.87,wide?.57:portrait?.30:.32,wide?184:portrait?155:146,fg,{textAnimation:'lines',stagger:3}),
   ring('Primary ring',wide?.75:.5,wide?.5:portrait?.68:.70,wide?.56:portrait?.69:.36,C.accent,30,{shadow:'soft',keyframes:[{frame:0,scale:.65,opacity:.3},{frame:16,scale:1,opacity:1},{frame:last,scale:1.06}]}),
   ring('Secondary ring',wide?.75:.5,wide?.5:portrait?.68:.70,wide?.38:portrait?.5:.24,C.ink,2,{opacity:.45}),
   D('Inner pulse',wide?.75:.5,wide?.5:portrait?.68:.70,wide?.22:portrait?.29:.15,C.pop,{keyframes:[{frame:0,scale:.1},{frame:18,scale:1},{frame:last,scale:.86}]}),
   orbit('Moving spark',wide?.75:.5,wide?.5:portrait?.68:.70,wide?.56:portrait?.69:.36,.065,C.ink,d),
   R('Signature stroke',wide?.62:.34,wide?.49:portrait?.67:.69,wide?.25:.32,.007,C.accent,{rotation:-30,keyframes:[{frame:0,rotate:-80,scale:.3},{frame:20,rotate:-30,scale:1},{frame:last,rotate:35}]}),
   T('Opening label',label,.07,.895,.84,.055,28,fg,{tracking:.08}),
  ];
 }else if(s.layout==='kinetic'){
  const words=wordsOf(s);const accentFirst=plan.direction==='kinetic'||plan.direction==='ribbon';
  const space=portrait?.18:wide?.20:.22,y0=portrait?.23:wide?.21:.18;
  ls=[...header(C.ink,C.paper),...words.flatMap((word,i)=>{const y=y0+i*space;return [R(`Word block ${i+1}`,.055,y-.015,.89,space-.025,i%2?C.accent:C.ink,{radius:8,keyframes:[{frame:0,x:i%2?1.1:-1},{frame:10+i*4,x:.055},{frame:last,x:.055}],shadow:'soft'}),T(`Kinetic word ${i+1}`,word.toUpperCase(),.085,y+.012,.83,space-.04,wide?158:portrait?140:146,i%2?on(C.accent):C.pop,{delay:i*4,textAnimation:'words',stagger:1,keyframes:[{frame:0,opacity:0},{frame:14+i*4,opacity:1}],tracking:-.055})];}),
   T('Kinetic caption',s.detail||label,.07,.895,.86,.06,wide?31:28,C.ink,{tracking:.035}),D('Kinetic corner spark',.88,.13,.05,accentFirst?C.accent:C.pop,{easing:'linear',keyframes:[{frame:0,rotate:0},{frame:last,rotate:180}]}),
  ];
 }else if(s.layout==='workflow'){
  const ys=portrait?[.40,.56,.72]:[.53,.53,.53],xs=portrait?[.15,.15,.15]:[.07,.375,.68],cw=portrait?.70:.25,ch=portrait?.12:.25;
  ls=[...header(fg,bg),T('Workflow headline',s.headline,.07,.14,.86,portrait?.2:.23,wide?125:portrait?112:110,fg,{textAnimation:'words'}),
   ...['BRIEF','SCENES','MP4'].flatMap((name,i)=>[
    R(`Workflow card ${i+1}`,xs[i],ys[i],cw,ch,i===1?C.accent:'#24232b',{radius:26,strokeWidth:2,strokeColor:i===1?C.accent:'#48454f',shadow:'soft',keyframes:[{frame:0,scale:.6,opacity:0},{frame:12+i*5,scale:1,opacity:1}]}),
    T(`Workflow number ${i+1}`,`0${i+1}`,xs[i]+.022,ys[i]+.014,cw-.044,ch*.23,26,i===1?on(C.accent):C.pop,{delay:i*5,tracking:.08}),
    T(`Workflow label ${i+1}`,name,xs[i]+.022,ys[i]+ch*.35,cw-.044,ch*.43,wide?56:portrait?68:48,i===1?on(C.accent):C.paper,{delay:i*5}),
   ]),
   ...(portrait?[R('Travel rail',.085,.40,.01,.45,C.paper,{opacity:.4})]:[R('Travel rail',.07,.845,.86,.007,C.paper,{opacity:.4})]),
   D('Moving focus',portrait?.088:.10,portrait?.43:.848,.042,C.pop,{shadow:'glow',easing:'smooth',keyframes:portrait?[{frame:0,y:.40},{frame:Math.floor(d*.4),y:.56},{frame:last,y:.75}]:[{frame:0,x:.07},{frame:Math.floor(d*.4),x:.46},{frame:last,x:.87}]}),
   T('Workflow annotation',s.detail||label,.07,.925,.87,.045,24,C.paper,{tracking:.04}),
  ];
 }else if(s.layout==='editor'){
  const x=.065,y=portrait?.39:.34,w=.87,h=portrait?.47:.54;
  ls=[...header(fg,bg),T('Product headline',s.headline,.07,.145,.86,portrait?.2:.16,wide?106:portrait?118:94,fg,{textAnimation:'words'}),
   R('Product frame',x,y,w,h,C.ink,{radius:24,shadow:'soft',strokeColor:C.accent,strokeWidth:2}),
   I('Actual product screen',s.assetId,x,y,w,h,{radius:24,keyframes:[{frame:0,zoom:portrait?1.8:1.15,panX:portrait?(s.focus==='left'?.42:s.focus==='right'?-.42:0):0,panY:0},{frame:Math.floor(d*.3),zoom:portrait?1.8:1.15},{frame:last,zoom:portrait?2.1:1.55,panX:portrait?(s.focus==='left'?.57:s.focus==='right'?-.57:0):(s.focus==='left'?.15:s.focus==='right'?-.14:0),panY:-.15}]}),
   T('Product caption',s.detail||label,.07,.925,.86,.045,24,fg,{tracking:.03}),
  ];
 }else if(s.layout==='refine'){
  ls=[...header(fg,bg),T('Refinement headline',s.headline,.07,.15,.86,portrait?.21:.18,wide?110:portrait?118:100,fg,{textAnimation:'words'})];
  if(s.assetId&&s.afterAssetId){
   const y=portrait?.43:.38,h=portrait?.42:.51,x=.065,w=.87,swap=Math.floor(d*.43);const cam=[{frame:0,zoom:portrait?2:1.55,panX:portrait?-.5:-.11,panY:-.04},{frame:swap,zoom:portrait?2:1.55,panX:portrait?-.5:-.11,panY:-.04},{frame:last,zoom:portrait?1.8:1.3,panX:portrait?-.4:-.04,panY:-.02}];
   ls.push(R('Refinement frame',x,y,w,h,C.ink,{radius:24,shadow:'soft'}),I('Actual before edit',s.assetId,x,y,w,h,{end:swap,keyframes:cam}),I('Actual after edit',s.afterAssetId,x,y,w,h,{delay:swap,keyframes:cam}),T('Change annotation',s.detail||'YOUR WORDS. YOUR STORY.',.07,.925,.86,.045,24,fg,{tracking:.06}));
  }else{
   const y=portrait?.43:.43,cw=portrait?.255:.26,ch=portrait?.28:.35,xs=portrait?[.065,.373,.681]:[.065,.37,.675],selected=s.selected;
   ls.push(...xs.flatMap((x,i)=>[R(`Scene card ${i+1}`,x,y,cw,ch,i===selected?C.accent:C.ink,{radius:20,shadow:'soft',strokeWidth:i===selected?4:1,strokeColor:i===selected?C.pop:'#55525c',keyframes:[{frame:0,scale:.88},{frame:15,scale:1},{frame:last,scale:i===selected?1.03:1}]}),
    T(`Scene number ${i+1}`,`0${i+1}`,x+.025,y+.025,cw-.05,.07,wide?55:40,C.paper),
    R(`Scene accent ${i+1}`,x+.035,y+ch*.46,cw-.07,.015,i===selected?C.pop:C.accent,{animation:'reveal',delay:8}),
    T(`Scene status ${i+1}`,i===selected?'REFINE':'KEEP',x+.025,y+ch*.70,cw-.05,.06,wide?32:24,C.paper,{tracking:.08}),
   ]),D('Focus cursor',xs[selected]+cw*.8,y+ch*.82,.065,C.pop,{easing:'smooth',keyframes:[{frame:0,x:.9,y:.90},{frame:Math.floor(d*.3),x:xs[selected]+cw*.8,y:y+ch*.78},{frame:last,x:xs[selected]+cw*.75,y:y+ch*.73}]}),T('Refine controls',s.detail||'TEXT  /  COLOR  /  TIMING',.07,.88,.86,.10,wide?42:32,C.ink,{tracking:.02}));
  }
 }else if(s.layout==='formats'){
  ls=[...header(fg,bg),T('Format headline',s.headline,.07,.15,.86,portrait?.20:.18,wide?116:portrait?120:100,fg,{textAnimation:'words'})];
  const base=wide?650:portrait?720:440,shapes=[{x:wide?.12:.07,y:portrait?.43:.45,w:base*.36/W,h:base*.64/H,color:C.accent,name:'9:16'},{x:wide?.40:portrait?.43:.405,y:portrait?.50:.51,w:base*.64/W,h:base*.36/H,color:C.paper,name:'16:9'},{x:wide?.74:portrait?.50:.665,y:portrait?.73:.68,w:base*.36/W,h:base*.36/H,color:C.pop,name:'1:1'}];
  ls.push(...shapes.flatMap((shape,i)=>{const angle=[-8,5,-5][i];return [R(`Format ${shape.name}`,shape.x,shape.y,shape.w,shape.h,shape.color,{radius:20,shadow:'soft',rotation:angle,keyframes:[{frame:0,scale:0,rotate:angle*2},{frame:18+i*5,scale:1,rotate:angle},{frame:last,rotate:angle/2}]}),
   ...(plan.logoAssetId?[R(`Brand tile ${shape.name}`,shape.x+shape.w*.20,shape.y+shape.h*.20,shape.w*.60,shape.h*.60,C.ink,{radius:12,rotation:angle,delay:10+i*5}),I(`Brand in ${shape.name}`,plan.logoAssetId,shape.x+shape.w*.25,shape.y+shape.h*.25,shape.w*.5,shape.h*.5,{rotation:angle,delay:10+i*5})]:[D(`Format point ${shape.name}`,shape.x+shape.w*.5,shape.y+shape.h*.5,.05,shape.color===C.ink?C.paper:C.ink,{delay:10+i*5})]),
   T(`Format label ${shape.name}`,shape.name,shape.x,shape.y+shape.h+.025,shape.w,.055,wide?27:24,C.paper,{align:'center',tracking:.05,delay:10+i*5}),
  ];}));
  if(!portrait)ls.push(T('Format caption',s.detail||'PORTRAIT  /  LANDSCAPE  /  SQUARE',.07,.94,.86,.045,wide?28:24,C.paper,{tracking:.02}));
 }else if(s.layout==='orbit'){
  const cx=.5,cy=portrait?.55:wide?.57:.57,diam=wide?.62:portrait?.72:.50;
  ls=[...header(fg,bg),ring('Outer precision ring',cx,cy,diam,C.accent,2,{opacity:.75}),ring('Inner precision ring',cx,cy,diam*.77,C.pop,1,{opacity:.6}),D('Logo stage',cx,cy,diam*.6,C.accent,{shadow:'glow',keyframes:[{frame:0,scale:.1},{frame:20,scale:1},{frame:last,scale:1.03}]}),orbit('Brand orbit one',cx,cy,diam,.055,C.pop,d),orbit('Brand orbit two',cx,cy,diam*.77,.035,C.paper,d,Math.PI),
   ...(plan.logoAssetId?[I('Actual brand mark',plan.logoAssetId,cx-diam*.19*U/W,cy-diam*.19*U/H,diam*.38*U/W,diam*.38*U/H,{animation:'scale',delay:8})]:[T('Brand at center',plan.brand,.2,cy-.07,.6,.14,wide?100:90,C.paper,{align:'center',delay:8,textAnimation:'words'})]),
   T('Brand reveal headline',s.headline,.07,portrait?.19:.15,.86,portrait?.17:.15,wide?84:portrait?100:80,C.paper,{align:'center',textAnimation:'lines'}),T('Brand reveal caption',s.detail||label,.1,.89,.8,.07,wide?32:28,C.paper,{align:'center',tracking:.045}),
  ];
 }else if(s.layout==='collage'){
  const cards=portrait?[{x:.09,y:.41,w:.55,h:.19,c:C.accent,r:-8},{x:.42,y:.53,w:.49,h:.18,c:C.ink,r:8},{x:.13,y:.69,w:.52,h:.15,c:C.pop,r:-4}]:[{x:.07,y:.49,w:.33,h:.24,c:C.accent,r:-8},{x:.40,y:.43,w:.32,h:.26,c:C.ink,r:7},{x:.67,y:.59,w:.26,h:.25,c:C.pop,r:-5}];
  ls=[...header(fg,bg),T('Collage headline',s.headline,.07,.15,.86,portrait?.22:.23,wide?120:portrait?128:100,C.ink,{textAnimation:'words'}),...cards.flatMap((card,i)=>[R(`Collage card ${i+1}`,card.x,card.y,card.w,card.h,card.c,{radius:18,rotation:card.r,shadow:'soft',keyframes:[{frame:0,scale:.5,rotate:card.r*3,opacity:0},{frame:16+i*5,scale:1,rotate:card.r,opacity:1},{frame:last,rotate:card.r/2}]}),
   T(`Collage word ${i+1}`,s.words[i]||['CREATE','REFINE','EXPORT'][i],card.x+.035,card.y+card.h*.30,card.w-.07,card.h*.40,wide?55:portrait?68:46,on(card.c),{align:'center',rotation:card.r,delay:6+i*5,textAnimation:'words',keyframes:[{frame:24,rotate:card.r},{frame:last,rotate:card.r/2}]}),
  ]),T('Collage annotation',s.detail||label,.07,.91,.86,.06,wide?30:26,C.ink,{tracking:.03})];
 }else if(s.layout==='ribbon'){
  const word=(s.words[0]||plan.brand).toUpperCase(),ribbonText=Array.from({length:word.length>9?2:3},()=>word).join('  /  '),rows=portrait?[.29,.47,.65]:[.23,.46,.69];
  ls=[...header(fg,bg),...rows.flatMap((y,i)=>[R(`Ribbon ${i+1}`,-.10,y,1.2,portrait?.14:.17,i===1?C.pop:C.accent,{rotation:i===1?9:-8,shadow:'soft'}),T(`Ribbon typography ${i+1}`,ribbonText,-.08,y+.01,1.6,portrait?.13:.16,wide?142:portrait?125:114,i===1?on(C.pop):on(C.accent),{decorative:true,rotation:i===1?9:-8,easing:'linear',keyframes:[{frame:0,x:i===1?-.5:-.1},{frame:last,x:i===1?-.1:-.5}],tracking:-.025})]),T('Ribbon foreground label',s.headline,.07,.88,.86,.085,wide?45:portrait?50:39,C.paper,{align:'center',textAnimation:'words'})];
 }else if(s.layout==='close'){
  const cy=portrait?.38:.39,logoSize=wide?.13:.15;
  ls=[...header(fg,bg),ring('Closing orbit',.5,portrait?.42:.48,wide?1.3:portrait?1.1:1.3,C.accent,1,{opacity:.24,keyframes:[{frame:0,scale:.9},{frame:last,scale:1.05}]}),
   ...(plan.logoAssetId?[I('Actual closing logo',plan.logoAssetId,wide?.25:.425,portrait?.24:wide?.29:.25,logoSize*U/W,logoSize*U/H,{animation:'scale',delay:0})]:[]),
   T('Closing brand',plan.brand.toLowerCase(),wide?.37:.08,portrait?.38:wide?.265:.41,wide?.48:.84,portrait?.13:.2,wide?184:portrait?155:155,C.paper,{align:wide?'left':'center',textAnimation:'words',delay:3}),
   T('Closing promise',s.detail||'Your ideas deserve motion.',.09,portrait?.56:wide?.53:.63,.82,portrait?.11:.12,wide?64:portrait?54:50,C.paper,{align:'center',textAnimation:'lines',delay:8}),
   R('Closing CTA',wide?.32:.15,portrait?.735:wide?.75:.80,wide?.36:.70,portrait?.066:.105,C.pop,{radius:52,shadow:'soft',animation:'scale',delay:10}),
   T('Closing invitation',s.headline,wide?.34:.17,portrait?.75:wide?.772:.825,wide?.32:.66,portrait?.046:.072,wide?42:portrait?39:36,C.ink,{align:'center',delay:10,animation:'scale'}),
   T('Closing signature',s.label||'CREATE  /  REFINE  /  EXPORT',.08,.92,.84,.045,24,C.paper,{align:'center',tracking:.05,delay:16}),
  ];
 }
 if(ls.length>25)throw Error(`The ${s.layout} recipe exceeded the editable layer limit.`);
 return {id:`shot-${index+1}`,name:s.name,duration:d,background:bg,accent:C.accent,pattern:'plain',transition:'cut',layers:ls};
 });
 const project=ProjectSchema.parse({schemaVersion:1,title:plan.title,format,fps:30,scenes,audio:[]});
 const issues=designIssues(project,{brief,assets});if(issues.length)throw Error(issues.join(' '));return {project,plan};
}
