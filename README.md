# Spotter's Logbook

A private plane-spotting logbook. Log aircraft by registration with photos and videos, see every plane you've spotted on a 3D globe at its live or last-seen position, and collect stats and badges.

## How it fits together

| Part | Service | Cost |
|---|---|---|
| Website and `/api` functions | Cloudflare Workers (deploys from this repo) | Free |
| Login, logbook data, photos and videos | Supabase | Free plan |
| Live positions | adsb.lol, with airplanes.live as a backup | Free, non-commercial |
| Aircraft details and routes | adsbdb.com, with adsb.lol as a backup | Free, non-commercial |
| Map tiles | OpenFreeMap (OpenStreetMap data) | Free |
| Satellite imagery | Sentinel-2 cloudless by EOX | Free, non-commercial |
| Airport weather | aviationweather.gov | Free |
| Airport list and runways | OurAirports (bundled) | Public domain |

Until Supabase is connected, the site runs in **demo mode** with sample planes and saves nothing.

## Setup

### 1. Put the site online (Cloudflare)
1. Sign up at dash.cloudflare.com.
2. Go to **Workers & Pages → Create application** and import the **SpottersDream** repository from GitHub.
3. Keep the defaults: project name `spottersdream`, an empty build command, and deploy command `npx wrangler deploy`. The `wrangler.jsonc` file in this repo tells Cloudflare what to do.
4. Click **Deploy**. You'll get an address like `spottersdream.<your-name>.workers.dev`.

Every push to `main` updates the site automatically.

### 2. Create the database (Supabase)
1. Sign up at supabase.com and create a project. Pick the **London** region and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
4. Go to **Authentication → Users → Add user → Create new user**. Create one account for you and one for him, and tick **Auto Confirm User** for each.
5. Back in **SQL Editor**, paste `supabase/add-users.sql`, change the two email addresses, and click **Run**. You should see both accounts listed, one as admin and one as spotter.
6. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key into `public/js/config.js`.

### 3. Database update 2 (view-only accounts)
Paste `supabase/002-viewers-and-reset.sql` into **SQL Editor** and click **Run**.

### 4. Password reset and invite emails
Supabase's built-in email only sends to members of your Supabase team, so send through your own iCloud mail instead:
1. Go to **account.apple.com → Sign-In and Security → App-Specific Passwords** and create one called `Supabase`.
2. In Supabase, go to **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:
   - Sender email: your iCloud address
   - Sender name: `Spotter's Logbook`
   - Host: `smtp.mail.me.com`, Port: `587`
   - Username: your iCloud address, Password: the app-specific password
3. In **Authentication → URL Configuration**, set **Site URL** to the site's address and add the same address to **Redirect URLs**.

### 5. Inviting family and friends (view only)
**Authentication → Users → Add user → Send invitation**, and enter their email. They tap the link, choose a password, and can see everything but can't add or delete. To make someone a spotter or admin, change their `role` in the `profiles` table.

### 6. Plane alerts (database update 3 and one secret)
1. Paste `supabase/003-alerts.sql` into **SQL Editor** and click **Run**.
2. In Supabase, go to **Project Settings → API Keys → Secret keys** and copy a secret key (starts `sb_secret_`).
3. In Cloudflare, open the **spottersdream** worker → **Settings → Variables and Secrets → Add**. Choose type **Secret**, name it `SUPABASE_SECRET_KEY`, paste the key and **Deploy**.

The background job then runs every 2 minutes: it checks planes with alerts plus a rotating batch of logbook planes, updates last-seen positions (which also stops the free Supabase project pausing) and sends notifications. Notification signing keys are created automatically and stored in the `app_secrets` table.

On iPhone and iPad, notifications only work when the app is opened from its Home Screen icon (Apple's rule).

### 7. Add it to the iPad and iPhone home screen
Open the site in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app and remembers the sign-in.

## Who can do what

- **Viewer:** see everything (globe, logbook, stats, airports) but can't add or delete. Everyone you add in Supabase starts as a viewer.
- **Spotter:** add spots, photos and videos, and see everything.
- **Admin:** everything above, plus deleting spots, photos and planes, and downloading a backup (Logbook → Download backup).
- Nobody else can sign up. Each request is checked by the database's security rules, and photos sit in a private bucket that's served through links that expire.

## Good to know

- **Free plan pause:** Supabase pauses free projects after a week with no use. If the app says it can't load, open the Supabase dashboard and click **Restore**. Upgrading to Pro ($25/month) stops this.
- **Video size:** videos can be up to 50 MB each. For longer clips, trim them in Photos first.
- **Last seen:** positions are checked every 30 seconds while the app is open, and in the background every 2 minutes (a rotating batch of planes) once alerts are set up.
- **Optional adsb.lol key:** if adsb.lol starts requiring an API key, add it in Cloudflare under **Settings → Variables and Secrets** as `ADSBLOL_API_KEY`.

## Files

```
wrangler.jsonc     Cloudflare settings
public/            the website (Cloudflare serves this folder)
  js/app.js        logbook, stats, album, alerts, airports, add-a-spot, sign-in
  js/game.js       points, rarity tiers and ranks
  sw.js            service worker that shows notifications
  js/map.js        the 3D globe (MapLibre), map and satellite styles
  vendor/          MapLibre GL JS 5.24.0
  data/airports.json  airports and runways from OurAirports
  js/store.js      Supabase and demo data
  js/media.js      photo shrinking, video thumbnails, photo date and location
  js/data.js       airports, airlines, aircraft types, landmarks
  js/config.js     Supabase connection details
worker/index.js    Cloudflare entry point: sends /api/* to the functions, everything else to public/
functions/api/     /api/lookup, /api/positions, /api/airport and /api/push/*
lib/cron.js        the every-2-minutes job: positions, alerts, notifications
lib/push.js        web push encryption and signing
lib/flight.js      shared code for the API functions
supabase/          database setup scripts
```
