import type { LevelStats } from '../types'

interface HudProps {
  stats: LevelStats
  tracking: boolean
  debugMode: boolean
  onToggleTracking: () => void
  onOpenMenu: () => void
}

export function Hud({ stats, tracking, debugMode, onToggleTracking, onOpenMenu }: HudProps) {
  return (
    <>
      <div className="hud-top">
        <div className="stat-card primary">
          <span className="stat-label">Explored</span>
          <span className="stat-value">{stats.percentComplete.toFixed(1)}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pellets</span>
          <span className="stat-value">
            {stats.eatenPellets.toLocaleString()} / {stats.totalPellets.toLocaleString()}
          </span>
        </div>
        <button className="icon-button" onClick={onOpenMenu} aria-label="Menu">
          ☰
        </button>
      </div>

      <div className="hud-bottom">
        {!tracking && (
          <p className="banner">Tap Start riding and keep the app open to collect pellets.</p>
        )}
        {tracking && debugMode && (
          <p className="banner debug">Debug: tap the map to move and collect pellets.</p>
        )}
        {tracking && !debugMode && (
          <p className="banner awake">Screen stays awake while tracking.</p>
        )}
        <button className={`track-button ${tracking ? 'active' : ''}`} onClick={onToggleTracking}>
          {tracking ? 'Stop tracking' : 'Start riding'}
        </button>
      </div>
    </>
  )
}
