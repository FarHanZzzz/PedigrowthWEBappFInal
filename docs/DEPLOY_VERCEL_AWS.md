# Deploy on Vercel + AWS

Recommended split architecture:

- Frontend and Next.js API routes on Vercel.
- Python FastAPI gait backend on AWS App Runner.

This keeps the UI globally fast on Vercel and runs the Python inference service in AWS with container-native scaling.

## 1) Deploy Backend to AWS App Runner

### 1.1 Prerequisites

- AWS CLI configured (`aws configure`)
- Docker installed locally
- IAM role for App Runner to pull from ECR

### 1.2 Create ECR repository (one-time)

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO=pedi-growth-backend

aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1 || \
aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION"
```

### 1.3 Build and push backend image

```bash
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -f Dockerfile.backend -t "$ECR_REPO:latest" .
docker tag "$ECR_REPO:latest" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
```

### 1.4 Create App Runner service

1. Copy `deploy/aws/apprunner-service.json` and replace:

- account ID
- region
- IAM role ARN
- image URI

1. Create service:

```bash
aws apprunner create-service --cli-input-json file://deploy/aws/apprunner-service.json --region "$AWS_REGION"
```

1. Get service URL:

```bash
aws apprunner list-services --region "$AWS_REGION" --query "ServiceSummaryList[?ServiceName=='pedi-growth-backend'].ServiceUrl" --output text
```

Expected health response:

```bash
curl "https://<service-url>/health"
```

## 2) Configure Backend Runtime Environment

Set backend env vars in App Runner service settings:

- `CORS_ALLOW_ORIGINS=https://<your-vercel-domain>,https://<your-custom-domain>`
- `PORT=8000`

## 3) Deploy Frontend to Vercel

### 3.1 Import project

- In Vercel, create a new project from this repository.
- Framework preset: Next.js (auto-detected).

### 3.2 Configure environment variables in Vercel

Use `.env.vercel.example` as the source list. Required minimum:

- `GAIT_PIPELINE_API_URL=https://<aws-service-url>`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional AI vars:

- `DASHSCOPE_API_KEY`
- `DASHSCOPE_MODEL`

Then trigger deployment.

## 4) Custom Domains

- Add your domain in Vercel (frontend).
- Optionally add a custom domain in App Runner (backend) and use it for `GAIT_PIPELINE_API_URL`.

## 5) Verify End-to-End

After both are live:

```bash
curl -I "https://<your-frontend-domain>"
curl "https://<your-frontend-domain>/api/pipeline/health"
```

If `status` is `ok`, Vercel can reach AWS backend correctly.

## 6) Rolling Updates

Backend update:

```bash
docker build -f Dockerfile.backend -t "$ECR_REPO:latest" .
docker tag "$ECR_REPO:latest" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
```

App Runner with auto-deploy enabled will roll forward automatically when the image tag updates.

Frontend update:

- Push to your tracked branch.
- Vercel auto-deploys preview/production based on project settings.

## Notes

- Frontend browser calls `/api/pipeline/*` on Vercel; these server routes call AWS backend via `GAIT_PIPELINE_API_URL`.
- Keep backend endpoint private to trusted origins and monitor with CloudWatch logs.
