# Deploy on DigitalOcean App Platform

This setup uses two DigitalOcean App Platform apps.

1. `pedi-growth-backend` for FastAPI and XGBoost.
2. `pedi-growth-frontend` for Next.js.

Deploy backend first, then frontend.

## 0) Prerequisites

1. Connect GitHub repository `armageden/Pedi-Growth` to DigitalOcean.
2. Use branch `main`.
3. Prepare secrets:
4. `NEXT_PUBLIC_SUPABASE_URL`
5. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. `SUPABASE_SERVICE_ROLE_KEY`
7. Optional AI keys: `DASHSCOPE_API_KEY`, `OPENAI_API_KEY`.

## 1) Create Backend App

1. Open DigitalOcean Dashboard.
2. Go to Apps.
3. Click Create App.
4. Select repo `armageden/Pedi-Growth` and branch `main`.
5. Choose Web Service.
6. Set Source Directory to `/`.
7. Set Type to Dockerfile.
8. Set Dockerfile Path to `Dockerfile.backend`.
9. Set HTTP Port to `8000`.
10. Set instance size to at least `1 vCPU / 2 GB`.
11. Set health check path to `/health`.
12. Set health check initial delay to `60s`.
13. Add backend environment variables from `.env.digitalocean.backend.example`.
14. Deploy and copy backend URL.

## 2) Create Frontend App

1. Create a second App Platform app from the same repo and branch.
2. Choose Web Service with Node.js buildpack.
3. Set Source Directory to `/`.
4. Set Build Command to `npm ci && npm run build`.
5. Set Run Command to `npm run start -- -H 0.0.0.0 -p 3000`.
6. Set HTTP Port to `3000`.
7. Set instance size to `1 vCPU / 1 GB`.
8. Add frontend environment variables from `.env.digitalocean.frontend.example`.
9. Set `GAIT_PIPELINE_API_URL` to backend URL from step 1.
10. Deploy and copy frontend URL.

## 3) Update Backend CORS

1. Open backend app settings.
2. Set `CORS_ALLOW_ORIGINS` to include frontend domain.
3. Include custom domain too if you already have one.
4. Redeploy backend.

Example value:

```text
https://<frontend-domain>.ondigitalocean.app,https://app.yourdomain.com
```

## 4) Validate End to End

1. Check backend health:

```bash
curl https://<backend-domain>/health
```

1. Check frontend reachability:

```bash
curl -I https://<frontend-domain>
```

1. Check frontend to backend proxy:

```bash
curl https://<frontend-domain>/api/pipeline/health
```

1. Run browser smoke test.
1. Open `/start`.
1. Complete intake.
1. Run one analysis flow.

## 5) Custom Domain and TLS

1. Add custom domain to frontend app.
2. Apply DNS records shown by DigitalOcean.
3. Wait for managed TLS to become active.
4. Optionally add a custom domain for backend.
5. Update `GAIT_PIPELINE_API_URL` and `CORS_ALLOW_ORIGINS` to final domains.

## 6) Rollback

1. Open the app in DigitalOcean.
2. Open Deployments tab.
3. Restore previous successful deployment.

Keep frontend and backend as separate apps for independent rollback.

## 7) Cost Controls

1. Start with one instance per app.
2. Keep backend at 2 GB first and scale only if needed.
3. Set budget alert at 60 USD per month.
4. Keep autoscaling disabled until real traffic appears.

## 8) Optional doctl Automation

1. Update placeholders in `deploy/digitalocean/backend-app-spec.yaml`.
2. Update placeholders in `deploy/digitalocean/frontend-app-spec.yaml`.
3. Create backend app:

```bash
doctl apps create --spec deploy/digitalocean/backend-app-spec.yaml
```

1. Create frontend app:

```bash
doctl apps create --spec deploy/digitalocean/frontend-app-spec.yaml
```

## 9) Local Env Validation Helper

1. Create local env files from examples.
2. Validate backend env file.
3. Validate frontend env file.

```bash
cp .env.digitalocean.backend.example .env.digitalocean.backend
cp .env.digitalocean.frontend.example .env.digitalocean.frontend
node scripts/deploy/check_digitalocean_env.mjs --target backend --file .env.digitalocean.backend
node scripts/deploy/check_digitalocean_env.mjs --target frontend --file .env.digitalocean.frontend
```
