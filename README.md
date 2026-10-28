# Spotter's Logbook

A private plane-spotting logbook. Log aircraft by registration with photos and videos, see every plane you've spotted on a 3D globe at its live or last-seen position, and collect stats and badges.

## How it fits together

| Part | Service | Cost |
|---|---|---|
| Website and `/api` functions | Cloudflare Pages (deploys from this repo) | Free |
| Login, logbook data, photos and videos | Supabase | Free plan |
| Live positions | adsb.lol, with airplanes.live as a backup | Free, non-commercial |
| Aircraft details and routes | adsbdb.com | Free, non-commercial |

Until Supabase is connected, the site runs in **demo mode** with sample planes and saves nothing.

## Setup

### 1. Put the site online (Cloudflare Pages)
1. Sign up at dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Pages → Connect to Git** and pick **SpottersDream**.
3. Use these build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **public**
4. Click **Save and Deploy**. You'll get an address like `spottersdream.pages.dev`.

Every push to `main` updates the site automatically.

### 2. Create the database (Supabase)
1. Sign up at supabase.com and create a project. Pick the **London** region and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
4. Go to **Authentication → Users → Add user → Create new user**. Create one account for you and one for him, and tick **Auto Confirm User** for each.
5. Back in **SQL Editor**, paste `supabase/add-users.sql`, change the two email addresses, and click **Run**. You should see both accounts listed, one as admin and one as spotter.
6. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key into `public/js/config.js`.

### 3. Add it to the iPad and iPhone home screen
Open the site in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app and remembers the sign-in.

## Who can do what

- **Spotter:** add spots, photos and videos, and see everything.
- **Admin:** everything above, plus deleting spots, photos and planes, and downloading a backup (Logbook → Download backup).
- Nobody else can sign up. Each request is checked by the database's security rules, and photos sit in a private bucket that's served through links that expire.

## Good to know

- **Free plan pause:** Supabase pauses free projects after a week with no use. If the app says it can't load, open the Supabase dashboard and click **Restore**. Upgrading to Pro ($25/month) stops this.
- **Video size:** videos can be up to 50 MB each. For longer clips, trim them in Photos first.
- **Last seen:** positions are checked every 30 seconds while the app is open. A plane's last-seen spot updates whenever someone has the app open while it's broadcasting.
- **Optional adsb.lol key:** if adsb.lol starts requiring an API key, add it in Cloudflare under **Settings → Variables and Secrets** as `ADSBLOL_API_KEY`.

## Files

```
public/            the website (Cloudflare serves this folder)
  js/app.js        globe, logbook, stats, add-a-spot
  js/store.js      Supabase and demo data
  js/media.js      photo shrinking, video thumbnails, photo date and location
  js/data.js       airports, airlines, aircraft types, landmarks
  js/config.js     Supabase connection details
functions/api/     /api/lookup and /api/positions (run on Cloudflare)
lib/flight.js      shared code for the API functions
supabase/          database setup scripts
```
