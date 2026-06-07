import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playPelletDing, primePelletAudio } from './audio/pellet-ding'
import { MapView } from './components/MapView'
import { Hud } from './components/Hud'
import { MenuPanel } from './components/MenuPanel'
import { SetupWizard } from './components/SetupWizard'
import { computeLevelStats, db, getActiveLevelId } from './db'
import { PelletEater } from './gps/eat-logic'
import { applyUserPosition } from './gps/position'
import { GpsTracker } from './gps/tracker'
import { ScreenWakeLock } from './gps/wake-lock'
import type { Level, LevelStats, Pellet } from './types'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState<Level | null>(null)
  const [pellets, setPellets] = useState<Pellet[]>([])
  const [stats, setStats] = useState<LevelStats | null>(null)
  const [tracking, setTracking] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [userLocation, setUserLocation] = useState<
    { lat: number; lon: number; accuracy?: number } | undefined
  >()
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const eaterRef = useRef(new PelletEater())
  const trackerRef = useRef(new GpsTracker())
  const wakeLockRef = useRef(new ScreenWakeLock())
  const trackingRef = useRef(false)
  const debugModeRef = useRef(false)

  useEffect(() => {
    trackingRef.current = tracking
  }, [tracking])

  useEffect(() => {
    debugModeRef.current = debugMode
  }, [debugMode])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingRef.current && !debugModeRef.current) {
        void wakeLockRef.current.acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

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
    return () => {
      trackerRef.current.stop()
      void wakeLockRef.current.release()
    }
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

      playPelletDing(eaten.length)

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

  const processPosition = useCallback(
    async (position: { lat: number; lon: number; accuracy?: number }) => {
      setUserLocation(position)
      const eaten = await applyUserPosition(eaterRef.current, position, {
        skipThrottle: debugModeRef.current,
      })
      if (eaten.length > 0) {
        await handlePelletsEaten(eaten)
      }
    },
    [handlePelletsEaten],
  )

  const stopGpsTracking = useCallback(() => {
    trackerRef.current.stop()
    void wakeLockRef.current.release()
  }, [])

  const startGpsTracking = useCallback(() => {
    primePelletAudio()
    trackerRef.current.start(async (position) => {
      await processPosition({
        lat: position.lat,
        lon: position.lon,
        accuracy: position.accuracy,
      })
    })
    void wakeLockRef.current.request()
  }, [processPosition])

  const toggleTracking = useCallback(() => {
    if (tracking) {
      stopGpsTracking()
      setTracking(false)
      return
    }

    try {
      if (debugMode) {
        primePelletAudio()
        setTracking(true)
        return
      }

      startGpsTracking()
      setTracking(true)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not start GPS')
    }
  }, [debugMode, startGpsTracking, stopGpsTracking, tracking])

  const handleDebugPlace = useCallback(
    async (position: { lat: number; lon: number }) => {
      if (!debugMode || !tracking) return
      await processPosition(position)
    },
    [debugMode, processPosition, tracking],
  )

  const toggleDebugMode = useCallback(() => {
    setDebugMode((current) => {
      const next = !current
      if (next && tracking) {
        stopGpsTracking()
      } else if (!next && tracking) {
        try {
          startGpsTracking()
        } catch (error) {
          setToast(error instanceof Error ? error.message : 'Could not start GPS')
          setTracking(false)
        }
      }
      return next
    })
  }, [startGpsTracking, stopGpsTracking, tracking])

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

    stopGpsTracking()
    setTracking(false)
    setDebugMode(false)
    setUserLocation(undefined)
    setLevel(null)
    setPellets([])
    setStats(null)
    setMenuOpen(false)
  }, [level, stopGpsTracking])

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
        debugMode={debugMode}
        debugPlacementActive={debugMode && tracking}
        onDebugPlace={handleDebugPlace}
      />
      <Hud
        stats={stats}
        tracking={tracking}
        debugMode={debugMode}
        onToggleTracking={toggleTracking}
        onOpenMenu={() => setMenuOpen(true)}
      />
      {menuOpen && (
        <MenuPanel
          level={level}
          debugMode={debugMode}
          onToggleDebugMode={toggleDebugMode}
          onClose={() => setMenuOpen(false)}
          onReset={handleReset}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
