const SchedulerService = require('../../functions/SchedulerService');
const Instagram = require('../../models/instagram');
const SocialAccount = require('../../models/socialAccount');
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
   description: `Schedule or immediately post content to Instagram, LinkedIn or X (Twitter).

WHEN TO USE:
- User wants to POST or SCHEDULE content to Instagram, LinkedIn or X
- User says "post this", "schedule", "publish", "share to Instagram", "share on LinkedIn", "tweet this", "post to X"
- User says "post now", "post immediately", "share this"
- User wants to post to their Instagram story
- After generating an image, user wants to share it

WHEN NOT TO USE:
- User just wants to generate an image → use generate_image instead
- User wants to edit an image first → use edit_image instead
- User is asking about their accounts → use get_social_accounts instead
- No image has been generated yet → generate one first

POST TYPES (Instagram):
- "image" (default): Regular Instagram feed post - permanent, shows in grid
- "carousel": Multiple images in one post - swipeable, great for variations
- "story": Instagram Story - ephemeral (24h), full-screen vertical format

POST TYPES (LinkedIn):
- "text": Written post with no media. Strong reach on LinkedIn - a valid choice on its own.
- "image" (default when an image exists): One landscape visual, 1.91:1 works best.
- "multi_image": 2-20 images in one post. LinkedIn's equivalent of a carousel.
- "video": A single video post.
- LinkedIn has NO stories and NO reels - never use postType "story" there.

POST TYPES (X / Twitter):
- "text" (default): A single post, hard capped at 280 characters.
- "thread": Multiple connected posts. Pass threadParts as an array of strings.
- "image": One visual with text.
- "multi_image": 2-4 images. X allows no more than 4.
- "video": A single video post.
- X has NO stories and NO reels.
- Copy longer than 280 characters is split into a thread automatically rather
  than being truncated.

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
- "Post these 4 variations as a carousel" → carousel post with multiple images

CAROUSEL POSTS (MULTIPLE IMAGES):
- Use postType="carousel" when posting multiple images
- Provide imageUrls array with 2-10 image URLs
- Great for variations, before/after, product showcases
- Single imageUrl is ignored when imageUrls is provided

ACCOUNT SELECTION:
- If user has multiple Instagram accounts, specify accountUsername
- Use get_social_accounts first to see available accounts
- If not specified, uses default/first connected account

IMPORTANT:
- On Instagram an image must exist before scheduling (either generated or uploaded)
- On LinkedIn and X a text-only post is valid and needs no image
- Stories don't support captions or hashtags
- Use 9:16 aspect ratio for best story appearance
- Instagram feed posts work best with 1:1 or 4:5; LinkedIn prefers 1.91:1
- LinkedIn captions cap at 3000 characters and 5 hashtags
- X posts cap at 280 characters; hashtags hurt reach there, so use none`,

   parameters: {
      imageUrl: {
         type: 'string',
         required: false,
         description: 'URL of single image to post. For carousel, use imageUrls instead. Leave empty to auto-use last generated.',
         example: 'https://storage.example.com/images/generated-abc123.jpg'
      },
      imageUrls: {
         type: 'array',
         required: false,
         description: 'Array of image URLs for CAROUSEL posts (2-10 images). Takes priority over imageUrl when provided.',
         example: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg', 'https://example.com/img3.jpg']
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
         description: 'Post type: "image" for single feed post (default), "carousel" for multiple images, "story" for Instagram Story',
         example: 'carousel'
      },
      platform: {
         type: 'string',
         required: false,
         description: 'Where to post: "instagram" (default), "linkedin", or "twitter" (X).',
         example: 'twitter'
      },
      threadParts: {
         type: 'array',
         required: false,
         description: 'X only. Each string becomes one post in a thread, chained as replies. Each must be under 280 characters.',
         example: ['the thing nobody tells you about shipping fast', 'you spend the saved time on support instead']
      },
      accountUsername: {
         type: 'string',
         required: false,
         description: 'Account to post to. Use get_social_accounts to see options. Omit for the default account on that platform.',
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
      const { caption, scheduledTime, accountUsername, hashtags, postType, imageUrls } = params;
      const { userId, lastImageUrl, variationImages } = context;

      const platform = (params.platform || 'instagram').toLowerCase();
      const isLinkedIn = platform === 'linkedin';
      const isTwitter = platform === 'twitter';
      const threadParts = (params.threadParts || []).filter(Boolean);

      // Handle carousel vs single image
      let finalImageUrls = [];
      let finalImageUrl = null;

      if (imageUrls && imageUrls.length > 1) {
         // Carousel mode - multiple images provided
         finalImageUrls = imageUrls;
         finalImageUrl = imageUrls[0]; // First image as fallback
      } else if (variationImages && variationImages.length > 1 && (!postType || postType === 'carousel')) {
         // Auto-detect: variations exist in context, use them as carousel
         finalImageUrls = variationImages.map(v => v.imageUrl || v);
         finalImageUrl = finalImageUrls[0];
      } else {
         // Single image mode
         finalImageUrl = params.imageUrl || lastImageUrl;
      }

      // Determine post type
      const typeStr = postType?.toLowerCase() || '';
      let finalPostType = 'image';

      if (isTwitter) {
         if (typeStr === 'story' || typeStr === 'reel') {
            return {
               success: false,
               error: 'X has no stories or reels',
               message: 'X does not support stories or reels. I can post this to the timeline instead.'
            };
         }
         if (typeStr === 'thread' || threadParts.length > 1) {
            finalPostType = 'thread';
         } else if (typeStr === 'video') {
            finalPostType = 'video';
         } else if (typeStr === 'multi_image' || typeStr === 'carousel' || finalImageUrls.length > 1) {
            finalPostType = 'multi_image';
         } else if (typeStr === 'text' || (!finalImageUrl && finalImageUrls.length === 0)) {
            finalPostType = 'text';
         }
      } else if (isLinkedIn) {
         if (typeStr === 'story') {
            return {
               success: false,
               error: 'LinkedIn has no stories',
               message: 'LinkedIn does not support stories. I can post this to the feed instead.'
            };
         }
         if (typeStr === 'text' || (!finalImageUrl && finalImageUrls.length === 0)) {
            finalPostType = 'text';
         } else if (typeStr === 'video') {
            finalPostType = 'video';
         } else if (typeStr === 'multi_image' || typeStr === 'carousel' || finalImageUrls.length > 1) {
            finalPostType = 'multi_image';
         }
      } else if (typeStr === 'story') {
         finalPostType = 'story';
      } else if (typeStr === 'carousel' || finalImageUrls.length > 1) {
         finalPostType = 'carousel';
      }

      const isStory = finalPostType === 'story';
      const isCarousel = finalPostType === 'carousel' || finalPostType === 'multi_image';
      const isThread = finalPostType === 'thread';
      const isTextOnly = finalPostType === 'text' || isThread;

      // X allows at most 4 images on a post.
      if (isTwitter && finalImageUrls.length > 4) {
         finalImageUrls = finalImageUrls.slice(0, 4);
      }

      console.log('📅 [SCHEDULE] Params:', JSON.stringify(params));
      console.log('📅 [SCHEDULE] Context lastImageUrl:', lastImageUrl);
      console.log('📅 [SCHEDULE] Final imageUrl:', finalImageUrl);
      console.log('📅 [SCHEDULE] Final imageUrls count:', finalImageUrls.length);
      console.log('📅 [SCHEDULE] Post type:', finalPostType, isStory ? '(Story)' : isCarousel ? '(Carousel)' : '(Feed)');

      if (!userId) {
         return { success: false, error: 'userId is required', message: 'Please log in first.' };
      }

      if (!isTextOnly && !finalImageUrl && finalImageUrls.length === 0) {
         return { success: false, error: 'imageUrl is required', message: 'No image found to schedule. Please generate or select an image first.' };
      }

      if (isTextOnly && !caption && threadParts.length === 0) {
         return { success: false, error: 'caption is required', message: 'A text-only post needs a caption.' };
      }

      if (isCarousel && finalImageUrls.length < 2) {
         return { success: false, error: 'Multi-image posts require at least 2 images', message: 'Please provide at least 2 images for a multi-image post.' };
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

         if (isLinkedIn || isTwitter) {
            // LinkedIn and X accounts live in the generic SocialAccount model.
            const label = isTwitter ? 'X' : 'LinkedIn';
            const query = { userId, platform, isActive: true };
            const accounts = await SocialAccount.find(query).sort({ createdAt: 1 });

            if (accounts.length === 0) {
               return {
                  success: false,
                  error: `No ${label} account connected`,
                  message: `You have not connected ${label} yet. Connect it in Settings, then I can post for you.`
               };
            }

            const match = accountUsername
               ? accounts.find(a => a.platformUsername?.toLowerCase().includes(accountUsername.toLowerCase()))
               : accounts[0];

            if (!match) {
               return { success: false, error: `${label} account "${accountUsername}" not found`, message: `Could not find a connected ${label} account matching "${accountUsername}".` };
            }
            accountId = match.accountId;
            console.log(`📅 [SCHEDULE] ${label} account:`, match.platformUsername, accountId);
         } else if (accountUsername) {
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
            platform,
            socialAccountId: accountId,
            imageUrl: isTextOnly ? undefined : finalImageUrl,
            imageUrls: isCarousel ? finalImageUrls : [],
            caption: isStory ? '' : (caption || 'Posted with Velos AI ✨'), // Stories don't have captions
            hashtags: isStory ? '' : (hashtags || ''), // Stories don't have hashtags
            scheduledAt: parsedTime,
            postType: finalPostType,
            threadParts: isThread ? threadParts : [],
            source: 'agent'
         });
         console.log('📅 [SCHEDULE] Post created:', post?._id, 'Type:', finalPostType, isCarousel ? `(${finalImageUrls.length} images)` : '');

         const scheduledDate = new Date(parsedTime);
         const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

         // Generate cognitive narration (thinking steps)
         const thinkingSteps = narrator.narrateScheduling(params);

         // Build opinionated reasoning (micro-decisions)
         const decisions = [];
         const isImmediate = scheduledTime === 'now' || scheduledTime === 'immediately';

         // Add post type decision
         const formatLabel = isStory ? 'Instagram Story'
            : isThread ? `X Thread (${threadParts.length} posts)`
            : isTextOnly ? (isTwitter ? 'X Post' : 'LinkedIn Text Post')
            : isCarousel ? `${isLinkedIn ? 'Multi-image' : 'Carousel'} (${finalImageUrls.length} images)`
            : 'Feed Post';
         const formatReason = isStory ? 'Story for quick, ephemeral engagement'
            : isCarousel ? 'Carousel for higher engagement with multiple visuals'
            : 'Feed post for lasting visibility';

         decisions.push({
            type: 'format',
            value: formatLabel,
            reason: formatReason
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
         ] : isCarousel ? [
            'Great choice! Carousels get 3x more engagement than single images.',
            'Want me to schedule follow-up content to boost this post\'s reach?',
            'Should I create more variations for your next carousel?'
         ] : [
            'Want me to schedule the same content for another account?',
            'I can create carousel posts for higher engagement if you have more images.',
            'Should I schedule follow-up content to boost this post\'s reach?'
         ];

         const postTypeLabel = isStory ? 'Story' : isCarousel ? 'Carousel' : 'Post';
         const messageText = isStory
            ? `Story scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}'s Instagram Story.`
            : isCarousel
            ? `Carousel with ${finalImageUrls.length} images scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}.`
            : `Post scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}.`;

         return {
            success: true,
            postId: post._id,
            postType: finalPostType,
            isCarousel,
            imageCount: isCarousel ? finalImageUrls.length : 1,
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

