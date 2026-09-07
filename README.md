# The Living Collection — installable plant catalogue

A plant collection tracker that installs to an Android home screen. One shared
collection, readable and writable from both phones, on free hosting.

## Publish it with GitHub Pages

You don't need Node or any tooling on your own computer. GitHub builds the app
for you every time you push a change.

**Your repository has to be public.** GitHub Pages works on public repositories
with a free account; private repos need Pro. Only the app's code is public —
your plant data lives on your phone and is never in the repo.

### 1. Make the repository

On github.com: **+ → New repository**. Name it something like
`plant-collection`, set it **Public**, and create it without a README.

### 2. Upload these files

On the empty repo page, click **uploading an existing file**, then drag in
everything from this folder — `src`, `public`, `.github`, `package.json`,
`package-lock.json`, `vite.config.js`, `index.html`, `.gitignore`. Commit.

Browsers sometimes skip folders whose name starts with a dot. If
`.github/workflows/deploy.yml` didn't make it, use **Add file → Create new
file**, type `.github/workflows/deploy.yml` as the filename, and paste that
file's contents in.

### 3. Turn on Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

That's the whole setup. The **Actions** tab shows the build running; it takes
a couple of minutes. When it finishes, your app is at:

```
https://<your-username>.github.io/plant-collection/
```

### Changing anything later

Edit a file on github.com and commit, and the site rebuilds itself. The deploy
workflow reads the repo name for the URL prefix, so renaming the repo just
works.

### If you'd rather build locally

Node 18+, then:

```bash
npm install
npm run dev      # local preview
npm run build    # production build into dist/
```

## Install on Android

1. Open `https://<your-username>.github.io/plant-collection/` in Chrome.
2. Menu (⋮) → **Add to Home screen** or **Install app**.
3. It gets an icon and opens full screen with no browser chrome.

On first launch you sign in, and the session is remembered — you won't be asked
again on that phone unless you sign out.

## Set up the shared collection (Supabase)

Both phones read and write one collection. Free tier, no card, about ten minutes.

### 1. Create the project

[supabase.com](https://supabase.com) → new project. Pick a region near you and
save the database password somewhere. It takes a minute or two to provision.

### 2. Create the table

**SQL Editor → New query**, paste the whole of `supabase-setup.sql`, and run it.
That makes the table, the row-level security policy, and the trigger that keeps
sync traffic small.

### 3. Make exactly two accounts

- **Authentication → Sign In / Providers →** turn **off** "Allow new users to sign up". This is the step that keeps the collection to the two of you.
- **Authentication → Users → Add user**, twice. Set a password for each and tick **Auto Confirm User** so no confirmation email is needed.

### 4. Give GitHub the keys

In Supabase, **Project Settings → API** shows the Project URL and the `anon`
public key. In your GitHub repo, **Settings → Secrets and variables → Actions →
New repository secret**, add both:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |

The anon key is designed to be public — it ships inside every Supabase web app.
On its own it opens nothing, because every read and write requires a signed-in
user and sign-ups are off.

### 5. Redeploy

**Actions → Deploy to GitHub Pages → Run workflow.** When it finishes, open the
app: it now asks for an email and password. Sign in on both phones.

## The public view

Each plant sheet has a **Show in the public view** tick box. Settings → Public
view lets you set a title and short introduction, choose whether rooms are
shown, and press **Publish**.

Publishing writes a separate, read-only copy to its own table — only the ticked
plants, only names, dates, and up to three photos each, re-encoded smaller.
Wishlist, sources, propagation notes, and anything you have not ticked stay private.
Visitors go to `#/garden` on the same address and never sign in. **Take it
down** empties it.

Anyone with the link can read it; there is no half-public setting. Photos are
the bulk of your egress, so a widely-shared link eats into the free 5 GB a
month — a few dozen visitors is nothing, a viral post is not.

## Nightly backups

`.github/workflows/backup.yml` exports the collection every night and commits
it to `backups/`, giving you a restorable snapshot in git history for every day
something changed. It needs one more repository secret:

| Name | Where to find it |
| --- | --- |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` key |

**Keep that key in GitHub secrets only.** Unlike the anon key it bypasses row
level security, so it must never appear in the app bundle or the README.

**Your repo is public,** which GitHub Pages requires on a free account — so the
committed backups are public too. Plant names, rooms, dates, care notes,
wishlist sources. Usually fine for a plant catalogue; if not, delete that
workflow and export by hand from Settings. Photos are excluded either way,
since git would keep every version of them forever.

## How syncing behaves

- **Shared, not merged.** Both of you edit one collection. Last save wins, so if you both edit the same plant within the same minute, one overwrites the other. With two people this is rare in practice.
- **Changes appear on open.** There's no live push — the other phone picks up your edits next time it opens the app or reopens a plant.
- **Offline reads work.** A local cache keeps the collection browsable without signal. Saving needs a connection and will tell you if it failed.
- **Photos count against 500 MB.** That's comfortably over a thousand pictures at the size the app saves them. If you ever approach it, photos can move to Supabase's separate 1 GB file storage.
- **Free projects pause after 7 days idle.** The included `keep-alive` workflow pings the database every three days so this never bites. If it ever does, unpause from the Supabase dashboard.
- **No automatic backups on the free tier.** Settings → Download backup still exports everything but photos. Do it now and then.

## If you'd rather run it locally

```bash
cp .env.example .env   # fill in your Supabase URL and anon key
npm install
npm run dev
```

## Files

```
src/PlantLedger.jsx   the whole interface
src/App.jsx           session gate, plus the #/garden public route
src/PublicGarden.jsx  the read-only public gallery
src/publish.js        builds and writes the public snapshot
src/SignIn.jsx        email and password sign-in
src/storage.js        Supabase reads and writes, with a local cache
src/supabaseClient.js client setup from the build-time keys
supabase-setup.sql    run once in the Supabase SQL editor
src/index.css         the handful of utility classes the app uses
vite.config.js        build config and PWA manifest
public/               app icons
.github/workflows/    Pages deploy, Supabase keep-alive, nightly backup
```
