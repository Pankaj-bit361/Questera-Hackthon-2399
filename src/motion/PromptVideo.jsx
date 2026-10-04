import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,Check,Download,Film,Loader2,Play,Sparkles,X} from 'lucide-react';
import {request} from './api';

const STAGES={queued:'Waiting for a worker',designing:'Designing your motion',previewing:'Creating preview frames',reviewing:'Reviewing the composition',repairing:'Refining the animation',rendering:'Rendering your video',completed:'Your video is ready'};
const active=v=>['queued','processing','admitting'].includes(v?.status);
const EXAMPLES=[
 {name:'Velos launch',prompt:'Create a 15-second motion graphics ad for Velos. Open with “Your idea. In motion.” Show an abstract idea becoming a flowing, beautifully animated composition, then transforming into landscape, square and portrait frames. Use large kinetic typography, mint, violet and warm white on deep charcoal. End with “Create your next video with Velos”, held clearly for two seconds. Use original beat-matched instrumental music. No fake statistics, URLs or product screenshots.'},
 {name:'Kinetic typography',prompt:'Make a bold kinetic typography film about creative momentum. Start with “One spark.” Build into “A thousand possibilities.” Use cascading letter reveals, flowing particles and an unexpected light-to-dark transition. Warm white, electric orange and ink black. Finish with “Make it move.” Give the ending room to breathe.'},
 {name:'Product announcement',prompt:'Create a premium motion announcement for a fictional design tool called Orbit. Build the opening from a single circle into a dynamic constellation, introduce “A new space for ideas”, and finish on the Orbit wordmark. Restrained cyan and white on midnight blue, fluid movement, precise typography and an uplifting instrumental score. No statistics or URLs.'}
];

export default function PromptVideo(){
 const [params,setParams]=useSearchParams();const selectedId=params.get('video');
 const [videos,setVideos]=useState([]),[status,setStatus]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [prompt,setPrompt]=useState(''),[format,setFormat]=useState('landscape'),[duration,setDuration]=useState(15),[music,setMusic]=useState('generated');
 const pending=useRef(null),text=useRef(null);
 const refresh=useCallback(async()=>{try{const [v,s]=await Promise.all([request('/videos'),request('/status')]);setVideos(v.videos);setStatus(s);return v.videos;}catch(e){setError(e.message);return [];}finally{setLoading(false);}},[]);
 useEffect(()=>{refresh();const focus=()=>refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 const working=videos.some(active);useEffect(()=>{const timer=setInterval(refresh,working?3500:60000);return()=>clearInterval(timer);},[refresh,working]);
 const selected=videos.find(v=>v.id===selectedId)||videos[0];
 const aiRemaining=status?Math.max(0,status.dailyDesignLimit-status.designs):0;
 const canCreate=status?.aiConfigured&&status?.promptVideo?.available&&aiRemaining>0&&status.remainingSeconds>=duration&&!working&&!busy;
 const generate=async e=>{e.preventDefault();if(!prompt.trim()||!canCreate)return;setBusy(true);setError('');const body={brief:prompt.trim(),format,duration,music};const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  try{const video=await request('/videos','POST',{...body,requestId:pending.current.id});pending.current=null;setVideos(v=>[video,...v.filter(item=>item.id!==video.id)]);setParams({video:video.id});await refresh();}
  catch(e){setError(e.message);await refresh();}finally{setBusy(false);}
 };
 const cancel=async video=>{try{await request(`/exports/${video.id}/cancel`,'POST');await refresh();}catch(e){setError(e.message);}};
 const reuse=video=>{setPrompt(video.prompt);setFormat(video.format);setDuration(video.duration);setMusic(video.music);text.current?.focus();};
 const retry=async video=>{setBusy(true);try{const next=await request(`/exports/${video.id}/retry`,'POST');setVideos(v=>v.map(item=>item.id===next.id?next:item));await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <main className="ms-app ms-prompt-video">
  <header className="ms-topbar"><Link to="/motion" className="ms-brand"><img src="/velos-logo.svg" alt=""/>Velos<span>Motion Studio</span></Link><Link to="/motion" className="ms-link"><ArrowLeft size={14}/>Layer editor</Link></header>
  <div className="pv-body">
   <div className="pv-heading"><div className="ms-eyebrow">FROM WORDS TO MOTION</div><h1>Describe it.<br/><span>Watch it come alive.</span></h1><p>Your idea becomes an original motion graphic, with animation and music made for the story.</p></div>
   {error&&<div className="ms-error" role="alert"><span>{error}</span><button className="ms-icon" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
   <div className="pv-workspace">
    <form className="pv-composer" onSubmit={generate}>
     <label className="pv-prompt-label" htmlFor="video-prompt"><Sparkles size={17}/>What do you want to create?</label>
     <textarea id="video-prompt" ref={text} value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={4000} rows={9} placeholder="A bold 15-second launch film for Velos. An idea transforms into flowing particles, then into three video formats. Mint and violet on charcoal. End with ‘Make it move.’" required/>
     <div className="pv-prompt-count">{prompt.length} / 4,000</div>
     <div className="pv-examples">{EXAMPLES.map(example=><button type="button" className="ms-secondary" key={example.name} onClick={()=>{setPrompt(example.prompt);text.current?.focus();}}>{example.name}<ArrowRight size={12}/></button>)}</div>
     <div className="pv-options"><label>Format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="landscape">Landscape · 16:9</option><option value="portrait">Portrait · 9:16</option><option value="square">Square · 1:1</option></select></label><label>Length<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[5,10,15,20,25,30].map(n=><option value={n} key={n}>{n} seconds</option>)}</select></label><label>Sound<select value={music} onChange={e=>setMusic(e.target.value)}><option value="generated">Original instrumental</option><option value="silent">Silent</option></select></label></div>
     <button className="ms-primary pv-generate" type="submit" disabled={!canCreate||!prompt.trim()}>{busy||working?<Loader2 size={17} className="ms-spin"/>:<Sparkles size={17}/>} {working?'Creating your video…':'Generate video'}<ArrowRight size={16}/></button>
     <p className="ms-subtle">{loading?'Connecting to your workspace…':!status?.aiConfigured?'AI generation is unavailable.':!status?.promptVideo?.available?'Video rendering is currently unavailable.':aiRemaining===0?'Daily AI allowance reached. Your previous videos are still available.':status.remainingSeconds<duration?'There is not enough render allowance for this length.':`${aiRemaining} AI operations · ${status.remainingSeconds}s rendering available`}</p>
    </form>
    <section className="pv-preview" aria-label="Video preview">
     {selected?.status==='completed'?<><div className="pv-video-wrap"><video key={selected.id} controls playsInline preload="metadata" poster={selected.poster} src={`${selected.url}&inline=1`} aria-label={selected.title}/></div><div className="pv-result-heading"><div><h2>{selected.title}</h2><span>{selected.duration}s · {selected.format} · 30 FPS</span></div><a className="ms-primary" href={selected.url} download><Download size={15}/>MP4</a></div>{selected.review&&<div className="pv-review"><Check size={15}/><div><strong>Preview review passed</strong><p>{selected.review.summary}</p><small>Sampled frames reviewed; the full video and soundtrack still need your review.</small></div></div>}</>
      :active(selected)?<div className="pv-progress" role="status" aria-live="polite"><div className="pv-orbit"><Sparkles size={30}/></div><h2>{STAGES[selected.stage]||'Creating your video'}</h2><p>Designing, checking and rendering your idea.</p><progress aria-label="Video creation progress" max={100} value={selected.progress||0}/><span>{selected.progress||0}%</span><button className="ms-secondary" onClick={()=>cancel(selected)}>Cancel</button></div>
      :selected?<div className="pv-progress"><Film size={38}/><h2>{selected.status==='cancelled'?'Creation cancelled':'This video needs another pass'}</h2><p>{selected.error||'Adjust your prompt and try a new version.'}</p><button className="ms-secondary" onClick={()=>reuse(selected)}>Use this prompt</button>{selected.canRetry&&<button className="ms-secondary" onClick={()=>retry(selected)} disabled={busy}>Retry rendering</button>}</div>
      :<div className="pv-progress pv-empty"><div className="pv-orbit"><Play size={30}/></div><h2>A little imagination.<br/>A lot of movement.</h2><p>Describe the message, visual style and ending.<br/>Your finished video will appear here.</p><span className="pv-empty-tag">KINETIC TYPE · PARTICLES · SHAPES · DATA</span></div>}
    </section>
   </div>
   <section className="pv-history"><div className="ms-section-head"><h2>Your videos <span className="ms-count">{videos.length}</span></h2><span>Saved in your private workspace</span></div>{videos.length?<div className="pv-history-grid">{videos.map(video=><button className={`pv-history-card ${selected?.id===video.id?'selected':''}`} key={video.id} onClick={()=>setParams({video:video.id})}>{video.poster?<img src={video.poster} alt=""/>:<div className="pv-history-placeholder">{active(video)?<Loader2 className="ms-spin" size={22}/>:<Film size={22}/>}</div>}<div><strong>{video.title}</strong><span>{video.duration}s · {video.format} · {video.status}</span></div></button>)}</div>:<p className="ms-subtle">Your first video starts with a prompt.</p>}</section>
  </div>
 </main>;
}
