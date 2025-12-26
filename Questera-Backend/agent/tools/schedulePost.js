const SchedulerService = require('../../functions/SchedulerService');
const Instagram = require('../../models/instagram');
const { CognitiveNarrator } = require('../CognitiveNarrator');


const schedulerService = new SchedulerService();
const narrator = new CognitiveNarrator();


function parseRelativeTime(timeStr) {
   if (!timeStr) return null;

   const now = new Date();
   const str = timeStr.toLowerCase().trim();

   // Handle "now" or "immediately" - post in 1 minute
   if (str === 'now' || str === 'immediately' || str === 'right now' || str === 'asap') {
      now.setMinutes(now.getMinutes() + 1);
      return now.toISOString();
   }

   const minMatch = str.match(/(\d+)\s*(min|minute)/);
   if (minMatch) {
      now.setMinutes(now.getMinutes() + parseInt(minMatch[1]));
      return now.toISOString();
   }

   const hourMatch = str.match(/(\d+)\s*(hour|hr)/);
   if (hourMatch) {
      now.setHours(now.getHours() + parseInt(hourMatch[1]));
      return now.toISOString();
   }

   const dayMatch = str.match(/(\d+)\s*(day)/);
   if (dayMatch) {
      now.setDate(now.getDate() + parseInt(dayMatch[1]));
      return now.toISOString();
   }

   if (str.includes('t') && str.includes(':')) {
      return timeStr;
   }

   return null;
}


const schedulePostTool = {
   name: 'schedule_post',
   description: `Schedule or immediately post an image to Instagram feed OR story.

WHEN TO USE:
- User wants to POST or SCHEDULE content to Instagram
- User says "post this", "schedule", "publish", "share to Instagram"
- User says "post now", "post immediately", "share this"
- User wants to post to their Instagram story
- After generating an image, user wants to share it

WHEN NOT TO USE:
- User just wants to generate an image → use generate_image instead
- User wants to edit an image first → use edit_image instead
- User is asking about their accounts → use get_instagram_accounts instead
- No image has been generated yet → generate one first

POST TYPES:
- "image" (default): Regular Instagram feed post - permanent, shows in grid
- "story": Instagram Story - ephemeral (24h), full-screen vertical format

TIMING OPTIONS:
- "now" or "immediately": Posts within 1 minute
- Relative time: "2 minutes", "1 hour", "3 hours", "1 day"
- Supports: minutes, hours, days

CAPTION BEST PRACTICES:
- Keep captions engaging and relevant to the image
- Stories don't use captions (caption parameter is ignored)
- Include call-to-action when appropriate
- Hashtags can be in caption or separate hashtags parameter

EXAMPLES:
- "Post this now" → immediate feed post with generated image
- "Schedule for 2 hours from now" → delayed feed post
- "Post to my story" → Instagram story post
- "Post to @mybrand account" → posts to specific connected account
- "Schedule this for tomorrow with caption 'New product launch!'" → scheduled with custom caption

ACCOUNT SELECTION:
- If user has multiple Instagram accounts, specify accountUsername
- Use get_instagram_accounts first to see available accounts
- If not specified, uses default/first connected account

IMPORTANT:
- Image must exist before scheduling (either generated or uploaded)
- Stories don't support captions or hashtags
- Use 9:16 aspect ratio for best story appearance
- Feed posts work best with 1:1 or 4:5 aspect ratios`,

   parameters: {
      imageUrl: {
         type: 'string',
         required: true,
         description: 'URL of image to post. Usually the last generated image. Leave empty to auto-use last generated.',
         example: 'https://storage.example.com/images/generated-abc123.jpg'
      },
      caption: {
         type: 'string',
         required: true,
         description: 'Caption for feed post. Ignored for stories. Make it engaging with call-to-action.',
         example: '✨ Exciting news! Our new collection just dropped. Link in bio! 🔗'
      },
      scheduledTime: {
         type: 'string',
         required: true,
         description: 'When to post: "now", "immediately", or relative like "30 minutes", "2 hours", "1 day"',
         example: '2 hours'
      },
      postType: {
         type: 'string',
         required: false,
         description: 'Post type: "image" for feed (default), "story" for Instagram Story (24h ephemeral)',
         example: 'story'
      },
      accountUsername: {
         type: 'string',
         required: false,
         description: 'Instagram username to post to. Use get_instagram_accounts to see options. Omit for default account.',
         example: 'mybrandofficial'
      },
      hashtags: {
         type: 'string',
         required: false,
         description: 'Hashtags for feed posts (ignored for stories). Can also include in caption instead.',
         example: '#newproduct #launch #exciting #brand'
      }
   },

   execute: async (params, context) => {
      const { caption, scheduledTime, accountUsername, hashtags, postType } = params;
      const { userId, lastImageUrl } = context;

      // Use provided imageUrl or fall back to last generated image
      const imageUrl = params.imageUrl || lastImageUrl;

      // Determine post type - default to 'image' (feed post), or 'story' for Stories
      const finalPostType = postType?.toLowerCase() === 'story' ? 'story' : 'image';
      const isStory = finalPostType === 'story';

      console.log('📅 [SCHEDULE] Params:', JSON.stringify(params));
      console.log('📅 [SCHEDULE] Context lastImageUrl:', lastImageUrl);
      console.log('📅 [SCHEDULE] Final imageUrl:', imageUrl);
      console.log('📅 [SCHEDULE] Post type:', finalPostType, isStory ? '(Story)' : '(Feed)');

      if (!userId) {
         return { success: false, error: 'userId is required', message: 'Please log in first.' };
      }

      if (!imageUrl) {
         return { success: false, error: 'imageUrl is required', message: 'No image found to schedule. Please generate or select an image first.' };
      }

      if (!scheduledTime) {
         return { success: false, error: 'scheduledTime is required', message: 'Please specify when to schedule the post.' };
      }

      const parsedTime = parseRelativeTime(scheduledTime);
      if (!parsedTime) {
         return { success: false, error: 'Invalid time format', message: 'Please provide a valid time like "2 minutes" or "1 hour".' };
      }

      try {
         let accountId = null;

         if (accountUsername) {
            const doc = await Instagram.findOne({ userId });
            console.log('📅 [SCHEDULE] Found Instagram doc:', !!doc);
            console.log('📅 [SCHEDULE] Accounts:', doc?.accounts?.length);
            if (doc && doc.accounts) {
               const account = doc.accounts.find(a =>
                  a.instagramUsername?.toLowerCase() === accountUsername.toLowerCase()
               );
               console.log('📅 [SCHEDULE] Matching account:', account?.instagramUsername, account?.instagramBusinessAccountId);
               if (account) {
                  accountId = account.instagramBusinessAccountId;
               }
            }
            if (!accountId) {
               console.log('📅 [SCHEDULE] Account not found:', accountUsername);
               return { success: false, error: `Account "${accountUsername}" not found`, message: `Could not find account "${accountUsername}". Please check the username.` };
            }
         }

         console.log('📅 [SCHEDULE] Calling schedulerService.schedulePost with accountId:', accountId, 'postType:', finalPostType);
         const post = await schedulerService.schedulePost(userId, {
            socialAccountId: accountId,
            imageUrl,
            caption: isStory ? '' : (caption || 'Posted with Velos AI ✨'), // Stories don't have captions
            hashtags: isStory ? '' : (hashtags || ''), // Stories don't have hashtags
            scheduledAt: parsedTime,
            postType: finalPostType
         });
         console.log('📅 [SCHEDULE] Post created:', post?._id, 'Type:', finalPostType);

         const scheduledDate = new Date(parsedTime);
         const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

         // Generate cognitive narration (thinking steps)
         const thinkingSteps = narrator.narrateScheduling(params);

         // Build opinionated reasoning (micro-decisions)
         const decisions = [];
         const isImmediate = scheduledTime === 'now' || scheduledTime === 'immediately';

         // Add post type decision
         decisions.push({
            type: 'format',
            value: isStory ? 'Instagram Story' : 'Feed Post',
            reason: isStory ? 'Story for quick, ephemeral engagement' : 'Feed post for lasting visibility'
         });

         if (isImmediate) {
            decisions.push({
               type: 'timing',
               value: 'immediate post',
               reason: 'Publishing now to capture real-time engagement'
            });
         } else {
            decisions.push({
               type: 'timing',
               value: timeStr,
               reason: 'Scheduled for when your audience is most active'
            });
         }

         if (accountUsername) {
            decisions.push({
               type: 'account',
               value: `@${accountUsername}`,
               reason: 'Posting to your specified Instagram account'
            });
         }

         if (!isStory && caption && caption.length > 50) {
            decisions.push({
               type: 'caption',
               value: 'optimized caption',
               reason: 'Caption length optimized for Instagram engagement'
            });
         }

         // Generate smart suggestions based on post type
         const suggestions = isStory ? [
            'Want me to also post this to your feed for more lasting visibility?',
            'I can schedule more stories throughout the day for consistent engagement.',
            'Should I add interactive elements like polls or questions to your next story?'
         ] : [
            'Want me to schedule the same content for another account?',
            'I can create carousel posts for higher engagement if you have more images.',
            'Should I schedule follow-up content to boost this post\'s reach?'
         ];

         const postTypeLabel = isStory ? 'Story' : 'Post';
         const messageText = isStory
            ? `Story scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}'s Instagram Story.`
            : `Post scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}.`;

         return {
            success: true,
            postId: post._id,
            postType: finalPostType,
            scheduledAt: parsedTime,
            status: post.status,
            message: messageText,
            // Cognitive Layer
            cognitive: {
               thinkingSteps,
               decisions,
               suggestions,
               persona: 'growth'
            }
         };
      } catch (error) {
         console.error('📅 [SCHEDULE] Error:', error.message);
         console.error('📅 [SCHEDULE] Stack:', error.stack);
         return { success: false, error: error.message, message: `Failed to schedule: ${error.message}` };
      }
   }
};


module.exports = schedulePostTool;

