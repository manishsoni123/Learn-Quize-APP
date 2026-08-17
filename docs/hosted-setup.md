# Learn-Quize — hosted Supabase setup

The checklist for standing up the production backend. Everything here is done
once per project; the app then needs only the project URL and anon key.

## 1. Create and link the project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → New project.
   Pick the organization, a region close to your users (e.g. `ap-south-1`),
   and a **strong database password** — save it, it is needed for seeding.
2. From the **repo root** (not `mobile/`):

   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push          # applies every migration, in order
   ```

## 2. Seed the question bank

```bash
bash scripts/seed-hosted.sh "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

The connection string is under **Connect → Session pooler** in the dashboard.
Questions land as `in_review` — nothing is playable yet, by design.

## 3. Auth configuration (Dashboard → Authentication)

| Setting | Value | Why |
|---|---|---|
| **URL Configuration → Site URL** | your GitHub Pages URL (e.g. `https://<org>.github.io/Learn-Quize/`) | Fallback target for auth emails. |
| **URL Configuration → Redirect URLs** | add `learnquize://**` | Password-reset and confirmation links must be allowed to deep-link back into the app. |
| **Sign In / Up → Confirm email** | **leave ON** | The app handles the "check your inbox" flow; turning it off invites bot signups. |
| **Passwords → Minimum length** | **8** | The app enforces 8 as well; keep them in sync. |
| **Emails → SMTP** | set up a custom SMTP provider before launch (Resend/Postmark/SES) | The built-in shared SMTP is rate-limited to a few emails per hour — fine for testing, not for real signups. |

## 4. First staff account and publishing

```bash
# 1. Sign up in the app (pointed at this project), confirm the email.
# 2. Promote exactly that account:
psql "$SUPABASE_DB_URL" -v email="'you@example.com'" -f supabase/dev/promote_staff.sql
# 3. Approve the seed bank under it:
npx supabase db query --linked --file supabase/dev/publish_seed.sql
```

Never promote an account you did not create. `publish_seed.sql` refuses to run
until a staff account exists.

## 5. Point the app at the project

Production values live in `mobile/eas.json` (production profile `env`), **not**
in `mobile/.env` — `.env` stays on the local stack for development. Set:

- `EXPO_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the project's anon key (safe to ship)

## 6. Verify

```bash
node supabase/tests/e2e.mjs https://<ref>.supabase.co <anon-key>
```

The suite creates a throwaway account, plays the full quiz loop over live
HTTP, checks the security boundary and the leaderboard, and **deletes its own
account** at the end — safe to run against production.

## 7. Operational notes

- **Backups**: the free tier has no point-in-time recovery. Before real
  launch, either upgrade to Pro (daily backups) or schedule
  `supabase db dump` somewhere trusted.
- **Security Advisor** (Dashboard → Advisors): expect warnings about the four
  SECURITY INVOKER helper functions without a pinned `search_path`
  (`tg_set_updated_at`, `level_for_xp`, `xp_for_level`,
  `review_interval_days`) — known, benign, documented here.
- **SSL enforcement** (Database → Settings): turn on "Enforce SSL on incoming
  connections".
- **Network restrictions**: if nobody needs direct Postgres access beyond
  seeding, restrict the database port to your own IP after setup.
