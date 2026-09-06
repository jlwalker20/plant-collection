# The Living Collection — installable plant catalogue

A plant collection tracker that installs to an Android home screen and keeps
everything on the device. No account, no server, no subscription.

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

On first launch the app asks the browser to make its storage persistent, which
stops Android from clearing the collection when disk runs low.

## Where the data lives

In IndexedDB, on that device, under that site's origin. Practical consequences:

- **No 20 MB cap.** Browsers grant storage out of free disk; hundreds of megabytes of photos is normal. Photos are resized to 1600px on the long edge.
- **It doesn't sync.** Your phone and your partner's phone hold separate collections. Settings → Download backup exports everything but photos as JSON, and the paste box restores it.
- **Clearing site data deletes it.** So does uninstalling. Export occasionally.
- **Changing hosts starts fresh.** Data is tied to the address, so moving from `github.io` to your own domain means exporting first and restoring after.

## If you later want real sync

The storage layer is isolated in `src/storage.js` — four small functions.
Pointing them at Supabase or Firebase instead of IndexedDB would give both
phones one shared collection without touching the interface code.

## Files

```
src/PlantLedger.jsx   the whole interface
src/storage.js        IndexedDB layer — swap this to change where data lives
src/index.css         the handful of utility classes the app uses
vite.config.js        build config and PWA manifest
public/               app icons
.github/workflows/    the GitHub Pages build and deploy
```
