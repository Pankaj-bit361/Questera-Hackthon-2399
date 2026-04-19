const ToolRegistry = require('./ToolRegistry');

/**
 * ToolsAgentExecutor — uses native function/tool calling API instead of JSON-in-text.
 *
 * Why this is better than AgentExecutor:
 * - The LLM never has to output JSON as text — the API enforces the schema
 * - No JSON parsing issues, no hallucinated tool names or params
 * - Tool parameters are validated by the API before we even see them
 * - The model knows exactly when to stop vs when to keep calling tools
 * - Much less hallucination because tool calling is a first-class API feature
 */
class ToolsAgentExecutor {
   constructor(options = {}) {
      this.llm = options.llm;
      this.tools = options.tools || new ToolRegistry();
      this.systemPrompt = options.systemPrompt || '';
      this.maxIterations = options.maxIterations || 6;
      this.onToolCall = options.onToolCall || null;
      this.onToolResult = options.onToolResult || null;
   }

   /**
    * Get all tools as an array for the LLM
    */
   getToolsList() {
      return this.tools.getAll ? this.tools.getAll() : [];
   }

   /**
    * Build the initial messages array
    */
   buildMessages(input, context) {
      const messages = [
         { role: 'system', content: this.systemPrompt }
      ];

      // Add conversation history
      const historyImageUrls = [];
      if (context.history && Array.isArray(context.history)) {
         for (const msg of context.history) {
            let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            if (msg.imageUrl && msg.role === 'assistant') {
               historyImageUrls.push(msg.imageUrl);
               content = `[Image generated: ${msg.imageUrl}]`;
            }
            messages.push({
               role: msg.role === 'assistant' ? 'assistant' : 'user',
               content
            });
         }
      }

      // Inject recent image URLs into context so model doesn't hallucinate them
      if (historyImageUrls.length > 0) {
         const recent = historyImageUrls.slice(-10);
         messages.push({
            role: 'system',
            content: `[RECENT_IMAGES_IN_CONVERSATION: ${JSON.stringify(recent)}]\nUse ONLY these URLs when referencing past images. Never invent URLs.`
         });
      }

      // Build user message
      let userContent = input.message || '';

      if (input.images && input.images.length > 0) {
         userContent += `\n\n[User attached ${input.images.length} reference image(s) for face/style preservation]`;
      }
      if (context.lastImageUrl) {
         userContent += `\n\n[Previous image available for editing: ${context.lastImageUrl}]`;
      }

      messages.push({ role: 'user', content: userContent });
      return messages;
   }

   /**
    * Execute a single tool by name
    */
   async executeTool(name, params, context) {
      if (!this.tools.has(name)) {
         return { success: false, error: `Tool not found: ${name}` };
      }

      if (this.onToolCall) this.onToolCall(name, params);

      try {
         const result = await this.tools.execute(name, params, context);
         if (this.onToolResult) this.onToolResult(name, result);
         return result;
      } catch (error) {
         console.error(`❌ [TOOLS_EXECUTOR] Tool "${name}" threw:`, error.message);
         return { success: false, error: error.message };
      }
   }

   /**
    * Main run loop using native tool calling
    */
   async run(input, context = {}) {
      const messages = this.buildMessages(input, context);
      const tools = this.getToolsList();
      let iterations = 0;
      let lastToolResult = null;
      let lastImageResult = null; // Tracked separately — reply/chat tools must not overwrite this

      while (iterations < this.maxIterations) {
         iterations++;
         console.log(`🧠 [TOOLS_EXECUTOR] Iteration ${iterations}/${this.maxIterations}`);

         const response = await this.llm.chatWithTools(messages, tools);

         if (!response) {
            return { success: false, message: 'No response from LLM', iterations };
         }

         const toolCalls = response.tool_calls;
         const textContent = response.content || '';

         // No tool calls → model is done, return final text
         if (!toolCalls || toolCalls.length === 0) {
            console.log('✅ [TOOLS_EXECUTOR] Final answer received');
            return {
               success: true,
               message: textContent,
               result: lastImageResult || lastToolResult, // Prefer image result over reply result
               toolUsed: lastToolResult ? 'done' : null,
               cognitive: (lastImageResult || lastToolResult)?.cognitive || null,
               iterations
            };
         }

         // Add assistant message with tool calls to history
         messages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls
         });

         // Execute each tool call and collect results
         for (const toolCall of toolCalls) {
            const toolName = toolCall.function?.name;
            let toolParams = {};

            try {
               toolParams = JSON.parse(toolCall.function?.arguments || '{}');
            } catch {
               console.warn(`⚠️ [TOOLS_EXECUTOR] Failed to parse args for ${toolName}`);
            }

            console.log(`🔧 [TOOLS_EXECUTOR] Calling tool: ${toolName}`, JSON.stringify(toolParams).slice(0, 100));
            const toolResult = await this.executeTool(toolName, toolParams, context);
            lastToolResult = toolResult;
            if (toolResult.imageUrl || toolResult.images?.length) lastImageResult = toolResult;

            console.log(`${toolResult.success ? '✅' : '❌'} [TOOLS_EXECUTOR] Tool "${toolName}" result:`, toolResult.success ? 'success' : toolResult.error);

            // Add tool result to messages
            messages.push({
               role: 'tool',
               tool_call_id: toolCall.id,
               content: JSON.stringify(toolResult)
            });
         }
      }

      return {
         success: false,
         message: 'Max iterations reached',
         iterations
      };
   }

   /**
    * Streaming version — emits events for real-time UI updates
    */
   async runStream(input, context = {}, emit) {
      const messages = this.buildMessages(input, context);
      const tools = this.getToolsList();
      let iterations = 0;
      let lastToolResult = null;
      let lastImageResult = null;

      emit({ type: 'thinking', data: { stage: 'analyzing', message: 'Understanding your request...' } });

      while (iterations < this.maxIterations) {
         iterations++;
         console.log(`🧠 [TOOLS_EXECUTOR_STREAM] Iteration ${iterations}`);

         emit({ type: 'thinking', data: { stage: 'reasoning', message: 'Deciding best approach...', iteration: iterations } });

         let response;
         try {
            response = await this.llm.chatWithTools(messages, tools);
         } catch (error) {
            console.error('❌ [TOOLS_EXECUTOR_STREAM] LLM error:', error.message);
            emit({ type: 'error', data: { message: error.message } });
            return { success: false, message: error.message, iterations };
         }

         if (!response) {
            emit({ type: 'error', data: { message: 'No response from LLM' } });
            return { success: false, message: 'No response from LLM', iterations };
         }

         const toolCalls = response.tool_calls;
         const textContent = response.content || '';

         // No tool calls → final answer
         if (!toolCalls || toolCalls.length === 0) {
            console.log('✅ [TOOLS_EXECUTOR_STREAM] Final answer');

            emit({ type: 'answer_start', data: {} });
            const words = textContent.split(' ');
            for (let i = 0; i < words.length; i++) {
               emit({ type: 'token', data: { token: (i > 0 ? ' ' : '') + words[i] } });
               await new Promise(r => setTimeout(r, 15));
            }
            emit({ type: 'answer_end', data: {} });
            emit({ type: 'complete', data: { toolUsed: lastToolResult ? 'done' : null } });

            return {
               success: true,
               message: textContent,
               result: lastImageResult || lastToolResult, // Prefer image result over reply result
               cognitive: (lastImageResult || lastToolResult)?.cognitive || null,
               iterations
            };
         }

         // Add assistant message with tool calls
         messages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls
         });

         // Execute each tool
         for (const toolCall of toolCalls) {
            const toolName = toolCall.function?.name;
            let toolParams = {};

            try {
               toolParams = JSON.parse(toolCall.function?.arguments || '{}');
            } catch {
               console.warn(`⚠️ [TOOLS_EXECUTOR_STREAM] Failed to parse args for ${toolName}`);
            }

            emit({
               type: 'tool_call',
               data: { tool: toolName, params: toolParams }
            });

            console.log(`🔧 [TOOLS_EXECUTOR_STREAM] Calling: ${toolName}`);
            const toolResult = await this.executeTool(toolName, toolParams, context);
            lastToolResult = toolResult;
            if (toolResult.imageUrl || toolResult.images?.length) lastImageResult = toolResult;

            emit({
               type: 'tool_result',
               data: {
                  tool: toolName,
                  success: toolResult.success,
                  cognitive: toolResult.cognitive
               }
            });

            messages.push({
               role: 'tool',
               tool_call_id: toolCall.id,
               content: JSON.stringify(toolResult)
            });
         }
      }

      emit({ type: 'error', data: { message: 'Max iterations reached' } });
      return { success: false, message: 'Max iterations reached', iterations };
   }
}


module.exports = ToolsAgentExecutor;
