# Pellet Town

A browser exploration game: load a bike-reachable area (isochrone) around home, scatter pellets along every street inside it, and collect them as you ride. Progress is stored locally on your device.

## How it works

1. Set up a level with a name and an isochrone (bundled default or pasted GeoJSON).
2. The app downloads street data from OpenStreetMap (Overpass) and places pellets every **50 m** along streets.
3. Tap **Start riding**, allow location, and keep the app open (screen stays awake while tracking).
4. Pellets within **20 m** are collected; completion % updates as you explore.

There is no backend. Map tiles, street fetches, and GPS all run in the browser. Progress lives in IndexedDB.

## Requirements

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Local development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Overpass requests are proxied in dev (see terminal for fetch/retry logs).

### Useful scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite server |
| `npm run build` | Production build (`base: /`) |
| `npm run preview` | Preview the production build locally |
| `npm run build:pages` | Build for GitHub Pages (`base: /pellet-town/`) |
| `npm run preview:pages` | Preview the Pages build at `/pellet-town/` |

## Testing

### Desktop (debug mode)

1. Complete setup with the default isochrone (or paste GeoJSON).
2. Open the menu (☰) and enable **Debug mode**.
3. Tap **Start riding**.
4. Tap the map to move the purple location marker; nearby pellets are collected.

This skips GPS and is the easiest way to verify eating, sound, and stats.

### Desktop GPS simulation

In Chrome DevTools → **Sensors** → set a custom location near a street with pellets, then **Start riding**.

### Phone (real GPS)

Mobile browsers require **HTTPS** for location. Open the live site on your phone:

**https://drsaunders.github.io/pellet-town/**

(Alternatively, tunnel a local `npm run dev` server with Cloudflare Tunnel / ngrok.)

On the phone:

1. Allow location when prompted.
2. Tap **Start riding** and keep the app in the foreground.
3. Use the **center-on-me** button (target icon, top-right under zoom) if you lose your marker.

### Export / reset

- **Export save file** (menu) downloads a full JSON backup of the level, streets, pellets, and progress.
- **Reset level** deletes that level’s local data so you can regenerate.

## Deploy (GitHub Pages)

The app is already deployed to GitHub Pages:

**https://drsaunders.github.io/pellet-town/**

Pushes to `main` rebuild and redeploy automatically via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). You can also redeploy without a code change from **Actions → Deploy to GitHub Pages → Run workflow**.

### Preview Pages build locally

```bash
npm run preview:pages
```

Then open [http://localhost:4173/pellet-town/](http://localhost:4173/pellet-town/).

If the repo name ever changes, update `repoName` in `vite.config.ts` so the Vite `base` path still matches.

## Stack

- React + TypeScript + Vite
- MapLibre GL JS (map + overlays)
- Turf.js (geometry / pellets)
- Dexie / IndexedDB (local persistence)
- Overpass API (OSM streets)
- OpenFreeMap tiles

## Notes

- **No background GPS** in the browser. Wake Lock keeps the screen on while tracking; screen-off / pocket mode needs a native wrapper (e.g. Capacitor) later.
- Progress is **per browser / per origin**. Clearing site data wipes IndexedDB — export a save file if you care about progress.
- See [`PLAN.md`](./PLAN.md) for the full product/architecture plan.
