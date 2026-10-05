# Velos API pipeline

Every push to `main` that touches the API deploys it to Elastic Beanstalk `Velos/Velos-env` (Zealoop account
339254022461, us-east-1):

```
GitHub main ──► CodeBuild velos-backend ──► Elastic Beanstalk Velos-env
               npm ci (Node 22)
               deploy/velos/check.cjs: every API module loads
```

Only pushes that change `Questera-Backend/`, `studio/remotion/`, `Procfile`, `.ebextensions/`, `.platform/` or
`deploy/velos/` start it. Frontend-only pushes don't. Runs queue rather than cancel each other.

| File | What it is |
|---|---|
| `pipeline-setup.sh` | Creates or updates the bucket, GitHub connection, roles, build project and pipeline. Safe to run again: `AWS_PROFILE=zealoop deploy/velos/pipeline-setup.sh` |
| `buildspec.yml` | The build. Unlike the root `buildspec.yml` (the older pipeline), it ships `.ebextensions` and `.platform`, so nginx accepts 200 MB uploads and the load balancer waits 600 s |
| `check.cjs` | Loads every module `index.js` uses without starting the server. Run it locally with `node deploy/velos/check.cjs` |

## Once, by hand

1. **Approve the GitHub connection.** In the console, go to Developer Tools → Settings → Connections → `velos-github` →
   *Update pending connection*, and install the AWS Connector app on `Pankaj-bit361/Questera-Hackthon-2399`.
2. **Fill in the settings secret.** The API's settings live in one Secrets Manager secret, `velos/api` (us-east-1),
   as key/value pairs. `npm start` runs `Questera-Backend/boot.js`, which loads the secret before starting `index.js`.
   - `Velos-env` has a single environment property, `VELOS_SECRET_ID`, set to the secret's ARN.
   - Its instance role (`aws-elasticbeanstalk-ec2-role`, inline policy `velos-api-secret`) can read only that secret.
   - The secret already holds:
     - the AWS settings for the IAM user `velos-api`, which can use the `instapixelapi` media bucket, send email as
       `@velosapps.com`, and start Studio renders;
     - the Studio IDs.
   - Add the rest in the console, using the same keys as `Questera-Backend/.env.example` (MongoDB, AI keys,
     Razorpay, JWT, OAuth apps).
   - An environment property with the same name overrides the secret.
   - After changing the secret, restart the app servers (Actions → Restart app server(s)).

   Secrets never go through the pipeline, and nothing reads `.env` on the server.

## Run it by hand

```
aws codepipeline start-pipeline-execution --name velos-backend --profile zealoop --region us-east-1
```
