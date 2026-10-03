# Link Your Dude

A live clipboard between your devices. Create a room on your laptop, open it on
your phone (QR code, invite link, or 10-character room ID), and every note you
type or paste shows up on the other devices as you type. Tap **Copy** and go.

Production: https://linkyourdude.vercel.app

## How it works

```
Browser ──HTTP (validated writes)──▶ Next.js API routes ──service key──▶ Supabase Postgres
   ▲                                        │
   └──── WebSocket (Supabase Realtime) ◀────┘ broadcast after each write
```

- **Storage:** Supabase Postgres (`rooms`, `notes`). RLS is on with no policies,
  and the SQL functions are executable only by the service role, so the browser
  can't read or write tables directly.
- **Writes:** the browser calls `/api/rooms/...`. Routes validate input and call
  the database with the server-only secret key.
- **Realtime:** after each write the server broadcasts to the room's Supabase
  Realtime channel. Every device in the room holds a WebSocket to that channel
  (Vercel Functions can't keep sockets open, so Supabase hosts them). Presence
  shows how many devices are connected.
- **No stale overwrites:** every note has a version. An edit is accepted only if
  it was based on the current version (compare-and-set). Otherwise the client
  merges field by field. If both devices changed the same field, the first save
  wins and the other text is kept as a "(conflicting copy)" note. Text is never
  silently dropped.
- **Typing:** saves are debounced (300 ms, max 1.2 s while typing continuously).
- **Reconnects and offline:** the socket rejoins automatically and the room
  resyncs on every reconnect, when the tab becomes visible, and on `online`.
  Failed saves retry with backoff. Unsaved drafts are also cached in
  `localStorage`, so they survive a reload while offline. If the socket is down,
  the page polls every 10 s.
- **PWA:** installable (manifest, icons, service worker). Visited pages open
  offline, with `/offline` as the fallback. On Android the installed app appears
  in the share sheet: share text from any app straight into a room.

Access is scoped to the room: anyone with the room ID (or link) can read and
edit that room, and nobody else can. IDs are random (31^10 ≈ 8×10^14).

## Setup

1. **Create a Supabase project** (the free plan is fine) at https://supabase.com.
2. **Create the schema:** open *SQL Editor*, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. It's safe to re-run.
3. **Realtime settings:** the defaults work. Broadcast and presence on public
   channels are enabled out of the box. If you turned off *"Allow public access"*
   under Realtime → Settings, turn it back on.
4. **Environment variables:** copy `.env.example` to `.env.local` and fill in
   the values from *Project Settings → API Keys* and *Data API*.
5. Run it:

   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```

   To try it on your phone during development, open `http://<your-LAN-IP>:3000`.
   Copy and paste work over plain http too. The service worker is only
   registered in production builds (`npm run build && npm start`).

## Deploy to Vercel (Hobby/free plan)

1. Push the repo to GitHub and import it in Vercel. The framework preset is
   detected as Next.js automatically.
2. Under *Settings → Environment Variables*, add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` for
   Production and Preview.
3. Deploy, then under *Settings → Domains* set `linkyourdude.vercel.app`.
4. Optional but recommended: under *Settings → Functions → Function Region*,
   pick the region closest to your Supabase project to keep save latency low.

Invite links and QR codes are built from the current origin, so localhost and
preview deployments generate links to themselves.

## Free-plan notes

- Supabase pauses free projects after about a week without activity. Restore the
  project from the dashboard.
- Notes are limited to 100,000 characters. Notes too large for a single realtime
  message are announced with a small "changed" ping, and devices fetch them over
  HTTP.
- Optional cleanup: `supabase/schema.sql` ends with a commented `pg_cron` job
  that deletes rooms idle for 30 days.

## Project map

| Path | What |
| --- | --- |
| `app/api/rooms/**` | Route handlers: create room, snapshot, create/update/delete note |
| `lib/server/*` | Server-only Supabase client, broadcast helper, data access |
| `lib/sync/room-engine.ts` | Client sync engine: drafts, debounce, versioned saves, merge, retry, offline cache |
| `lib/sync/realtime.ts` | Supabase Realtime channel (broadcast + presence) |
| `lib/notes.ts`, `lib/room-id.ts` | Shared validation, types, and room ID helpers |
| `components/room/*`, `components/home/*` | UI |
| `app/manifest.ts`, `public/sw.js`, `app/share`, `app/offline` | PWA |
| `supabase/schema.sql` | Tables, RLS, and SQL functions |
