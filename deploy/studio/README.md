# Studio on AWS: one Fargate task per job

The Velos API only creates, lists and edits Studio jobs. Every run (a new job, a retry, or an edit's re-render) is its
own ECS Fargate task, started by the API, that pulls the job from S3, captures the site, writes the scripts, checks and
renders the videos, and pushes every change back to S3 as it goes. The UI polls the API, which reads the job from S3;
videos and screenshots are served by short-lived S3 links. Nothing runs, and nothing is paid for, when nobody is
making videos.

```
browser ── /api/studio ──► Velos API ──RunTask──► Fargate task (worker image)
   ▲                         │  ▲                    │
   └── 302 to S3 link ◄──────┘  └──── job.json ◄──── S3 ◄── screenshots, videos
```

It lives in its own AWS account (Zealoop, `339254022461`, `us-east-2`), apart from the Velos servers.

## What is in AWS

| | |
| --- | --- |
| ECR `velos-studio-worker` | the worker image (`deploy/studio/Dockerfile`); the last 10 are kept |
| S3 `velos-studio-339254022461-us-east-2` | `jobs/<id>/…`, `users/<user>/…` index, `secrets/` (sealed logins, deleted on read, expire in a day). Private, encrypted, TLS only |
| VPC `velos-studio` | its own network: 3 public subnets, no NAT. Security group allows no inbound and only ports 80/443 out. S3 goes through a gateway endpoint |
| ECS cluster `velos-studio` | Fargate. Task definition `velos-studio-worker`: 8 vCPU / 16 GB (falls back to 4 vCPU / 8 GB when the account's vCPU limit is reached), 30 GB disk |
| SSM `/velos-studio/openrouter-api-key` | the model key, given to the worker as `OPENROUTER_API_KEY` |
| CloudWatch Logs `/velos-studio/worker` | one stream per task, kept 30 days |
| IAM role `velos-studio-worker` | the worker: read/write `jobs/*`, read/delete `secrets/*`. Nothing else |
| IAM user `velos-studio-api` | the Velos API: start the worker task on this cluster, use the bucket. Nothing else |

## Security

- **The capture browser visits sites users choose**, so it can only reach the public web: all its traffic goes through
  a proxy inside the worker (`Questera-Backend/studio/egress.cjs`) that resolves every name itself and refuses private,
  loopback and link-local addresses, including public names that point at them. Fonts, stylesheets and logos fetched by
  the worker go through the same check, at connection time and on every redirect. The worker's VPC contains nothing
  else, and its security group only allows web traffic out.
- **Product logins** are sealed with AES-256-GCM using a new key per run. The sealed login goes to S3 and the key goes to
  the task's start request, so neither one alone reveals the password. The worker deletes the login as soon as it reads
  it, and S3 expires anything left after a day. Logins are never written to `job.json` or the logs.
- The worker has no access to the Velos database or the Velos JWT secret.

## Velos API settings

`aws-setup.sh` writes these to `Questera-Backend/.env`. Copy them to the production environment and add the first two:

```
STUDIO_ENABLED=true
STUDIO_RUNNER=fargate
STUDIO_AWS_REGION=us-east-2
STUDIO_BUCKET=velos-studio-339254022461-us-east-2
STUDIO_ECS_CLUSTER=velos-studio
STUDIO_ECS_TASK=velos-studio-worker
STUDIO_ECS_SUBNETS=…
STUDIO_ECS_SECURITY_GROUPS=…
STUDIO_AWS_ACCESS_KEY_ID=…        # velos-studio-api
STUDIO_AWS_SECRET_ACCESS_KEY=…
STUDIO_PUBLIC_API_URL=https://<your Velos API host>/api/studio   # permanent video links for autopilot posts
```

The API no longer needs Chrome or ffmpeg once `STUDIO_RUNNER=fargate` is set.

## Deploying changes

```sh
deploy/studio/deploy.sh             # build (linux/amd64), push to ECR, register a new task definition revision
```

New jobs use the new image straight away; jobs already running finish on the old one. The scene templates, music and
the worker code all ship in the image, so any change under `studio/` or `Questera-Backend/studio/` needs a deploy.
API-side changes (`router.cjs`, `jobs.cjs`, `store.cjs`, `launch.cjs`) ship with the Velos backend as usual.

To recreate or update the AWS resources: `AWS_PROFILE=zealoop STUDIO_ENV_FILE=Questera-Backend/.env deploy/studio/aws-setup.sh`
(safe to run again; it creates the API user's access key only if the env file has none).

## Running and debugging

- Watch a job: CloudWatch Logs → `/velos-studio/worker`, stream `job/worker/<task id>`. The task id is in `job.worker.task`.
- A worker that stops reporting for 20 minutes (`STUDIO_STALE_MINUTES`) leaves its job "failed", ready for Retry. A run
  is stopped after 40 minutes (`STUDIO_MAX_MINUTES`).
- Test the S3 + worker path on your machine without ECS: `STUDIO_RUNNER=process npm run studio:dev`.

## Cost

About 2–3 cents of Fargate per two-video job at 8 vCPU. Add S3 storage for kept videos (around 20–40 MB per job) and
OpenRouter tokens. ECR, logs and the VPC cost next to nothing. There is no NAT gateway and no idle server.
