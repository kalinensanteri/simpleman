# Simpleman

Landing page, contact page and waitlist for getsimpleman.com, served by a Cloudflare Worker.

- `public/` – static pages and images
- `worker/index.js` – waitlist API (`POST /api/waitlist`) and the password-protected dataroom (`/dataroom`)
- `worker/schema.sql` – D1 table for waitlist submissions

## Dataroom

Open `https://getsimpleman.com/dataroom`. The browser asks for a username (anything) and the password set with `npx wrangler secret put DATAROOM_PASSWORD`. From there you can read every submission, export CSV and delete entries.

## Local development

```
npm install
npm run db:init:local
npm run dev
```

Put `DATAROOM_PASSWORD=...` in `.dev.vars` for local testing.

## Deploy

```
npm run deploy
```
