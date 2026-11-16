# tapdın — international shopping agent for Azerbaijan (MVP)

Customers send a product link or photo from China (1688, Taobao, Pinduoduo), Russia (Ozon, Wildberries), the USA or Europe; staff source, quote in AZN, purchase, inspect and ship.
Regions, marketplaces, currencies and pricing rules are rows in the database (Admin → Settings), not code.
Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · PostgreSQL · Prisma 6 · Zod · React Hook Form · Recharts · Motion · three.js (hero globe).

## Local development

```bash
npm install
cp .env.example .env          # then review the SEED_* demo credentials
npm run db:start              # terminal 1: local PostgreSQL on :54329 (no Docker needed)
npm run db:deploy             # apply migrations
npm run db:seed               # reference data + fictional demo orders
npm run dev                   # http://localhost:3000
```

Demo admin and customer logins are the `SEED_*` values in `.env`. Change them before any public deploy.

Checks: `npm test` (pricing engine, product preview), `npm run typecheck`, `npx tsx scripts/security-check.mts` (access control, needs the dev server running).

## Region availability

`Region.status` (ACTIVE / COMING_SOON) is the single switch, edited in Admin → Settings → Regions and read through `src/lib/regions.ts`.
Today China and Russia are ACTIVE; USA and Europe are COMING_SOON: shown everywhere with a "coming soon" mark, dashed routes
without aircraft, no rates or examples, and refused by the order API (HTTP 409) and by the quotation action.
Launching a region = set it to ACTIVE (and review its rates); no code change is needed.

## Backups

```bash
npm run db:backup                              # → backups/<date-time>/data.json + uploads/
npm run db:restore -- backups/<date-time>      # into an EMPTY database after `npx prisma migrate deploy`
```

The backup is a JSON export of every table plus a copy of the uploaded files; it needs no `pg_dump`. Backups contain
personal data: keep them off public storage and out of git (`backups/` is ignored). On the production server, run
`npm run db:backup` daily from cron and copy the folder off the machine; with a managed database (Supabase, Neon) its own
automatic backups come on top.

## Password reset

`/forgot` sends a one-time link (valid 1 hour, single use, only its hash is stored); `/reset` sets the new password and
signs out every other session. The answer is identical for unknown emails. Needs email (SMTP) in production; in
development the email is saved to `storage/outbox/`.

## Daily job: exchange rates and reminders

`/api/cron/daily` (protected by `CRON_SECRET`) updates every configured currency with today's official rate of the Central Bank
of Azerbaijan (cbar.az XML bulletin) and sends customer reminders once each: quotation expiring within 24 h, accepted but unpaid
for 48 h. Run it once a day from the server's cron:

```
0 10 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tapdin.az/api/cron/daily
```

Admins can also refresh rates by hand (Settings → Exchange rates → Update from CBAR). Each rate shows its source and age in the
quotation form; rates older than two days are flagged. Sent quotations keep their own locked rate.

## Customer notifications

Sent when staff send a quotation, confirm a payment, or move an order to *in transit*, *arrived in Azerbaijan* or *ready for pickup*
(`src/lib/notifications`). Texts follow the customer's language. Every attempt is logged in the `Notification` table and shown on
the admin order page; a failed notification never blocks the staff action.

- **Email**: SMTP settings in `.env` (see `.env.example`). Without `SMTP_HOST` in development, emails are saved to
  `storage/outbox/*.html` instead of being sent — open them in a browser to check. In production without SMTP nothing is sent.
- **WhatsApp**: WhatsApp Cloud API. Business-initiated messages must use templates approved in WhatsApp Manager:
  `tapdin_quote_ready`, `tapdin_payment_confirmed`, `tapdin_order_status`, each with body parameters {{1}} name, {{2}} order number,
  {{3}} amount / status, in az, ru and en. Only customers who ticked the opt-in get WhatsApp messages. **Not tested against Meta yet** —
  no credentials were available.
- Customers switch channels on and off in their dashboard.

## Smart product preview

Pasting a link from an allow-listed store (`src/lib/product-preview/sources.ts`) asks `POST /api/product-preview` for the
first photo and the original price. The server fetches the page itself (allow-listed hosts only, public IPs only — checked at
DNS-resolution time, every redirect re-checked, 9 s / 3 MB limits, honest User-Agent) and reads JSON-LD / Open Graph data.
The order API stores only a result this server produced (`previewImageUrl`, `previewPrice`, `previewCurrency`); the price
is informational and never feeds the quotation.

**Tested on 2026-11-12 against real pages: no store currently returns data to an automated request.** Temu and 1688 answer
with a JavaScript bot challenge, Taobao with a login wall, Ozon with a cookie redirect loop, Wildberries with HTTP 498.
The app shows "the store did not return data" and the customer continues manually. These protections are not bypassed;
working previews would need an official partner API or feed per store. Re-test with
`npx tsx scripts/probe-preview.mts <product-url>`.

## Structure

- `src/components/globe/` — WebGL globe (`globe.tsx`), flat route map (`world-map.tsx`); continent dots are generated by `node scripts/build-globe-data.mjs` from Natural Earth data. The aircraft are a brand visualisation, not shipment tracking.
- `src/components/hero/`, `src/components/home/` — scroll-driven hero, process rail, request console
- `src/app/globals.css` — dark design tokens (single source of colour)

- `prisma/` — schema, migrations, seed
- `src/lib/pricing/engine.ts` — pure pricing engine (server is the source of truth)
- `src/lib/integrations/` — ports for marketplaces, payments, cargo, FX, image search (manual fallbacks only)
- `src/lib/product-preview/` — store allow-list, SSRF-safe fetcher, JSON-LD / Open Graph parser, tests
- `src/lib/storage/` — storage adapter (local disk; Supabase adapter written but untested)
- `src/app/(site)` — public site, order form, customer dashboard
- `src/app/admin` — admin panel (orders, quotations, customers, settings, analytics)
- `src/i18n/messages` — az / ru / en dictionaries (locale stored in a cookie)

## Deployment

1. Provision PostgreSQL (Supabase, Neon, RDS…) and set `DATABASE_URL`, `APP_URL`.
2. `npm ci && npx prisma migrate deploy && npm run build && npm start` on a Node 20+ host.
3. Seed once with strong `SEED_*` passwords.
4. Uploads: on a VPS keep `STORAGE_DRIVER=local` with a persistent `STORAGE_LOCAL_DIR`. On serverless hosts (Vercel) local disk is not persistent — use `STORAGE_DRIVER=supabase` and test that adapter first.
5. Serve over HTTPS (session cookie is `Secure` in production).

## Integrations that need credentials (not connected)

| Area | Status | Where |
| --- | --- | --- |
| Product photo + price (Temu, 1688, Taobao, Pinduoduo, Ozon, Wildberries) | preview adapter built; stores block automated requests, staff review manually | `src/lib/product-preview` |
| Online payments (AZ providers) | staff-confirmed payments only | `getPaymentProvider` |
| Cargo tracking | status typed by staff | `getCargoTracker` |
| Exchange rates | maintained in Admin → Settings | `getExchangeRateProvider` |
| Image search | manual sourcing | `getImageSearchProvider` |
| Supabase Storage | adapter untested | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |

## Known limitations

- No email/SMS notifications, password reset or email verification yet.
- Rate limiting is in-memory (single instance).
- Locale is cookie-based (no `/az`, `/ru` URLs for SEO).
- B2B: account type, order type and `BusinessProfile` table exist; no bulk/multi-line quoting UI.
- Russia (region `RU`, RUB rate, Ozon, Wildberries) was added after the first release: run `npm run db:seed` once on an existing database to create these rows. Its commission, cargo rate and RUB rate are placeholders like the other regions.
- Customs figures are entered manually per quotation; all rates and customs notes in the seed are placeholders to be verified against current Azerbaijani regulations.
- Profit is not calculated (purchase and operating costs are not tracked).
- UI primitives are hand-written in shadcn style rather than generated by the shadcn CLI.
- `tapdın` is a working brand name (`src/config/brand.ts`); availability was not checked.
