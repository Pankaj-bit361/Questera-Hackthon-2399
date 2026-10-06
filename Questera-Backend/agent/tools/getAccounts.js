const Instagram = require('../../models/instagram');
const SocialAccount = require('../../models/socialAccount');


const getAccountsTool = {
   name: 'get_social_accounts',
   description: `Get list of connected social accounts (Instagram and LinkedIn) for the user.

WHEN TO USE:
- User asks "what accounts do I have?", "show my accounts"
- User asks "which Instagram am I connected to?"
- User asks "am I connected to LinkedIn?"
- BEFORE scheduling when user has multiple accounts
- User wants to switch between accounts
- User says "post to my other account" (check which accounts exist)
- User is confused about which account will be used
- Verifying account connection status

WHEN NOT TO USE:
- User just wants to generate an image → use generate_image
- User wants to post and you already know their account → use schedule_post directly
- User is asking general questions → use reply instead
- User wants to connect a NEW account → reply with instructions (can't do via tool)

WHAT IT RETURNS:
- List of all connected Instagram Business accounts
- For each account: ID, username, display name, profile picture
- Total count of connected accounts
- Helpful message summarizing the accounts

USE BEFORE SCHEDULING:
- Call this first if user mentions multiple accounts
- Helps determine which accountUsername to use in schedule_post
- Prevents errors from typos in account names

EXAMPLES:
- "What accounts do I have?" → returns list of connected accounts
- "Show my Instagram accounts" → returns account details
- "Which account will this post to?" → returns accounts, explain default behavior
- "Can I post to @mybrand?" → check if that account is connected

OUTPUT FORMAT:
{
  accounts: [
    { id: "123", username: "mybrand", name: "My Brand", profilePicture: "url" }
  ],
  count: 1,
  message: "You have 1 connected account: mybrand"
}

IMPORTANT:
- Returns empty array if no accounts connected
- User must connect accounts via Instagram OAuth (not via this tool)
- Business/Creator accounts only (personal accounts not supported)
- Profile pictures may be cached/outdated`,

   parameters: {
      platform: {
         type: 'string',
         required: false,
         description: 'Filter to one platform: "instagram" or "linkedin". Omit to list every connected account.',
         example: 'linkedin'
      }
   },

   execute: async (params, context) => {
      const { userId } = context;
      const wanted = params?.platform?.toLowerCase();

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      try {
         const accounts = [];

         // Instagram lives in its own legacy model with an accounts[] subdoc.
         if (!wanted || wanted === 'instagram') {
            const doc = await Instagram.findOne({ userId });
            for (const acc of doc?.accounts || []) {
               accounts.push({
                  platform: 'instagram',
                  id: acc.instagramBusinessAccountId,
                  username: acc.instagramUsername,
                  name: acc.instagramName || acc.facebookPageName,
                  profilePicture: acc.profilePictureUrl,
               });
            }
         }

         // Everything else uses the generic SocialAccount model.
         if (!wanted || wanted !== 'instagram') {
            const query = { userId, isActive: true };
            if (wanted) query.platform = wanted;
            else query.platform = { $ne: 'instagram' };

            const socialAccounts = await SocialAccount.find(query);
            for (const acc of socialAccounts) {
               accounts.push({
                  platform: acc.platform,
                  id: acc.accountId,
                  username: acc.platformUsername,
                  name: acc.platformUsername,
                  profilePicture: acc.profilePictureUrl,
                  authorType: acc.authorType,
               });
            }
         }

         if (accounts.length === 0) {
            return {
               success: true,
               accounts: [],
               count: 0,
               message: wanted
                  ? `No ${wanted} account connected. Connect one in Settings.`
                  : 'No social accounts connected. Connect one in Settings.'
            };
         }

         const summary = accounts
            .map(a => `${a.username || a.id} (${a.platform})`)
            .join(', ');

         return {
            success: true,
            accounts,
            count: accounts.length,
            message: `You have ${accounts.length} connected account(s): ${summary}`
         };
      } catch (error) {
         return { success: false, error: error.message };
      }
   }
};


module.exports = getAccountsTool;

