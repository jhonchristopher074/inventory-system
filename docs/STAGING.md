# Test copy (staging)

A second copy of the system, with its own database, for trying changes
before they reach the store:

**https://jhonchristopher074.github.io/inventory-system/**

Every page has an orange **TEST COPY** label and the tab title starts with
`[TEST]`. Nothing done there touches the store's real products, sales or
accounts.

## How it's used

- A push to the `staging` branch updates the test copy (about 2 minutes).
  The live store (`main`) doesn't change.
- Check the change on the test copy. When it's right, the same commits go to
  `main`, and the live store updates as always.

For a look before it goes live, say "push to the test copy" instead of
"don't push".

## Setting it up (once)

### 1. A second Supabase project

1. Supabase > **New project**. Name it e.g. `10five7-test`, region
   **Northeast Asia (Tokyo)**, any database password. The free plan allows
   two projects.
2. **SQL Editor**: paste [supabase/schema.sql](../supabase/schema.sql) and
   run it. That's the whole database structure. Then run each file in
   `supabase/migrations/` that is newer than the date at the top of
   schema.sql (today: `20261121000001_sales_pages.sql`).
3. **Authentication > Users > Add user**: your email and a password, with
   "Auto Confirm User" on. Then in the SQL Editor (your email in it):

   ```sql
   insert into public.profiles (id, email, full_name, role, is_active)
   select id, email, 'Test Owner', 'admin', true
     from auth.users where email = 'you@example.com';
   ```

   More test accounts (cashier, staff ...) can then be made from Profile &
   Users on the test copy itself.
4. **Authentication > URL Configuration**: Site URL
   `https://jhonchristopher074.github.io/inventory-system/`, and add
   `https://jhonchristopher074.github.io/inventory-system/reset-password`
   under Redirect URLs.
5. The Edge Functions, in this folder (the test project's ref is in its
   address, `https://<ref>.supabase.co`):

   ```sh
   npx supabase functions deploy --project-ref <test ref>
   ```

   For email codes there too: `npx supabase secrets set RESEND_API_KEY=... --project-ref <test ref>`.

### 2. GitHub

1. **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables > New repository
   variable**, twice:

   | Name | Value |
   | --- | --- |
   | `STAGING_SUPABASE_URL` | `https://<test ref>.supabase.co` |
   | `STAGING_SUPABASE_KEY` | the test project's **publishable** key (Project Settings > API Keys) |

   Never the live project's: the workflow refuses it.
3. **Actions > Test copy > Run workflow**. After about 2 minutes the address
   above opens the test copy.

## What doesn't work there

- Receipt reading: the n8n flow belongs to the live project.
- The nightly backup only covers the live project (nothing to lose here).
