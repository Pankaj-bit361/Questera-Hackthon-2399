const { createImageAgent } = require('./index');


async function runExample() {
   const agent = createImageAgent({
      provider: 'openrouter',
      model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash'
   });

   const result = await agent.run({
      userId: 'user-123',
      chatId: 'chat-example',
      message: 'Create a beautiful sunset image over mountains',
      referenceImages: []
   });

   console.log('\n📤 Final Result:', result);
}


if (require.main === module) {
   runExample().catch(console.error);
}

