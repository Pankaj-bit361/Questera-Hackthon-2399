import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, Img, OffthreadVideo, Html5Audio, useCurrentFrame, useVideoConfig, interpolate, Easing, staticFile, delayRender, continueRender, cancelRender} from 'remotion';
import {offsetsOf, durationOf} from '../../motion/schema.mjs';
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
const ease={...clamp,easing:Easing.bezier(.16,1,.3,1)};
function Fonts({children}){
 const [ready,setReady]=useState(false);
 const [handle]=useState(()=>delayRender('Loading motion font'));
 useEffect(()=>{let live=true;const font=new FontFace('MotionSans',`url(${staticFile('fonts/MotionSans.ttf')})`);font.load().then(f=>{document.fonts.add(f);if(live){setReady(true);continueRender(handle);}}).catch(e=>{if(live)cancelRender(e);});return()=>{live=false;continueRender(handle);};},[handle]);
 return ready?children:null;
}
function property(l,frame,key,fallback){ const points=l.keyframes.filter(k=>k[key]!==undefined); if(!points.length)return fallback; const xs=[0,...points.filter(k=>k.frame>0).map(k=>k.frame)]; const ys=[points[0].frame===0?points[0][key]:fallback,...points.filter(k=>k.frame>0).map(k=>k[key])];return xs.length===1?ys[0]:interpolate(frame,xs,ys,{...clamp,easing:l.easing==='linear'?Easing.linear:l.easing==='smooth'?Easing.inOut(Easing.cubic):ease.easing}); }
function fittedSize(l,width,height,unit){
 if(l.type!=='text')return l.fontSize*unit;
 const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return l.fontSize*unit;
 const fits=size=>{ctx.font=`700 ${size}px MotionSans`;let count=0;for(const paragraph of l.text.split('\n')){let line='';count++;for(const word of paragraph.split(/\s+/)){const next=line?`${line} ${word}`:word;const measure=s=>ctx.measureText(s).width+Math.max(0,(l.tracking??-.045))*size*Math.max(0,s.length-1);if(measure(next)>l.width*width*.98&&line){count++;line=word;}else line=next;if(measure(word)>l.width*width*.98)return false;}}return count*size*1.08<=l.height*height;};
 let size=l.fontSize*unit;while(size>12*unit&&!fits(size))size*=.95;return size;
}
function AnimatedText({layer:l,frame}){
 if(!l.textAnimation||l.textAnimation==='block')return l.text;
 const lines=l.textAnimation==='lines',parts=lines?l.text.split('\n'):l.text.split(/(\s+)/);let index=0;
 return parts.map((part,i)=>{if(!lines&&/^\s+$/.test(part))return part;const p=interpolate(frame-l.delay-index++*(l.stagger??2),[0,l.entranceDuration??12],[0,1],ease);return <span key={i} style={{display:lines?'block':'inline-block',overflow:lines?'hidden':undefined}}><span style={{display:'inline-block',opacity:p,transform:`translateY(${(1-p)*.9}em) rotate(${lines?0:(1-p)*-5}deg)`,transformOrigin:'left bottom'}}>{part}</span></span>;});
}
function Layer({layer:l,scene,urls}){
 const frame=useCurrentFrame(),{width,height}=useVideoConfig();const unit=Math.min(width,height)/1080;
 const p=interpolate(frame-l.delay,[0,l.entranceDuration??24],[0,1],ease);const end=l.end??scene.duration;const exit=l.exitDuration??12;const out=exit===0?1:interpolate(frame,[Math.max(l.delay,end-exit),end],[1,0],clamp);
 let dx=0,dy=0,scale=1,opacity=l.opacity,clipPath;
 if(l.animation!=='none')opacity*=p;
 if(l.animation==='rise')dy=(1-p)*55*unit;
 if(l.animation==='slide')dx=(1-p)*-65*unit;
 if(l.animation==='scale')scale=.8+p*.2;
 if(l.animation==='float')dy=Math.sin((frame-l.delay)/35)*8*unit;
 if(l.animation==='reveal')clipPath=`inset(0 ${(1-p)*100}% 0 0)`;
 const x=property(l,frame,'x',l.x),y=property(l,frame,'y',l.y);
 const style={position:'absolute',left:x*width,top:y*height,width:l.width*width,height:l.height*height,opacity:(frame<l.delay||frame>=end)?0:property(l,frame,'opacity',opacity)*out,
 transform:`translate(${dx}px,${dy}px) rotate(${property(l,frame,'rotate',l.rotation)}deg) scale(${property(l,frame,'scale',scale)})`,transformOrigin:'center',clipPath,color:l.color};
 let contents=null;
 if(l.strokeWidth){style.border=`${l.strokeWidth*unit}px solid ${l.strokeColor||l.color}`;style.boxSizing='border-box';}
 if(l.shadow==='soft')style.boxShadow=`0 ${24*unit}px ${70*unit}px #00000040`;if(l.shadow==='glow')style.boxShadow=`0 0 ${90*unit}px ${l.color}55`;
 if(l.type==='text'||l.type==='counter')contents=<div style={{fontSize:fittedSize(l,width,height,unit),fontFamily:'MotionSans, sans-serif',fontWeight:700,lineHeight:1.08,letterSpacing:`${l.tracking??-.045}em`,textAlign:l.align,whiteSpace:'pre-wrap',overflowWrap:'break-word'}}>{l.type==='counter'?Math.round((l.values[0]||100)*p).toLocaleString('en-US'):<AnimatedText layer={l} frame={frame}/>}</div>;
 if(l.type==='circle'){const diameter=Math.min(l.width*width,l.height*height);style.width=diameter;style.height=diameter;}
 if(l.type==='rect'||l.type==='circle')style.background=l.filled===false?'transparent':l.color,style.borderRadius=l.type==='circle'?'50%':l.radius*unit;
 const mediaStyle={width:'100%',height:'100%',objectFit:l.fit,transform:`translate(${property(l,frame,'panX',l.panX??0)*100}%,${property(l,frame,'panY',l.panY??0)*100}%) scale(${property(l,frame,'zoom',l.zoom??1)})`};
 if(['image','video'].includes(l.type)){style.overflow='hidden';style.borderRadius=l.radius*unit;}
 if(l.type==='image'&&urls[l.assetId])contents=<Img src={urls[l.assetId]} style={mediaStyle}/>;
 if(l.type==='video'&&urls[l.assetId])contents=<OffthreadVideo src={urls[l.assetId]} muted style={mediaStyle}/>;
 if(l.type==='chart')contents=<div style={{display:'flex',gap:18*unit,height:'100%',alignItems:'flex-end'}}>{l.values.map((v,i)=><div key={i} style={{flex:1,background:l.color,borderRadius:`${10*unit}px ${10*unit}px 0 0`,height:`${v/Math.max(1,...l.values)*100*p}%`,minHeight:2,position:'relative'}}><span style={{position:'absolute',top:-38*unit,width:'100%',textAlign:'center',fontSize:24*unit}}>{Math.round(v*p)}</span></div>)}</div>;
 return <div style={style}>{contents}</div>;
}
function Scene({scene,urls}){
 const frame=useCurrentFrame();const enter=scene.transition==='cut'?1:interpolate(frame,[0,12],[0,1],clamp);
 const bg=scene.pattern==='glow'?`radial-gradient(ellipse at 85% 40%, ${scene.accent}26, transparent 62%)`:scene.pattern==='grid'?`linear-gradient(${scene.accent}12 1px,transparent 1px),linear-gradient(90deg,${scene.accent}12 1px,transparent 1px)`:scene.pattern==='dots'?`radial-gradient(${scene.accent}50 1px,transparent 1px)`:'none';
 return <AbsoluteFill style={{backgroundColor:scene.background,opacity:enter,overflow:'hidden',backgroundImage:bg,backgroundSize:scene.pattern==='grid'?'80px 80px':scene.pattern==='dots'?'28px 28px':undefined,clipPath:scene.transition==='wipe'?`inset(0 ${(1-enter)*100}% 0 0)`:undefined}}>{scene.layers.map(l=><Layer key={l.id} layer={l} scene={scene} urls={urls}/>)}</AbsoluteFill>;
}
export default function MotionComposition({project,urls={}}){
 const offsets=offsetsOf(project);
 return <AbsoluteFill style={{background:project.scenes[0].background,fontFamily:'MotionSans, sans-serif',fontWeight:700}}><Fonts>{project.scenes.map((scene,i)=><Sequence key={scene.id} from={offsets[i]} durationInFrames={scene.duration}><Scene scene={scene} urls={urls}/></Sequence>)}
 {project.audio.map(track=>urls[track.assetId]&&<Sequence key={track.id} from={track.start} durationInFrames={track.duration}><Html5Audio src={urls[track.assetId]} trimBefore={track.trim} trimAfter={track.trim+track.duration} volume={f=>track.volume*Math.min(1,track.fade?f/track.fade:1,track.fade?(track.duration-f)/track.fade:1)}/></Sequence>)}
 </Fonts></AbsoluteFill>;
}
