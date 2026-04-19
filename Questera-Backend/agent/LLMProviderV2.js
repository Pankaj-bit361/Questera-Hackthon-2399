/**
 * LLMProviderV2 — adds native function/tool calling support on top of OpenRouter.
 *
 * Key difference from v1: chatWithTools() sends tools as structured API params
 * instead of embedding them in the system prompt as text. The model returns
 * tool_calls blocks (not text JSON), eliminating hallucination from JSON parsing.
 */
class OpenRouterProviderV2 {
   constructor(config = {}) {
      this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
      this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      this.model = config.model || 'google/gemini-3.1-pro-preview';
   }

   /**
    * Plain text chat (kept for compatibility)
    */
   async chat(messages, options = {}) {
      const { temperature = 0.7, maxTokens = 4096 } = options;

      const response = await fetch(this.baseUrl, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://velosapps.com',
            'X-Title': 'Questera AI'
         },
         body: JSON.stringify({ model: this.model, messages, temperature, max_tokens: maxTokens })
      });

      if (!response.ok) {
         const err = await response.text();
         throw new Error(`OpenRouter error: ${response.status} - ${err}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
   }

   /**
    * Native tool/function calling.
    * Converts our internal tool definitions to OpenAI function call format,
    * sends them to the API, and returns the raw message object which may contain
    * tool_calls (structured) instead of text.
    *
    * @param {Array} messages  - Chat history in {role, content} format
    * @param {Array} tools     - Tool definitions from ToolRegistry.getDefinitions()
    * @param {Object} options
    * @returns {Promise<Object>} Raw message: { role, content, tool_calls? }
    */
   async chatWithTools(messages, tools, options = {}) {
      const { temperature = 0.3, maxTokens = 4096 } = options;

      // Convert internal tool format → OpenAI function calling format
      const openAITools = tools.map(t => ({
         type: 'function',
         function: {
            name: t.name,
            description: t.description,
            parameters: {
               type: 'object',
               properties: Object.fromEntries(
                  Object.entries(t.parameters || {}).map(([k, v]) => [k, {
                     type: v.type,
                     description: v.description,
                     ...(v.enum ? { enum: v.enum } : {})
                  }])
               ),
               required: Object.entries(t.parameters || {})
                  .filter(([, v]) => v.required)
                  .map(([k]) => k)
            }
         }
      }));

      console.log(`🔧 [LLM_V2] chatWithTools — model: ${this.model}, tools: ${openAITools.map(t => t.function.name).join(', ')}`);

      const response = await fetch(this.baseUrl, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://velosapps.com',
            'X-Title': 'Questera AI'
         },
         body: JSON.stringify({
            model: this.model,
            messages,
            tools: openAITools,
            tool_choice: 'auto',
            temperature,
            max_tokens: maxTokens
         })
      });

      if (!response.ok) {
         const errorText = await response.text();
         console.error('❌ [LLM_V2] Tool call error:', response.status, errorText);
         throw new Error(`LLM tool call error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      console.log(`🔧 [LLM_V2] Response — has tool_calls: ${!!(message?.tool_calls?.length)}, finish_reason: ${data.choices?.[0]?.finish_reason}`);
      return message;
   }
}


module.exports = { OpenRouterProviderV2 };
