# Pellet Town — Implementation Plan

A browser-first exploration game: define a “home” and bike-reachable area (isochrone), scatter pellets along every street inside it, and collect them over time as you ride. Progress persists locally. No self-hosted backend.

---

## 1. Product summary

**Core loop:** Open the app → see your neighborhood map with an isochrone overlay and uneaten pellets on streets → ride with the app open → when you reach a pellet, it disappears forever → watch completion % climb.

**v1 must-haves:** bike mode (conceptual only in v1—speed/isochrone come from pasted data), pasted isochrone GeoJSON, OSM map, pellet generation, GPS collection (screen on), local persistence, simple completion stats, export.

**Explicitly out of v1:** walk/car modes, live isochrone API, background GPS, cloud sync, multiple levels (design for them), Play Store polish, traffic/hills.

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (PWA-ready)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Map UI   │  │ Pellet   │  │ GPS      │  │ Local DB    │ │
│  │ MapLibre │  │ engine   │  │ tracker  │  │ IndexedDB   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │             │             │                  │         │
│       └─────────────┴─────────────┴──────────────────┘         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (direct from browser)
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   OSM raster/vector    Overpass API       Nominatim (optional)
   tiles (free)         (street graph)     (geocode address)
```

**Recommended stack**

| Layer | Choice | Rationale |
|-------|--------|-----------|
| App shell | **React + TypeScript + Vite** | Fast dev, huge geo ecosystem, easy PWA |
| Map | **MapLibre GL JS** | OSM-friendly, GeoJSON layers, good performance |
| Geospatial | **Turf.js** | Clip, buffer, point-to-line distance, spacing along lines |
| Spatial index | **rbush** (or flatbush) | Fast nearest-pellet queries on each GPS tick |
| Storage | **Dexie.js** (IndexedDB wrapper) | Structured local data, export/import |
| Future APK | **Capacitor** | Wrap the same web app; Geolocation plugin when needed |

No Python, no central server. All computation runs in the browser except calls to public OSM infrastructure.

---

## 3. Data model

Design schemas so **v1 uses one implicit “level”** but v2 can add many without migration pain.

### 3.1 Level (future-ready; v1 has exactly one)

```ts
Level {
  id: string
  name: string                    // e.g. "Home — 15 min bike"
  home: { lat, lon, label? }      // geocoded address or pin
  mode: "bike" | "walk" | "car"   // v1: always "bike"
  travelMinutes: number           // metadata only in v1 (isochrone is pasted)
  isochrone: GeoJSON.MultiPolygon // stored verbatim
  createdAt, updatedAt
}
```

### 3.2 Street segment (derived from OSM, cached)

```ts
StreetSegment {
  id: string                      // osm way id (+ dedupe key)
  osmWayId: number
  geometry: LineString            // WGS84, single centerline
  name?: string
  highway: string                 // OSM tag
  filtered: boolean               // true if excluded (private, etc.)
  filterReason?: string
}
```

### 3.3 Pellet

```ts
Pellet {
  id: string                      // stable hash(segmentId + index)
  levelId: string
  segmentId: string
  position: { lat, lon }
  indexAlongSegment: number       // 0, 1, 2… along resampled line
  eaten: boolean
  eatenAt?: ISO8601
  eatenLocation?: { lat, lon }    // optional audit
}
```

### 3.4 Session / stats (aggregates)

```ts
LevelStats {
  levelId
  totalPellets: number
  eatenPellets: number
  percentComplete: number         // eaten / total * 100
  lastActivityAt
}
```

### 3.5 GPS track (optional v1, useful for export)

```ts
TrackPoint { levelId, lat, lon, timestamp, accuracy? }
```

---

## 4. Isochrone input (v1 prototype)

Your bundled file `default-isochrone.txt` is a **GeoJSON FeatureCollection** with one **MultiPolygon** feature (`properties.search_id: "isochrone-0"`), coordinates `[lon, lat]` in WGS84 (Toronto area).

**v1 flow**

1. On first launch, offer **“Use default isochrone”** (ship `default-isochrone.json` in `/public`) or **paste/upload GeoJSON**.
2. Validate: `FeatureCollection` or `Feature` with `Polygon` / `MultiPolygon`; reject empty geometries.
3. Normalize to a single `MultiPolygon` in memory.
4. Persist to IndexedDB with the level record.
5. Fit map bounds to isochrone bounding box.

**Map overlay**

- Fill layer: semi-transparent color (game-like accent, e.g. soft green/teal), ~20–30% opacity.
- Line layer: slightly brighter border.
- Optional: dim map outside isochrone with an inverted mask (nice polish, not required v1).

**Future (not v1):** call OpenRouteService / GraphHopper / Mapbox isochrone API directly from the browser with home + minutes + `cycling-regular` profile. Same GeoJSON pipeline afterward. $0 tier: OpenRouteService free tier (API key in env, rate limits) or continue paste workflow.

---

## 5. Fetching street data from OpenStreetMap

### 5.1 Overpass query

Client-side POST to a public Overpass endpoint (e.g. `overpass-api.de`, with fallback mirrors). Query **ways with `highway=*`** whose geometry intersects the isochrone polygon.

Conceptual query:

```
[out:json][timeout:90];
(
  way["highway"](poly: "lat lon lat lon ...");
);
out geom;
```

Build the `poly:` string from the outer ring of the MultiPolygon (handle multiple rings separately if needed, then merge results).

**Rate limiting:** debounce; cache raw Overpass response in IndexedDB keyed by level id + isochrone hash so regeneration is idempotent.

### 5.2 Which highways to include

User asked for **all streets**, not mode-filtered:

- Include: `residential`, `tertiary`, `secondary`, `primary`, `living_street`, `unclassified`, `service`, `track`, `path`, `footway`, `cycleway`, `pedestrian`, etc.
- Exclude non-street features: `highway=bus_stop`, `highway=elevator`, `highway=construction` (optional), platforms.

Use a permissive allow-list with a small deny-list for obvious non-routable types.

### 5.3 Filtering inaccessible / private (ideal filter)

Drop or mark `filtered: true` when OSM tags indicate likely inaccessibility:

| Tag | Action |
|-----|--------|
| `access=private` | Exclude |
| `access=no` | Exclude |
| `access=customers` | Exclude (optional: keep but low priority) |
| `barrier=*` on nodes | Hard to use without node tags on ways; skip v1 unless querying nodes |
| `foot=private` / `bicycle=private` | Exclude for bike level (future mode-aware) |

Document filtered count in UI (“312 streets, 28 private segments excluded”).

### 5.4 One pellet line per street (deduplication)

OSM often has dual carriageways or overlapping ways:

1. Group ways by `(name, rounded compass bearing bucket)` or use geometric overlap detection.
2. For v1 simpler approach: **merge ways that share ≥80% overlap** (Turf line overlap / buffer intersection) keeping the longer centerline.
3. Simpler v1 fallback: use each OSM way as-is but **dedupe pellets** whose positions are within 5 m of an existing pellet (spatial hash).

Prefer **centerline from OSM geometry** as returned by Overpass (`out geom`); do not split by oneway—one line, one pellet series.

---

## 6. Pellet generation

### 6.1 Spacing

Fixed **world-meter spacing** (not zoom-dependent):

- Start with **25 m** interval (tunable constant in config).
- At neighborhood zoom (~15–16), this yields visible dots without clutter; adjust after visual QA in your Toronto isochrone.

Algorithm per street segment:

1. Convert segment to a line in meters (Turf `length` + `along` or project to local UTM / equirectangular for the small area).
2. Place points at `0, spacing, 2*spacing, …, length` (include endpoints or not—recommend **include both ends** if segment > spacing).
3. Clip pellets to **inside isochrone** (`booleanPointInPolygon`); drop outside points.

### 6.2 Scale expectations

A 15-minute bike isochrone might contain **500–2000+ street segments** and **5k–30k pellets**. Plan for:

- Generate asynchronously in a **Web Worker** with progress UI (“Generating pellets… 42%”).
- Store pellets in IndexedDB; render via MapLibre **GeoJSON source** with clustering disabled (or use circle layer with `filter: ["!", ["get", "eaten"]]`).

### 6.3 Stable IDs

`pelletId = hash(levelId + osmWayId + index)` so re-generation after app update doesn’t duplicate eaten state if geometry unchanged.

---

## 7. Map rendering

### 7.1 Base tiles

Start with a **free OSM-derived style**:

- **OpenFreeMap** vector tiles, or
- MapLibre demo + raster OSM tiles (simpler, less pretty)

Attribution: © OpenStreetMap contributors (required).

Keep style URL in config for easy swap to MapTiler/Mapbox/custom later.

### 7.2 Layers (bottom → top)

1. Base map
2. Isochrone fill + outline
3. Filtered-out streets (optional faint gray, debug)
4. Active street lines (optional, very subtle)
5. **Pellets** — small circles, bright “game” color; eaten pellets removed from source or filtered out
6. **User location** — pulsing dot + accuracy ring
7. HUD — completion %, pellets remaining

### 7.3 Visual tone

Game-like but not Pac-Man clone:

- Rounded UI, playful accent color, subtle glow on nearby uneaten pellets
- No copyrighted Pac-Man sprites; original pellet shape (dots, diamonds, or hexes)
- Light confetti/haptic on eat (optional polish)

---

## 8. GPS tracking and pellet collection

### 8.1 Permissions

v1: **`navigator.geolocation.watchPosition`** while app is in foreground.

- Request `enableHighAccuracy: true`, `maximumAge: 5000`, `timeout: 15000`.
- Show clear permission rationale before prompt.

### 8.2 Collection rule

**One pellet at a time:** on each GPS update, find the **single nearest uneaten pellet** within capture radius. If multiple are in range, eat only the closest (prevents mass collection at intersections).

Suggested capture parameters (tune during field testing):

| Parameter | Initial value | Notes |
|-----------|---------------|-------|
| Capture radius | **20 m** | Forgiving for bike GPS (~5–15 m error) |
| Max speed | none (trust user) | |
| Dwell time | **none** | Eat immediately when within 20 m of nearest uneaten pellet |

When eaten:

1. Set `eaten: true`, `eatenAt: now`, optional `eatenLocation`.
2. Update stats.
3. Remove from map source (or flip property for filter).
4. Persist immediately to IndexedDB.

### 8.3 Performance

- Insert uneaten pellets into **rbush** R-tree.
- On GPS tick: query bbox `(lon ± δ, lat ± δ)` then exact distance to nearest candidate only.
- Throttle GPS handling to ~1 Hz even if OS delivers faster.

### 8.4 Screen-on constraint

No background service in v1. Show a **“Keep app open while riding”** banner. Future Capacitor APK can add foreground service + `ACCESS_BACKGROUND_LOCATION` if needed.

---

## 9. Stats and export

### 9.1 Stats (v1)

- **Completion %** = eaten / total × 100 (main HUD number)
- Pellets eaten / total (e.g. `1,247 / 8,932`)
- Optional: streak (days with ≥1 pellet), last ride date—cheap to add from `eatenAt` timestamps

Simple stats screen + small overlay on map.

### 9.2 Export

**Formats:**

1. **Progress JSON** — level metadata + all pellets with eaten flags (full backup / restore).
2. **GeoJSON FeatureCollection** — Point features for eaten vs uneaten (good for QGIS / other tools).
3. **GPX** — track points from GPS log if recorded; waypoint per eaten pellet.

Export via browser download (`Blob` + `<a download>`). Import JSON restores level state (v1 nice-to-have; plan schema now).

---

## 10. Setup UX (v1 wizard)

1. **Welcome** — explain the concept in one screen.
2. **Set home** — address search via **Nominatim** (free, send address to 3rd party—user OK with this) or “Use my location” / map pin. Home marker shown; not strictly required for pasted isochrone but needed for map centering and future live isochrones.
3. **Isochrone** — load default file or paste GeoJSON; preview on map.
4. **Generate** — fetch OSM → filter → pellets (progress bar).
5. **Play** — map + stats; prompt for location permission.

Allow **regenerate pellets** from cached OSM if spacing constant changes (preserve eaten state by pellet id intersection).

---

## 11. Local persistence

**IndexedDB** databases:

- `levels` — level config + isochrone GeoJSON
- `segments` — OSM street cache
- `pellets` — bulk pellet records (indexed by `levelId`, `eaten`)
- `meta` — app version, last export date

On startup: load level → load uneaten pellets into spatial index → render.

**Backup reminder:** IndexedDB can be cleared by browser; nudge user to export after big sessions.

---

## 12. Testing strategy

### 12.1 Browser dev

- **Desktop:** simulate GPS with Chrome DevTools Sensors (custom lat/lon) to verify eat logic along a known street.
- **Mobile:** HTTPS required for Geolocation—use `vite --host` + ngrok or deploy to static host (GitHub Pages, Cloudflare Pages) for phone testing.

### 12.2 Validation checklist

- [ ] Default isochrone loads; map fits bounds
- [ ] Overpass returns streets; private roads filtered
- [ ] Pellet count plausible; spacing looks good at zoom 15
- [ ] Walking simulated GPS along a line eats pellets in order
- [ ] Eaten pellets stay hidden after reload
- [ ] Completion % matches manual count on small test polygon
- [ ] Export JSON → clear IDB → import restores state

### 12.3 Test isochrone

Use a **tiny custom polygon** (3-block area) for fast iteration alongside the full Toronto default.

---

## 13. Path to APK (post-v1)

1. Add **Capacitor** to the Vite project.
2. Use **@capacitor/geolocation** (same eat logic).
3. Android permissions: `ACCESS_FINE_LOCATION` (foreground v1).
4. Build signed APK locally; sideload for personal use.
5. Optional: PWA install prompt in browser as intermediate step.

No backend required for APK.

---

## 14. Future: multiple levels

When adding levels later:

- Level picker on home screen.
- Each level: own home, pasted/API isochrone, mode, minutes, pellet set, stats.
- Map UI switches active `levelId`; spatial index rebuilt on switch.
- Export/import per level or whole app.

No v1 UI needed beyond nullable schema fields.

---

## 15. Future: live isochrone ($0 options)

| Approach | Cost | Notes |
|----------|------|-------|
| Paste GeoJSON (v1) | $0 | Current workflow |
| OpenRouteService isochrones | $0 tier with limits | Client-side fetch with API key |
| Valhalla public demo | Often restricted | Not reliable for production |
| Self-hosted OSRM/Valhalla | Server cost | Violates “no central service” only if *you* host; user said no *your* backend |

For $0 prototype after paste phase: ORS free API key stored in local config.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Overpass timeout on large isochrone | Split polygon; retry mirrors; cache results |
| 10k+ pellets slow on mobile | Web Worker generation; GeoJSON simplification; render only viewport pellets (advanced) |
| GPS drift eats wrong pellet | Nearest-only + capture radius; tune empirically |
| IndexedDB loss | Export JSON regularly |
| OSM tile usage policy | Use compliant free provider; cache tiles lightly in PWA later |
| Large GeoJSON paste | Validate size; your default file is ~3.4k lines—fine |

---

## 17. Implementation phases

### Phase 0 — Scaffold (1–2 days)

- Vite + React + TS, MapLibre, routing (single page OK)
- Load default isochrone; display mask on map

### Phase 1 — Streets (2–3 days)

- Overpass integration + caching
- Filter private roads; dedupe/simplify
- Draw street lines (debug layer)

### Phase 2 — Pellets (2–3 days)

- Worker-based generation at 25 m spacing
- Persist + render; tune spacing visually

### Phase 3 — GPS + eat logic (2 days)

- watchPosition, spatial index, eat + persist
- HUD stats

### Phase 4 — Polish v1 (2 days)

- Setup wizard, export GeoJSON/JSON/GPX
- Game-like styling pass
- Mobile HTTPS test deployment

**Rough total:** 2–3 weeks part-time to a solid personal v1.

---

## 18. Suggested project layout

```
pellet-town/
├── public/
│   └── default-isochrone.json      # renamed from .txt
├── src/
│   ├── components/                 # Map, HUD, Wizard, Stats
│   ├── geo/                        # overpass, pellets, isochrone, filter
│   ├── gps/                        # tracker, spatial index, eat logic
│   ├── db/                         # Dexie schema, import/export
│   ├── workers/                    # pellet-generation.worker.ts
│   ├── types/                      # Level, Pellet, etc.
│   └── App.tsx
├── PLAN.md
└── package.json
```

Remove or ignore the `uv init` Python scaffold when starting front-end work.

---

## 19. Summary

Pellet Town v1 is a **static-hosted React PWA** that loads a **pasted bike isochrone**, pulls **OSM streets** via Overpass, generates **fixed-spacing pellets** along deduplicated centerlines, and **collects them via foreground GPS** with **local IndexedDB persistence**, **completion stats**, and **export**. No backend; $0 services; browser first; Capacitor APK when ready. Schema and UX hooks leave room for **multiple levels** and **live isochrone APIs** later.
