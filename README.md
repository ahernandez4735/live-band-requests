# Live Band Requests

Song requests, shoutouts and live voting for bands hired to play private parties.

- **Guests** scan the band's QR code, join the live gig (by being at the venue, or with a 4-digit code the band shows), request songs with an optional shoutout, and vote songs up or down. They can follow the lyrics of the current song and find the band's booking details.
- **Bands** keep their song list (or just the artists they cover), set what guests may request, create a gig with a venue and join radius, go live, and run the night from one dashboard: a vote-ranked queue, off-list requests to confirm or turn down, shoutouts to approve, and a Next button.

Built with Next.js 16 and Supabase (Postgres, sign-in, realtime). Lyrics come from [LRCLIB](https://lrclib.net); venue addresses are looked up with OpenStreetMap.

## Set up (about 15 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free tier is fine to start).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261008000000_init.sql`, and run it.
   (Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Authentication > URL Configuration**
   - Site URL: your app's URL, e.g. `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
4. **Authentication > Sign In / Providers**: make sure Email is enabled. Band members sign in with an emailed link; there are no passwords.
   Supabase's built-in email sender is rate limited and meant for testing. Before real bands use it, set up custom SMTP (Authentication > Emails > SMTP Settings), for example with Resend or Postmark.
5. **Project Settings > API**: copy the project URL, the anon (or publishable) key, and the service role (or secret) key.

The migration adds the queue tables to Supabase Realtime. If you ever recreate them, check **Database > Publications > supabase_realtime** includes `queue_items`, `gigs` and `requests`.

### 2. Run it locally

```bash
cp .env.example .env.local   # fill in the three Supabase values
npm install
npm run dev                  # http://localhost:3000
```

Go to `/band`, sign in with your email, and the app walks you through creating a band, adding songs and creating a gig.

To try the guest side on your laptop, open your band link (`/b/your-band`) in a second browser or a private window and join with the gig's 4-digit code.

### 3. Deploy to Vercel

1. In Vercel, **Add New > Project** and import this GitHub repo.
2. Add the environment variables from `.env.example` (all four, with `NEXT_PUBLIC_SITE_URL` set to the Vercel URL or your own domain).
3. Deploy. Then put that URL into Supabase's Site URL and Redirect URLs (step 1.3).

Your band's QR code points at `NEXT_PUBLIC_SITE_URL/b/<your-band>`. If you later move to your own domain, set `NEXT_PUBLIC_SITE_URL` first, then print your sign, so the code never changes again.

## How a gig works

1. **Before the party**: the band creates the gig with the venue address (or taps "Use this device's location" at the venue) and a join radius of 500 ft, 1,000 ft or 0.5 mi. Songs can be switched off for that night.
2. **Go live**: the band's permanent QR code now opens this gig. Only one gig per band can be live.
3. **Guests join**: the phone shares its location once; the server checks it against the venue and discards it. Guests who can't share location use the join code.
4. **Requests**: a guest's request counts as their like. A second guest requesting the same song joins the existing entry rather than duplicating it. Each guest can have three requests waiting at a time.
5. **Off-list requests** depend on the band's setting: listed songs only, listed songs plus any song by the artists they list, or any song. Off-list requests show as "waiting for the band" until the band taps **We can play it** or **Can't play**. Turned-down requests are kept, so you can see what people wanted.
6. **Shoutouts** are held until the band approves them, then shown to the band in large type and to guests on the Lyrics tab.
7. **End gig** when done: the code stops working and guests see a thank-you with the booking details.

## How simultaneous actions are handled

- **Votes** are stored one per guest per song, and the score changes by the difference, so double taps, retries and many guests voting at the same moment never lose or double-count a vote (`supabase/tests/concurrency_test.sh` fires 40 votes at once).
- **Band actions** (play, next, skip, confirm, approve) lock the gig first and check the song is still in the state the band saw. If two band members tap at once, the second sees "Someone already did that" and the screen refreshes.
- **Screens** treat realtime messages only as a signal to refetch the whole queue, and also refresh every 15 to 20 seconds and whenever the phone comes back to the tab, so spotty venue Wi-Fi can't leave anyone looking at a wrong queue for long.

## Privacy

- Guests give only a first name. They have no account.
- A guest's location is used once to check they're at the venue, then discarded. It is never stored.
- Other guests never see who requested what; the band does.
- The venue address and join code are only visible to the band.

## Lyrics

Lyrics come from LRCLIB, a free community database. Its lyrics are not licensed from music publishers, which is fine while you build and test. **Before charging bands, switch to a licensed provider** such as LyricFind or Musixmatch. All lyrics lookups go through `src/lib/lrclib.ts`, so that's the only file to replace.

On the Songs page, "Find lyrics" checks 15 songs per click. Songs requested off-list are looked up when they start playing.

## Adding Spanish

Every word guests see is in `src/lib/i18n/guest.ts`. To add Spanish: copy the `en` object to an `es` object, translate the values, and choose the dictionary from the phone's language (`navigator.language`) with a toggle in the guest header. The band dashboard strings are next. Search already ignores accents, so "titi me pregunto" finds "Tití Me Preguntó".

## Tests

```bash
npm test            # unit tests: location check, song list parsing, queue order
npm run test:db     # database tests against a local Postgres (needs psql and a server you can create databases on)
npm run typecheck
npm run lint
```

`npm run test:db` creates a throwaway database, loads a small stand-in for Supabase's `auth` schema and roles, runs the migration, then checks request merging, the request-policy rules, votes, band actions, stale-action handling, row level security, and 40 simultaneous votes.

## Project map

```
supabase/migrations/   database schema, security rules, guest and band functions
supabase/tests/        database tests
src/app/band/          band pages: setup, songs, gigs, live dashboard, printable sign
src/app/b/[slug]/      where the QR code points: band page and join
src/app/g/[gigId]/     the guest app: songs, queue, lyrics, band
src/app/api/           guest endpoints: join, request, vote, queue, now playing
src/lib/               shared code: Supabase clients, location check, lyrics, text helpers
```

## Not built yet

- Host setup link (must-plays and do-not-play list from the person who hired the band)
- History page: most played, most requested, and most requested songs the band doesn't know (the data is already being saved)
- Spanish guest screens (see above)
- Several band members on one account (for now, members share the band's sign-in)
- A cap on join-code guesses beyond the current small delay
