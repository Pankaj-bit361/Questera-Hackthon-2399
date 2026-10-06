#!/usr/bin/env bash
# Builds the Studio worker image, pushes it to ECR and registers a new task definition revision. New jobs use it at
# once; jobs already running finish on the old one. Run deploy/studio/aws-setup.sh first.
#
#   deploy/studio/deploy.sh                 build + push + register
#   SKIP_BUILD=1 deploy/studio/deploy.sh    push the local velos-studio-worker:local image as it is
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
# shellcheck disable=SC1091
. "$HERE/.aws-outputs"
NAME=velos-studio
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$NAME-worker"
TAG=$(date -u +%Y%m%d-%H%M%S)

if [ -z "${SKIP_BUILD:-}" ]; then
  docker build --platform linux/amd64 -f "$HERE/Dockerfile" -t "$NAME-worker:local" "$ROOT"
fi
aws ecr get-login-password | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com" >/dev/null
docker tag "$NAME-worker:local" "$REPO:$TAG"
docker push "$REPO:$TAG" | tail -1
DIGEST=$(aws ecr describe-images --repository-name "$NAME-worker" --image-ids "imageTag=$TAG" --query 'imageDetails[0].imageDigest' --output text)

TASKDEF=$(mktemp)
cat > "$TASKDEF" <<EOF
{
  "family": "$NAME-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "8192",
  "memory": "16384",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "ephemeralStorage": { "sizeInGiB": 30 },
  "executionRoleArn": "arn:aws:iam::$ACCOUNT:role/$NAME-execution",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT:role/$NAME-worker",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "$REPO@$DIGEST",
      "essential": true,
      "stopTimeout": 30,
      "linuxParameters": { "initProcessEnabled": true },
      "environment": [
        { "name": "STUDIO_BUCKET", "value": "$BUCKET" },
        { "name": "STUDIO_AWS_REGION", "value": "$REGION" },
        { "name": "MOTION_LLM_MODEL", "value": "${MOTION_LLM_MODEL:-google/gemini-3.8-flash}" }
      ],
      "secrets": [{ "name": "OPENROUTER_API_KEY", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT:parameter/$NAME/openrouter-api-key" }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/$NAME/worker", "awslogs-region": "$REGION", "awslogs-stream-prefix": "job" }
      }
    }
  ]
}
EOF
REV=$(aws ecs register-task-definition --cli-input-json "file://$TASKDEF" --query 'taskDefinition.revision' --output text)
rm -f "$TASKDEF"
echo "Worker $TAG → task definition $NAME-worker:$REV"
