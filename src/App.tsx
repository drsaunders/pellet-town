import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapView } from './components/MapView'
import { Hud } from './components/Hud'
import { MenuPanel } from './components/MenuPanel'
import { SetupWizard } from './components/SetupWizard'
import { computeLevelStats, db, getActiveLevelId } from './db'
import { PelletEater } from './gps/eat-logic'
import { GpsTracker } from './gps/tracker'
import type { Level, LevelStats, Pellet } from './types'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState<Level | null>(null)
  const [pellets, setPellets] = useState<Pellet[]>([])
  const [stats, setStats] = useState<LevelStats | null>(null)
  const [tracking, setTracking] = useState(false)
  const [userLocation, setUserLocation] = useState<
    { lat: number; lon: number; accuracy?: number } | undefined
  >()
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const eaterRef = useRef(new PelletEater())
  const trackerRef = useRef(new GpsTracker())

  const refreshStats = useCallback(async (levelId: string) => {
    const next = await computeLevelStats(levelId)
    setStats(next)
  }, [])

  const loadLevel = useCallback(
    async (levelId: string) => {
      const loadedLevel = await db.levels.get(levelId)
      if (!loadedLevel) return

      const loadedPellets = await db.pellets.where('levelId').equals(levelId).toArray()
      setLevel(loadedLevel)
      setPellets(loadedPellets)
      eaterRef.current.loadPellets(loadedPellets)
      await refreshStats(levelId)
    },
    [refreshStats],
  )

  useEffect(() => {
    void (async () => {
      const activeId = await getActiveLevelId()
      if (activeId) {
        await loadLevel(activeId)
      }
      setLoading(false)
    })()
  }, [loadLevel])

  useEffect(() => {
    return () => trackerRef.current.stop()
  }, [])

  const handlePelletsEaten = useCallback(
    async (eaten: Pellet[]) => {
      if (eaten.length === 0) return

      const eatenById = new Map(eaten.map((pellet) => [pellet.id, pellet]))
      setPellets((current) =>
        current.map((p) => {
          const update = eatenById.get(p.id)
          return update ? { ...p, eaten: true, eatenAt: update.eatenAt } : p
        }),
      )

      if (level) {
        await refreshStats(level.id)
        const message =
          eaten.length === 1 ? 'Pellet collected!' : `${eaten.length} pellets collected!`
        setToast(message)
        window.setTimeout(() => setToast(null), 1500)
      }
    },
    [level, refreshStats],
  )

  const toggleTracking = useCallback(() => {
    if (tracking) {
      trackerRef.current.stop()
      setTracking(false)
      return
    }

    try {
      trackerRef.current.start(async (position) => {
        setUserLocation({
          lat: position.lat,
          lon: position.lon,
          accuracy: position.accuracy,
        })

        const eaten = await eaterRef.current.tryEatAllWithin(position.lat, position.lon)
        if (eaten.length > 0) {
          await handlePelletsEaten(eaten)
        }
      })
      setTracking(true)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not start GPS')
    }
  }, [handlePelletsEaten, tracking])

  const handleReset = useCallback(async () => {
    if (!level) return
    const confirmed = window.confirm('Delete this level and all progress from this device?')
    if (!confirmed) return

    await db.transaction('rw', [db.levels, db.segments, db.pellets, db.meta], async () => {
      await db.pellets.where('levelId').equals(level.id).delete()
      await db.segments.where('levelId').equals(level.id).delete()
      await db.levels.delete(level.id)
      await db.meta.put({ id: 'app', activeLevelId: undefined })
    })

    trackerRef.current.stop()
    setTracking(false)
    setLevel(null)
    setPellets([])
    setStats(null)
    setMenuOpen(false)
  }, [level])

  const ready = useMemo(() => !loading && level && stats, [loading, level, stats])

  if (loading) {
    return (
      <div className="app-shell loading">
        <p>Loading Pellet Town…</p>
      </div>
    )
  }

  if (!ready || !level || !stats) {
    return (
      <div className="app-shell setup">
        <SetupWizard
          onComplete={async (created) => {
            await loadLevel(created.id)
          }}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <MapView
        isochrone={level.isochrone}
        home={level.home}
        pellets={pellets}
        userLocation={userLocation}
      />
      <Hud
        stats={stats}
        tracking={tracking}
        onToggleTracking={toggleTracking}
        onOpenMenu={() => setMenuOpen(true)}
      />
      {menuOpen && (
        <MenuPanel
          level={level}
          onClose={() => setMenuOpen(false)}
          onReset={handleReset}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
