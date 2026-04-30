# Românește

Personal Romanian-learning app. Built for the Moldova trip on 2026-07-01.
Sentence-based vocabulary, real Romanian audio (macOS Ioana voice), spaced repetition,
and reminder copy that's not aggressive.

## Run it locally

```sh
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:5173.

## Put it on your iPhone

The fastest path — keeps your iPhone and Mac in sync over your home Wi-Fi:

1. On your Mac, run `npm run dev`. The terminal will print two URLs:
   `Local: http://localhost:5173/` and `Network: http://192.168.x.x:5173/`.
2. On your iPhone, open Safari (must be Safari, not Chrome) and visit the **Network** URL.
3. Tap the Share button → **Add to Home Screen** → Add. The icon shows up like a real app.
4. Tap the new icon. It opens full-screen with no Safari chrome.

Both phone and Mac must be on the same Wi-Fi for this. Audio plays after the first
tap (iOS audio policy — that's a one-time gesture, not per session).

If you'd rather not depend on the Mac, deploy to Vercel for free:

```sh
npm run build
npx vercel --prod
```

Then "Add to Home Screen" from the deployed URL — works anywhere.

## What's inside

- **42 starter phrases** across greetings, language, customs, shop, restaurant, help.
  Each has English, Russian (collapsible), and a brief grammar/cultural note (collapsible).
- **Real audio** generated from macOS's Ioana (ro_RO) voice. Decent quality. Files
  live in `public/audio/{id}.m4a`.
- **Spaced repetition** (SM-2 lite) — 5 new phrases per day, reviews caught up daily.
  Progress saved to `localStorage` on the device.
- **Diacritic-tolerant typing** — `multumesc` is accepted as `Mulțumesc.`, but you
  always see the proper form on the reveal so you learn it.
- **No streaks shouting at you, no notifications guilt-tripping you.**

## Adding more phrases

Edit [`src/data/phrases.json`](src/data/phrases.json) — append entries. Each needs `id`
(stable, e.g. `s11`), `scenario`, `ro`, `en`, optional `ru`, optional `note`.

Then regenerate audio:

```sh
bash scripts/generate-audio.sh
```

It only generates files for new IDs (skips existing ones). The Romanian voice (Ioana)
is built into macOS, no API key needed.

## Editing the kind copy

All UI strings live in [`src/copy.ts`](src/copy.ts). Edit freely. If a tone bugs you,
delete the line.

## What this is *not*

- Not Duolingo. There's no leaderboard, no league, no XP.
- Not a streak tracker. Days you study are recorded but not shown front-and-center.
- Not exhaustive — 42 phrases is a starting deck, not a curriculum. The point is to
  add what *you* hit IRL in Moldova and have the app teach you those.

## Possible next features (ordered by usefulness)

1. **Add-phrase form in the app** — currently you edit JSON; an in-app form would be
   nicer. Store user-added phrases separately from the seed deck.
2. **More phrases** — numbers (with audio), dates and times, common verbs in present tense.
3. **Better audio** — Ioana is OK but a paid TTS (ElevenLabs, Google Cloud) would be
   warmer. The audio script is the only place to swap.
4. **Optional gentle reminders** — Web Push or local notifications, but only if you
   ever opt in. Default off.
5. **Sentence builder mode** — given vocab you know, build new sentences. Better for
   active production than just review.

## File map

```
src/
  data/phrases.json     ← edit phrases here
  components/
    Home.tsx            ← landing screen
    Session.tsx         ← card flow (intro / type-ro / listen)
  scheduler.ts          ← SM-2 SRS logic
  storage.ts            ← localStorage load/save
  normalize.ts          ← diacritic-tolerant matching
  copy.ts               ← all the kind UI strings
  App.tsx               ← top-level routing
  App.css               ← all styling
public/
  audio/*.m4a           ← generated phrase audio
  icon.svg              ← app icon source
  apple-touch-icon.png  ← iOS home-screen icon
scripts/
  generate-audio.sh     ← regenerate audio from phrases.json
  generate-icons.mjs    ← regenerate PNG icons from icon.svg
```
