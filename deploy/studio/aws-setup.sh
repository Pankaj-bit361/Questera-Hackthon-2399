#!/usr/bin/env bash
# Creates (or brings up to date) everything Velos Studio needs in AWS. Safe to run again.
#
#   AWS_PROFILE=zealoop STUDIO_ENV_FILE=Questera-Backend/.env deploy/studio/aws-setup.sh
#
# Creates: an ECR repository for the worker image, a private S3 bucket, a separate VPC (public subnets, no NAT, worker
# security group with no inbound and only HTTP/HTTPS out), a log group, the OpenRouter key in SSM Parameter Store, the
# ECS cluster, the worker's roles, and an IAM user for the Velos API that can only start workers and use the bucket.
#
# Writes the API settings (including the API user's access key, created once) into STUDIO_ENV_FILE without printing
# secrets. The OpenRouter key is read from OPENROUTER_API_KEY in that file the first time.
set -euo pipefail

PROFILE=${AWS_PROFILE:-zealoop}
REGION=${STUDIO_AWS_REGION:-us-east-2}
NAME=velos-studio
ENV_FILE=${STUDIO_ENV_FILE:-}
HERE=$(cd "$(dirname "$0")" && pwd)

aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }
say() { printf '  %s\n' "$*"; }
tag() { echo "ResourceType=$1,Tags=[{Key=Name,Value=$2},{Key=app,Value=$NAME}]"; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=${STUDIO_BUCKET:-$NAME-$ACCOUNT-$REGION}
echo "Velos Studio → account $ACCOUNT, $REGION"

# ── image repository ─────────────────────────────────────────────────────────
aws ecr describe-repositories --repository-names "$NAME-worker" >/dev/null 2>&1 ||
  aws ecr create-repository --repository-name "$NAME-worker" --image-scanning-configuration scanOnPush=true >/dev/null
aws ecr put-lifecycle-policy --repository-name "$NAME-worker" --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"description":"Keep the last 10 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' >/dev/null
say "ECR $NAME-worker"

# ── bucket ───────────────────────────────────────────────────────────────────
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  if [ "$REGION" = us-east-1 ]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null; fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"logins","Filter":{"Prefix":"secrets/"},"Status":"Enabled","Expiration":{"Days":1}},{"ID":"uploads","Filter":{"Prefix":""},"Status":"Enabled","AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}' >/dev/null
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TLSOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$BUCKET\",\"arn:aws:s3:::$BUCKET/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
say "S3 $BUCKET (private, encrypted, logins expire after a day)"

# ── network: its own VPC, so workers can't reach anything else in the account ─
VPC=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=$NAME" --query 'Vpcs[0].VpcId' --output text)
if [ "$VPC" = None ]; then
  VPC=$(aws ec2 create-vpc --cidr-block 10.80.0.0/16 --tag-specifications "$(tag vpc $NAME)" --query Vpc.VpcId --output text)
  aws ec2 wait vpc-available --vpc-ids "$VPC"
  aws ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-hostnames '{"Value":true}'
fi
IGW=$(aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VPC" --query 'InternetGateways[0].InternetGatewayId' --output text)
if [ "$IGW" = None ]; then
  IGW=$(aws ec2 create-internet-gateway --tag-specifications "$(tag internet-gateway $NAME)" --query InternetGateway.InternetGatewayId --output text)
  aws ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
fi
RT=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" "Name=tag:Name,Values=$NAME-public" --query 'RouteTables[0].RouteTableId' --output text)
if [ "$RT" = None ]; then
  RT=$(aws ec2 create-route-table --vpc-id "$VPC" --tag-specifications "$(tag route-table $NAME-public)" --query RouteTable.RouteTableId --output text)
  aws ec2 create-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW" >/dev/null
fi
SUBNETS=()
i=0
for AZ in $(aws ec2 describe-availability-zones --query 'AvailabilityZones[?State==`available`].ZoneName' --output text | tr '\t' '\n' | head -3); do
  i=$((i + 1))
  SN=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" "Name=availability-zone,Values=$AZ" --query 'Subnets[0].SubnetId' --output text)
  if [ "$SN" = None ]; then
    SN=$(aws ec2 create-subnet --vpc-id "$VPC" --availability-zone "$AZ" --cidr-block "10.80.$i.0/24" --tag-specifications "$(tag subnet $NAME-$AZ)" --query Subnet.SubnetId --output text)
    aws ec2 modify-subnet-attribute --subnet-id "$SN" --map-public-ip-on-launch
    aws ec2 associate-route-table --route-table-id "$RT" --subnet-id "$SN" >/dev/null
  fi
  SUBNETS+=("$SN")
done
# S3 traffic stays inside AWS (free gateway endpoint).
if [ "$(aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC" "Name=service-name,Values=com.amazonaws.$REGION.s3" --query 'length(VpcEndpoints)')" = 0 ]; then
  aws ec2 create-vpc-endpoint --vpc-id "$VPC" --vpc-endpoint-type Gateway --service-name "com.amazonaws.$REGION.s3" --route-table-ids "$RT" >/dev/null
fi
SG=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC" "Name=group-name,Values=$NAME-worker" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = None ]; then
  SG=$(aws ec2 create-security-group --vpc-id "$VPC" --group-name "$NAME-worker" --description "Studio workers: no inbound, web out only" --query GroupId --output text)
  aws ec2 revoke-security-group-egress --group-id "$SG" --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' >/dev/null
  aws ec2 authorize-security-group-egress --group-id "$SG" --ip-permissions '[{"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' >/dev/null
fi
SUBNET_LIST=$(IFS=,; echo "${SUBNETS[*]}")
say "VPC $VPC, subnets $SUBNET_LIST, security group $SG"

# ── logs, OpenRouter key ─────────────────────────────────────────────────────
aws logs create-log-group --log-group-name "/$NAME/worker" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "/$NAME/worker" --retention-in-days 30
PARAM="/$NAME/openrouter-api-key"
if ! aws ssm get-parameter --name "$PARAM" >/dev/null 2>&1; then
  KEY=${OPENROUTER_API_KEY:-}
  if [ -z "$KEY" ] && [ -n "$ENV_FILE" ]; then KEY=$(grep -E '^OPENROUTER_API_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'); fi
  [ -n "$KEY" ] || { echo "OPENROUTER_API_KEY is needed the first time (env or STUDIO_ENV_FILE)." >&2; exit 1; }
  TMP=$(mktemp); chmod 600 "$TMP"
  printf '{"Name":"%s","Type":"SecureString","Value":"%s"}' "$PARAM" "$KEY" > "$TMP"
  aws ssm put-parameter --cli-input-json "file://$TMP" >/dev/null
  rm -f "$TMP"
fi
say "logs /$NAME/worker, key in SSM $PARAM"

# ── roles ────────────────────────────────────────────────────────────────────
TRUST="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\",\"Condition\":{\"StringEquals\":{\"aws:SourceAccount\":\"$ACCOUNT\"}}}]}"
for ROLE in "$NAME-execution" "$NAME-worker"; do
  aws iam get-role --role-name "$ROLE" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$TRUST" >/dev/null
done
aws iam attach-role-policy --role-name "$NAME-execution" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name "$NAME-execution" --policy-name read-openrouter-key --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:GetParameters\",\"Resource\":\"arn:aws:ssm:$REGION:$ACCOUNT:parameter$PARAM\"}]}"
aws iam put-role-policy --role-name "$NAME-worker" --policy-name job-files --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/jobs/*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/secrets/*\"},
    {\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::$BUCKET\",\"Condition\":{\"StringLike\":{\"s3:prefix\":\"jobs/*\"}}}]}"
say "roles $NAME-execution, $NAME-worker (job files only)"

# ── cluster ──────────────────────────────────────────────────────────────────
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com >/dev/null 2>&1 || true
# A brand-new ECS service-linked role takes a few seconds to be usable.
for try in 1 2 3 4 5 6 7 8; do
  aws ecs create-cluster --cluster-name "$NAME" --capacity-providers FARGATE --settings name=containerInsights,value=disabled >/dev/null 2>&1 && break
  [ "$try" = 8 ] && { echo "Could not create the ECS cluster." >&2; exit 1; }
  sleep 10
done
say "ECS cluster $NAME"

# ── the Velos API's identity: start workers, use the bucket, nothing else ────
USER_NAME="$NAME-api"
aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1 ||
  aws iam create-user --user-name "$USER_NAME" >/dev/null
aws iam put-user-policy --user-name "$USER_NAME" --policy-name studio-api --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecs:RunTask\",\"Resource\":\"arn:aws:ecs:$REGION:$ACCOUNT:task-definition/$NAME-worker:*\",\"Condition\":{\"ArnEquals\":{\"ecs:cluster\":\"arn:aws:ecs:$REGION:$ACCOUNT:cluster/$NAME\"}}},
    {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":[\"arn:aws:iam::$ACCOUNT:role/$NAME-execution\",\"arn:aws:iam::$ACCOUNT:role/$NAME-worker\"],\"Condition\":{\"StringEquals\":{\"iam:PassedToService\":\"ecs-tasks.amazonaws.com\"}}},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":[\"arn:aws:s3:::$BUCKET/jobs/*\",\"arn:aws:s3:::$BUCKET/users/*\",\"arn:aws:s3:::$BUCKET/secrets/*\"]},
    {\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::$BUCKET\"}]}"
say "IAM user $USER_NAME"

if [ -n "$ENV_FILE" ]; then
  setenv() {
    local k=$1 v=$2
    if grep -qE "^$k=" "$ENV_FILE"; then
      local tmp; tmp=$(mktemp); chmod 600 "$tmp"
      awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{print k "=" v; next} {print}' "$ENV_FILE" > "$tmp" && cat "$tmp" > "$ENV_FILE" && rm -f "$tmp"
    else
      printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
    fi
  }
  grep -q '^# Velos Studio' "$ENV_FILE" || printf '\n# Velos Studio (deploy/studio/aws-setup.sh). Set STUDIO_ENABLED=true and STUDIO_RUNNER=fargate to use it.\n' >> "$ENV_FILE"
  setenv STUDIO_AWS_REGION "$REGION"
  setenv STUDIO_BUCKET "$BUCKET"
  setenv STUDIO_ECS_CLUSTER "$NAME"
  setenv STUDIO_ECS_TASK "$NAME-worker"
  setenv STUDIO_ECS_SUBNETS "$SUBNET_LIST"
  setenv STUDIO_ECS_SECURITY_GROUPS "$SG"
  if ! grep -qE '^STUDIO_AWS_ACCESS_KEY_ID=.+' "$ENV_FILE"; then
    KEYS=$(aws iam list-access-keys --user-name "$USER_NAME" --query 'length(AccessKeyMetadata)')
    [ "$KEYS" -lt 2 ] || { echo "$USER_NAME already has 2 access keys; delete one in IAM first." >&2; exit 1; }
    read -r AK SK < <(aws iam create-access-key --user-name "$USER_NAME" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
    setenv STUDIO_AWS_ACCESS_KEY_ID "$AK"
    setenv STUDIO_AWS_SECRET_ACCESS_KEY "$SK"
    unset AK SK
    say "new access key for $USER_NAME written to $ENV_FILE"
  fi
  say "settings written to $ENV_FILE"
fi

cat > "$HERE/.aws-outputs" <<EOF
PROFILE=$PROFILE
REGION=$REGION
ACCOUNT=$ACCOUNT
BUCKET=$BUCKET
CLUSTER=$NAME
SUBNETS=$SUBNET_LIST
SECURITY_GROUP=$SG
EOF
echo "Done. Next: deploy/studio/deploy.sh (build, push and register the worker image)."
