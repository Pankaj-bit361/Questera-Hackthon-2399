#!/usr/bin/env bash
# Creates (or brings up to date) the CI/CD pipeline for the Velos API. Safe to run again.
#
#   AWS_PROFILE=zealoop deploy/velos/pipeline-setup.sh
#
# A push to main that touches the API → CodeBuild (deploy/velos/buildspec.yml: npm ci, module load check) → Elastic
# Beanstalk deploy to Velos-env. Creates: a private artifact bucket, a GitHub connection, the build project, the
# pipeline (V2, filtered to API paths so frontend-only pushes don't redeploy the backend) and their two roles.
#
# The GitHub connection starts as PENDING: someone has to approve it once in the console (Developer Tools → Settings →
# Connections → velos-github → Update pending connection) and install the AWS Connector app on the repo.
set -euo pipefail

PROFILE=${AWS_PROFILE:-zealoop}
REGION=${VELOS_AWS_REGION:-us-east-1}
NAME=velos-backend
REPO=${VELOS_REPO:-Pankaj-bit361/Questera-Hackthon-2399}
BRANCH=${VELOS_BRANCH:-main}
EB_APP=${VELOS_EB_APP:-Velos}
EB_ENV=${VELOS_EB_ENV:-Velos-env}

aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }
say() { printf '  %s\n' "$*"; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=velos-pipeline-$ACCOUNT-$REGION
echo "Velos API pipeline → account $ACCOUNT, $REGION ($REPO@$BRANCH → $EB_APP/$EB_ENV)"
aws elasticbeanstalk describe-environments --application-name "$EB_APP" --environment-names "$EB_ENV" \
  --query 'Environments[?Status!=`Terminated`].EnvironmentName' --output text | grep -q . ||
  { echo "Elastic Beanstalk environment $EB_APP/$EB_ENV not found in $REGION" >&2; exit 1; }

# ── artifact bucket ──────────────────────────────────────────────────────────
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  if [ "$REGION" = us-east-1 ]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null; fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"old-builds","Filter":{"Prefix":""},"Status":"Enabled","Expiration":{"Days":30},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}' >/dev/null
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TLSOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$BUCKET\",\"arn:aws:s3:::$BUCKET/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
say "S3 $BUCKET (private, encrypted, builds kept 30 days)"

# ── GitHub connection ────────────────────────────────────────────────────────
CONNECTION=$(aws codeconnections list-connections --provider-type-filter GitHub \
  --query "Connections[?ConnectionName=='velos-github'].ConnectionArn | [0]" --output text)
if [ "$CONNECTION" = None ]; then
  CONNECTION=$(aws codeconnections create-connection --provider-type GitHub --connection-name velos-github --query ConnectionArn --output text)
fi
STATUS=$(aws codeconnections get-connection --connection-arn "$CONNECTION" --query Connection.ConnectionStatus --output text)
say "connection velos-github ($STATUS)"

# ── roles ────────────────────────────────────────────────────────────────────
role() { # name, service principal, inline policy
  aws iam get-role --role-name "$1" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$1" --assume-role-policy-document \
      "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"$2\"},\"Action\":\"sts:AssumeRole\"}]}" >/dev/null
  aws iam put-role-policy --role-name "$1" --policy-name "$1" --policy-document "$3"
}
ARTIFACTS="\"arn:aws:s3:::$BUCKET\",\"arn:aws:s3:::$BUCKET/*\""

role "$NAME-build" codebuild.amazonaws.com "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/codebuild/$NAME*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:PutObject\",\"s3:GetBucketLocation\"],\"Resource\":[$ARTIFACTS]}]}"

# Elastic Beanstalk deploys through CloudFormation and changes the environment's instances, load balancer and scaling
# group, so the pipeline's role needs those services (AWS's own CodePipeline + Beanstalk policy, minus the extras).
role "$NAME-pipeline" codepipeline.amazonaws.com "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:PutObject\",\"s3:GetBucketVersioning\",\"s3:GetBucketLocation\",\"s3:ListBucket\"],\"Resource\":[$ARTIFACTS]},
  {\"Effect\":\"Allow\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::elasticbeanstalk-*\",\"arn:aws:s3:::elasticbeanstalk-*/*\"]},
  {\"Effect\":\"Allow\",\"Action\":[\"codeconnections:UseConnection\",\"codestar-connections:UseConnection\"],\"Resource\":\"$CONNECTION\"},
  {\"Effect\":\"Allow\",\"Action\":[\"codebuild:StartBuild\",\"codebuild:BatchGetBuilds\"],\"Resource\":\"arn:aws:codebuild:$REGION:$ACCOUNT:project/$NAME\"},
  {\"Effect\":\"Allow\",\"Action\":[\"elasticbeanstalk:*\",\"ec2:*\",\"elasticloadbalancing:*\",\"autoscaling:*\",\"cloudwatch:*\",\"cloudformation:*\",\"sns:*\",\"logs:*\"],\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":\"*\",\"Condition\":{\"StringEqualsIfExists\":{\"iam:PassedToService\":[\"elasticbeanstalk.amazonaws.com\",\"ec2.amazonaws.com\"]}}}]}"
say "roles $NAME-build, $NAME-pipeline"
sleep 10 # new roles take a moment before CodeBuild and CodePipeline accept them

# ── build project ────────────────────────────────────────────────────────────
PROJECT=(--name "$NAME" --description "Velos API: npm ci + module check, for the $NAME pipeline"
  --source "type=CODEPIPELINE,buildspec=deploy/velos/buildspec.yml"
  --artifacts type=CODEPIPELINE
  --environment "type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux-x86_64-standard:5.0,computeType=BUILD_GENERAL1_SMALL"
  --service-role "arn:aws:iam::$ACCOUNT:role/$NAME-build" --timeout-in-minutes 20
  --logs-config "cloudWatchLogs={status=ENABLED,groupName=/aws/codebuild/$NAME}")
if aws codebuild batch-get-projects --names "$NAME" --query 'projects[0].name' --output text | grep -q "$NAME"; then
  aws codebuild update-project "${PROJECT[@]}" >/dev/null
else
  aws codebuild create-project "${PROJECT[@]}" >/dev/null
fi
say "CodeBuild $NAME"

# ── pipeline ─────────────────────────────────────────────────────────────────
# Paths the API bundle is built from (deploy/velos/buildspec.yml); a push touching none of them doesn't run it.
PATHS='"Questera-Backend/**","studio/remotion/**","Procfile",".ebextensions/**",".platform/**","deploy/velos/**"'
PIPELINE=$(cat <<JSON
{"pipeline":{"name":"$NAME","pipelineType":"V2","executionMode":"QUEUED",
 "roleArn":"arn:aws:iam::$ACCOUNT:role/$NAME-pipeline",
 "artifactStore":{"type":"S3","location":"$BUCKET"},
 "stages":[
  {"name":"Source","actions":[{"name":"GitHub","actionTypeId":{"category":"Source","owner":"AWS","provider":"CodeStarSourceConnection","version":"1"},
    "configuration":{"ConnectionArn":"$CONNECTION","FullRepositoryId":"$REPO","BranchName":"$BRANCH","OutputArtifactFormat":"CODE_ZIP"},
    "outputArtifacts":[{"name":"Source"}]}]},
  {"name":"Build","actions":[{"name":"Build","actionTypeId":{"category":"Build","owner":"AWS","provider":"CodeBuild","version":"1"},
    "configuration":{"ProjectName":"$NAME"},"inputArtifacts":[{"name":"Source"}],"outputArtifacts":[{"name":"Bundle"}]}]},
  {"name":"Deploy","actions":[{"name":"ElasticBeanstalk","actionTypeId":{"category":"Deploy","owner":"AWS","provider":"ElasticBeanstalk","version":"1"},
    "configuration":{"ApplicationName":"$EB_APP","EnvironmentName":"$EB_ENV"},"inputArtifacts":[{"name":"Bundle"}]}]}],
 "triggers":[{"providerType":"CodeStarSourceConnection","gitConfiguration":{"sourceActionName":"GitHub",
   "push":[{"branches":{"includes":["$BRANCH"]},"filePaths":{"includes":[$PATHS]}}]}}]}}
JSON
)
if aws codepipeline get-pipeline --name "$NAME" >/dev/null 2>&1; then
  aws codepipeline update-pipeline --cli-input-json "$PIPELINE" >/dev/null
else
  aws codepipeline create-pipeline --cli-input-json "$PIPELINE" >/dev/null
fi
say "CodePipeline $NAME"

echo
if [ "$STATUS" != AVAILABLE ]; then
  echo "Next: approve the GitHub connection once, then the pipeline runs on every push to $BRANCH:"
  echo "  https://$REGION.console.aws.amazon.com/codesuite/settings/connections?region=$REGION"
else
  echo "Pipeline: https://$REGION.console.aws.amazon.com/codesuite/codepipeline/pipelines/$NAME/view?region=$REGION"
fi
