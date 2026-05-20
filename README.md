# AILA — AI Lead Import

Upload Excel spreadsheets or business-card PDFs (1 card per page). AILA extracts contact data with OpenAI, verifies fields against card images, classifies industry (LinkedIn taxonomy), and lets you review before saving leads.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind + shadcn/ui
- **Clerk** — authentication
- **Neon Postgres** + Drizzle ORM
- **Cloudflare R2** — file storage
- **Inngest** — background jobs
- **OpenAI** `gpt-4.1-mini` — text extraction, vision verification, industry classification

## Prerequisites

1. [Neon](https://neon.tech) database — copy `DATABASE_URL`
2. [Clerk](https://clerk.com) app — copy publishable + secret keys
3. [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket — create API token with read/write
4. [OpenAI](https://platform.openai.com) API key
5. [Inngest](https://www.inngest.com) — optional for local dev (CLI works without cloud keys)

## Setup

```bash
cp .env.example .env.local
# Fill in all values in .env.local

npm install
npm run db:push    # push schema to Neon
# For large-import scalability columns, also run:
# psql $DATABASE_URL -f drizzle/0001_large_imports.sql
npm run dev        # http://localhost:3000
```

In a **second terminal**, run the Inngest dev server:

```bash
npx inngest-cli@latest dev
```

Open the Inngest UI (usually http://localhost:8288) and confirm these functions appear:

- `process-xlsx`
- `process-pdf` / `process-pdf-large`
- `extract-page` / `extract-page-batch`
- `enrich-lead`
- `classify-lead`
- `bulk-approve-import` / `bulk-export-import` / `bulk-enrich-import`

## Environment variables

See [`.env.example`](.env.example) for the full list.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `OPENAI_API_KEY` | OpenAI API key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Bucket name (default: `aila`) |
| `R2_PUBLIC_BASE_URL` | Optional public bucket URL |
| `INNGEST_EVENT_KEY` | Inngest event key (production) |
| `INNGEST_SIGNING_KEY` | Inngest signing key (production) |

## Usage

1. Sign in at `/sign-in`
2. Go to **Imports** → upload `.xlsx` or `.pdf`
3. Wait for processing (polls every 3s)
4. Open the import → **Review** each extracted lead
5. **Approve** to save to **Leads**

### Excel format

Fixed column headers (case-insensitive):

`Name`, `Company`, `Phone`, `Email`, `Website`, `Logo`

### PDF format

- One business card per page
- Text-readable PDFs work best (text layer + vision verification)
- Scanned/blurry cards are flagged in the review UI

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Drizzle schema to Neon |
| `npm run db:studio` | Open Drizzle Studio |
| `npx inngest-cli@latest dev` | Local Inngest dev server |

## Deployment (Vercel + Inngest Cloud)

1. Deploy to [Vercel](https://vercel.com) with all env vars
2. Connect [Inngest Cloud](https://www.inngest.com) to your Vercel app URL
3. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel
4. Ensure R2 CORS allows your Vercel domain if using public URLs

## Cost estimate

At low volume (few PDFs/week), expect roughly **$5–10/month** total (mostly OpenAI; infrastructure can stay on free tiers).
