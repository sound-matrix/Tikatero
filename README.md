# Tikatero

Tikatero is Sound Matrix’s events and ticketing platform. This repository is a Next.js app with three surfaces:

- Public site at `/`
- Organiser console at `/console`
- Tikatero admin at `/admin`

The shared design system is at `/styleguide`. Product context lives in `docs/BUILD-PLAN.md`. The approved visual reference is `docs/tikatero-v3-prototype.html`.

## Prerequisites

- Node.js 22
- pnpm 10

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` lists variable names only. Put real values in `.env.local` or the host’s secret store. Do not commit secrets.

## Database

Schema, row level security, and the local seed live in `supabase/`.

```bash
supabase start
supabase db reset
pnpm test:db
```

`pnpm test:db` runs the database checks: anonymous reads of published events, organiser order isolation, ticket writes, the append-only audit log, the publish rule, and single-use redemption.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test
```

Prices are stored as integer paise and shown in Indian rupees, including GST. Times on screen use India Standard Time (`Asia/Kolkata`).
