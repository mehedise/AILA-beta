# Deployment guide (AILA)

Repeatable workflow used for Production + Development. One Vercel project, GitHub branch protection, separate backend resources per environment.

## Environments

| Name | Git branch | Vercel | URL (example) |
|------|------------|--------|----------------|
| **Local** | any | `npm run dev` | `http://localhost:3000` |
| **Development** | `develop` | Preview | `https://aila-beta-git-develop-<team>.vercel.app` |
| **Production** | `main` | Production | `https://aila-beta.vercel.app` |

**Vercel settings:** Production Branch = `main`, Preview deployments enabled.

## External services (per environment)

Create **separate** resources for Development vs Production:

| Service | Development | Production |
|---------|-------------|------------|
| **Neon** | dev DB / branch | prod DB |
| **Clerk** | Development app (`pk_test_`) | Same test app until custom domain; then Production app |
| **R2** | `aila-development` bucket | `aila-production` bucket |
| **OpenAI** | API key (can share) | API key |
| **Inngest** | Preview keys + branch env | Production keys |

### Vercel environment variables

Same **names**, different **values**. Set scope correctly:

| Variable | Preview (develop) | Production (main) |
|----------|-------------------|-------------------|
| `DATABASE_URL` | dev Neon | prod Neon |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | dev Clerk | prod Clerk |
| `CLERK_SECRET_KEY` | dev Clerk | prod Clerk |
| `R2_*` | dev bucket + token | prod bucket + token |
| `OPENAI_API_KEY` | your key | your key |
| `INNGEST_EVENT_KEY` | dev | prod |
| `INNGEST_SIGNING_KEY` | dev | prod |

Optional Production-only:

- `INNGEST_SERVE_ORIGIN` = `https://aila-beta.vercel.app`

After changing env vars → **Redeploy** that environment (or merge a commit).

## Database schema

When schema changes, run against **each** database:

```bash
DATABASE_URL="<dev-url>" npm run db:push
psql "<dev-url>" -f drizzle/0001_large_imports.sql   # if needed

DATABASE_URL="<prod-url>" npm run db:push
psql "<prod-url>" -f drizzle/0001_large_imports.sql
```

## Standard release flow (code changes)

GitHub **requires PRs** — do not push directly to `develop` or `main`.

### 1. Branch from `develop`

```bash
git checkout develop
git pull origin develop
git checkout -b fix/my-change
```

### 2. Commit and push feature branch

```bash
git add ...
git commit -m "Describe the change"
git push -u origin fix/my-change
```

### 3. Merge to Development (Preview)

```bash
gh pr create --base develop --head fix/my-change \
  --title "Your title" \
  --body "## Summary\n...\n\n## Test plan\n- [ ] ..."
gh pr merge --merge --delete-branch
```

Vercel deploys **Preview** from `develop`. Test on the Preview URL.

### 4. Release to Production

```bash
gh pr create --base main --head develop \
  --title "Release: short description" \
  --body "Merges tested changes from develop."
gh pr merge --merge
```

Vercel deploys **Production** from `main`. Test on `https://aila-beta.vercel.app`.

**Shortcut:** from repo root after local commits on a feature branch:

```bash
./scripts/release.sh "Your PR title"
```

That opens PR → `develop`, merges, then PR `develop` → `main`, merges.

## Inngest after deploy

1. [app.inngest.com](https://app.inngest.com) → app **aila**
2. **Production** → URL `https://aila-beta.vercel.app/api/inngest`
3. Confirm app is healthy (no sync errors)
4. Upload a test file → check **Runs**

**Plan limits (free tier):** function concurrency ≤ 5, `classify-lead` batch ≤ 5.

**Deployment Protection:** must be off or use Inngest Vercel integration bypass secret, or sync fails with `Unauthorized`.

## Clerk

- `*.vercel.app` works with **Development** Clerk app only
- Production Clerk instance needs a **custom domain** you own
- Add every hostname you use under Clerk → **Domains**

## R2 CORS

Each bucket needs CORS for the URLs that upload from the browser:

- `http://localhost:3000`
- Preview URL (`git-develop-…`)
- Production URL (`aila-beta.vercel.app`)

## Upload limits (Vercel)

| Size | Path |
|------|------|
| ≤ 4 MB | Direct `POST /api/upload` |
| > 4 MB | R2 multipart (required on Vercel) |
| > 50 MB | Multipart + large PDF pipeline |

## Local development

```bash
cp .env.example .env.local   # fill dev credentials
npm install                  # copies pdf.worker via postinstall
npm run db:push
npm run dev
```

Second terminal:

```bash
npx inngest-cli@latest dev
```

## Checklist after Production deploy

- [ ] Vercel deployment **Ready** on `main`
- [ ] `GET /api/imports` returns 200 when signed in
- [ ] Inngest app **aila** synced, no errors
- [ ] Upload small xlsx (< 4 MB) works
- [ ] Upload ~10 MB PDF works (multipart)
- [ ] Inngest **Runs** show `process-pdf` / `process-xlsx` completing
