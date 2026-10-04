const crypto=require('node:crypto');
// Media links carry a resource-scoped ticket, never an account-login credential.
// A separate signing key prevents a shared download URL from authenticating to
// either Motion or legacy Velos APIs, even though both trust the login JWT key.
const mediaKey=loginSecret=>crypto.createHmac('sha256',loginSecret).update('velos-motion-media-v1').digest('hex');
module.exports={mediaKey};
