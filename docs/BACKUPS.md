# Backups

Every night at 2:00 AM (Philippine time), GitHub makes an encrypted copy of
the whole Supabase project: every table's data, the database structure, the
roles, and the files in Storage (receipt photos, product pictures,
documents, the logo). Each copy is kept for 30 days.

The workflow is [.github/workflows/backup.yml](../.github/workflows/backup.yml).
The database structure is also in [supabase/schema.sql](../supabase/schema.sql)
(no data), so a new project can be set up from the repo alone.

## Turning it on (once)

GitHub > the repo > **Settings > Secrets and variables > Actions > New
repository secret**. Add both:

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase > your account (top right) > **Account preferences > Access Tokens > Generate new token** |
| `BACKUP_PASSPHRASE` | A long password you make up. Write it down somewhere safe: without it no backup can be opened. |

Then check that it works: **Actions > Database backup > Run workflow**. After
a few minutes the run has a file under **Artifacts**, named like
`database-backup-2026-11-11`.

If a run shows the warning "No backup made", a secret is missing.

## Opening a backup

1. Actions > Database backup > a run > Artifacts > download it (a .zip).
2. Unzip it. Inside is `database-backup-<date>.tar.gz.gpg`.
3. In Git Bash, in that folder:

   ```sh
   gpg -d database-backup-2026-11-11.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```

   It asks for `BACKUP_PASSPHRASE`. You get a `backup/` folder:

   | File | What it is |
   | --- | --- |
   | `roles.sql` | database roles |
   | `schema.sql` | tables, functions, triggers, policies |
   | `data.sql` | every row: products, sales, accounts (with their logins) ... |
   | `storage/<bucket>/` | the files in each Storage bucket |

Keep these files private. They hold every account and sale. Never put them
in this repo (it's public; `.gitignore` already blocks `backup/`).

## Restoring

Restore into a **new** Supabase project. Restoring into the live one would
mix old and new rows.

1. Make a new project in Supabase (same region: Northeast Asia, Tokyo).
2. Run the files in this order, in **SQL Editor** (paste, Run) or with the CLI:

   ```sh
   npx supabase db query --remote=<new project ref> --yes -f backup/roles.sql
   npx supabase db query --remote=<new project ref> --yes -f backup/schema.sql
   npx supabase db query --remote=<new project ref> --yes -f backup/data.sql
   ```

   For `data.sql`, put `SET session_replication_role = replica;` on its first
   line, so triggers don't run (or block rows) while the old rows go back in.
3. Upload each `storage/<bucket>/` folder to the bucket of the same name
   (Storage in the dashboard, or `npx supabase storage cp -r`).
4. Point the app at the new project: the URL and publishable key in
   [src/lib/supabase.js](../src/lib/supabase.js).
5. Deploy the Edge Functions (`npx supabase functions deploy`), set their
   secrets again (`RESEND_API_KEY` ...), make the n8n webhook again
   (Database > Webhooks: `purchase_orders`, after insert), and set Auth >
   URL Configuration to the website's address.

If only a few rows were deleted by mistake, don't restore everything: open
`data.sql`, find those rows, and run just their `INSERT` lines in the live
project's SQL Editor.
