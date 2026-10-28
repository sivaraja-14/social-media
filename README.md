# Daily Momentum — faceless Instagram motivation page

A fully automated, faceless motivation page:

1. Every day it picks a quote from `content/quotes.json` (never repeats until the library rotates),
2. renders a branded 1080×1350 feed image (JPEG, what Instagram's API accepts) into `output/YYYY-MM-DD.jpg`,
3. writes the caption with hashtags and a CTA,
4. publishes it to Instagram through the official Graph API on a daily schedule.

Everything is faceless: no photos of you, just typography.

## Commands

```bash
npm install
npm run generate          # create today's image + caption (offline, no Instagram needed)
npm run post              # generate today's post AND publish it to Instagram
node src/daily.js --check # verify IG_USER_ID / IG_ACCESS_TOKEN work
node src/daily.js --date=2026-10-29 --publish   # backfill a specific day
```

Generated files land in `output/`:
`2026-10-28.jpg` (the post) and `2026-10-28.json` (quote, theme, caption, publish receipt).
`content/history.json` remembers recently used quotes so nothing repeats until the whole library has been used.

## Customizing the look and content

- **Quotes**: add/edit entries in `content/quotes.json` (`id`, `theme`, `text`). Original lines work best — the included ones were written for this project.
- **Brand**: set `BRAND_NAME` and `BRAND_HANDLE` in `.env` (or in the action's environment).
- **Colors**: the 6 palettes live in `src/render.js` (`PALETTES`); the palette is rotated by day so the feed looks varied but cohesive.
- **Format**: 1080×1350 (4:5 feed post). Dimensions are the `W` / `H` constants in `src/render.js`.
- **Caption**: `buildCaption()` in `src/daily.js` controls the CTA rotation and hashtags.
- **Schedule**: cron line in `.github/workflows/daily-post.yml` (default `30 8 * * *` = 08:30 UTC).

## 1. Instagram setup (one time, ~20 minutes)

Do these in order. Nothing here costs money.

### 1a. Make the Instagram account Professional

1. Open the Instagram app → your profile → **☰ menu → Settings and privacy**.
2. **Account type and tools → Switch to professional account → Creator** (or Business).
3. Pick a category (e.g. *Digital creator*), skip the extras.
4. When Instagram asks you to connect a Facebook account/profile, do it — the publishing API needs the Instagram account to be reachable from a Facebook login (Meta creates a small Facebook Page behind the scenes if you don't have one).

### 1b. Create the Meta app

1. Go to <https://developers.facebook.com> → sign in with Facebook → **My Apps → Create App**.
2. Use case: **Other**. App type: **Business**. Name it anything (e.g. `motivation-poster`), add your email, Create app.
3. In the app dashboard left sidebar: **Add products → Instagram → Set up** and choose **API setup with Facebook login**. Also add **Facebook Login** if offered.
4. You're done with the app for now — keep it in **Development mode** (top bar). In Development mode no App Review is needed, but the token only works for people who have a role on the app. Your own account is the admin by default, so you're fine.

### 1c. Get your access token (Graph API Explorer)

1. Open <https://developers.facebook.com/tools/explorer>.
2. **Meta App** dropdown → your new app. **User or Page** → *User Token*.
3. In **Permissions**, add: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list`.
4. Click **Generate Access Token**, choose your Facebook account, **Continue** and accept. A short-lived token appears.
5. **Important:** the token must belong to a Facebook account that manages your Instagram Professional account. If you skipped the Facebook connection in step 1a, link it now: Instagram app → **Settings → Accounts Center → Accounts → Add Facebook account**, then confirm the Page connection in Meta Business Suite (business.facebook.com → Settings → Instagram accounts).

### 1d. Find your numeric Instagram user id (`IG_USER_ID`)

Still in the Explorer, run:

```http
GET /me/accounts?fields=id,name,instagram_business_account{id,username}
```

Take the `id` inside `instagram_business_account` — that is your `IG_USER_ID` (a long number like `17841400000000000`). If nothing comes back, first run `GET /me/accounts` to see which Pages you manage, then `GET /{PAGE_ID}?fields=instagram_business_account{id,username}`.

### 1e. Make the token long-lived (~60 days)

Short-lived tokens die in about an hour. Exchange it (run this in a browser or `curl`, then delete the token from your history):

```
https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED_TOKEN}
```

- `{APP_ID}` and `{APP_SECRET}` are in **Settings → Basic** of your app.
- Put the returned `access_token` into `.env` as `IG_ACCESS_TOKEN`.
- It lasts ~60 days. **Save a reminder to refresh it**, or the daily job will start failing silently after two months.

### 1f. Verify it works

```bash
node src/daily.js --check
# → ✓ Connected to @yourhandle (id 1784..., 0 posts)
```

## 2. Host the image somewhere public

Instagram's API only accepts a **public image URL**, never a raw upload, so the workflow commits `output/*.jpg` to the repo first and then publishes that URL. Pick one:

- **GitHub raw** (easiest): `IMAGE_BASE_URL = https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/output`
- **GitHub Pages**: enable Pages (Settings → Pages → deploy from branch `main`, root) and use `https://YOUR_USER.github.io/YOUR_REPO/output`

Either way you must push this project to a GitHub repository.

## 3. Turn on the daily automation

Push the repo to GitHub, then in the repo:

- **Settings → Secrets and variables → Actions → Secrets**: `IG_USER_ID`, `IG_ACCESS_TOKEN`
- **Settings → Secrets and variables → Actions → Variables**: `IMAGE_BASE_URL`
- **Settings → Actions → General → Workflow permissions**: allow read and write permissions

The `Daily Instagram post` workflow then runs at 08:30 UTC every day. You can trigger it manually from the Actions tab (checkbox: publish or just generate).

### Running it yourself instead of CI

Any machine that runs once a day also works:

```bash
# crontab -e
30 8 * * * cd /path/to/repo && /usr/bin/npm run post >> daily.log 2>&1
```

## Limits and notes

- Instagram allows dozens of API-published posts per day (Meta's docs currently state 50–100 per rolling 24 h) — one per day is far under that.
- The account must be professional, and the token's user must own it.
- Keep hashtags around 10; more looks spammy.
- `.env` is git-ignored. Never commit tokens; in CI they live in Actions secrets.
