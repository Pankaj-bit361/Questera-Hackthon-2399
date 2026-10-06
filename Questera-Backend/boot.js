// Production entry point (npm start). Loads the API's settings from AWS Secrets Manager, then starts index.js.
//
// VELOS_SECRET_ID names one JSON secret of NAME → value pairs (deploy/velos/README.md). A setting that is already in
// the environment, such as an Elastic Beanstalk environment property, wins over the secret, and empty values are
// skipped. Without VELOS_SECRET_ID (local development) it just starts index.js, which reads .env as before.
//
// Settings are read once at start: after changing the secret, restart the app servers (Elastic Beanstalk → Actions →
// Restart app server(s)).

const { loadSecrets } = require('./secrets');

loadSecrets()
  .then((set) => {
    if (set) console.log(`🔐 Loaded ${set} settings from ${process.env.VELOS_SECRET_ID}`);
    require('./index.js');
  })
  .catch((error) => {
    console.error(`❌ Could not load settings from ${process.env.VELOS_SECRET_ID}: ${error.message}`);
    process.exit(1);
  });
