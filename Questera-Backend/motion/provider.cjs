// Motion has its own model selection; legacy autopilot settings cannot downgrade it.
const DEFAULT_MODEL='google/gemini-3.8-flash';
const APP_TITLE='Greta';
const motionModel=()=>process.env.MOTION_LLM_MODEL?.trim()||DEFAULT_MODEL;
const providerHeaders=()=>({Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://velosapps.com','X-Title':APP_TITLE});
const generationOptions=(model,maxTokens)=>(/^google\/gemini-3\.8-flash$/.test(model)?{max_tokens:Math.max(16000,maxTokens),reasoning:{effort:'high'}}:{max_tokens:maxTokens,temperature:.7});
module.exports={DEFAULT_MODEL,APP_TITLE,motionModel,providerHeaders,generationOptions};
