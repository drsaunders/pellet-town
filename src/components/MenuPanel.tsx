import { exportSaveFile } from '../db/export'
import type { Level } from '../types'

interface MenuPanelProps {
  level: Level
  debugMode: boolean
  onToggleDebugMode: () => void
  onClose: () => void
  onReset: () => void
}

export function MenuPanel({
  level,
  debugMode,
  onToggleDebugMode,
  onClose,
  onReset,
}: MenuPanelProps) {
  return (
    <div className="menu-overlay" onClick={onClose}>
      <div className="panel menu-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Menu</h2>
        <p className="muted">{level.name}</p>

        <label className="toggle-row">
          <span>Debug mode</span>
          <input type="checkbox" checked={debugMode} onChange={onToggleDebugMode} />
        </label>
        <p className="hint">
          Purple dot, no GPS. Tap Start riding, then tap the map to place yourself and collect
          pellets.
        </p>

        <button onClick={() => void exportSaveFile(level)}>Export save file</button>
        <p className="hint">
          Downloads everything — your map, streets, pellets, and which ones you&apos;ve collected.
          Keep a copy in case browser data is cleared.
        </p>
        <button className="danger" onClick={onReset}>
          Reset level (delete local data)
        </button>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
