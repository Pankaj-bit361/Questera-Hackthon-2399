async function transcribe(buffer,mimeType){
 if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('Automatic captions are currently unavailable. Import a timed SRT file instead.'),{status:503});
 const form=new FormData();form.set('file',new Blob([buffer],{type:mimeType}),'voice.'+(mimeType.includes('wav')?'wav':mimeType.includes('ogg')?'ogg':mimeType.includes('mp4')?'m4a':'mp3'));form.set('model','whisper-1');form.set('response_format','verbose_json');form.append('timestamp_granularities[]','segment');
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(90000)});if(!response.ok)throw Object.assign(new Error('Caption provider could not transcribe this audio. Your project is unchanged.'),{status:502});
 const result=await response.json();const segments=result.segments?.map(s=>({start:s.start,end:s.end,text:s.text}));if(!segments?.length)throw Object.assign(new Error('No timed speech was found in this audio.'),{status:422});return {segments,language:result.language};
}
module.exports={transcribe};
