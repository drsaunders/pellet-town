import { useMemo, useState } from 'react'
import type { MultiPolygon } from 'geojson'
import { homeFromIsochrone, loadDefaultIsochrone, createLevelFromIsochrone } from '../geo/level-setup'
import { parseIsochroneJson } from '../geo/isochrone'
import type { Home, Level } from '../types'

interface SetupWizardProps {
  onComplete: (level: Level) => void
}

type Step = 'welcome' | 'isochrone' | 'generating' | 'error'

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [levelName, setLevelName] = useState('Home — bike')
  const [travelMinutes, setTravelMinutes] = useState(15)
  const [homeLabel, setHomeLabel] = useState('')
  const [pasteValue, setPasteValue] = useState('')
  const [progress, setProgress] = useState({ message: '', percent: 0 })
  const [error, setError] = useState<string | null>(null)

  const canContinue = useMemo(() => levelName.trim().length > 0, [levelName])

  async function handleUseDefault() {
    setError(null)
    setStep('generating')
    try {
      const isochrone = loadDefaultIsochrone()
      await runSetup(isochrone)
    } catch (err) {
      setError(formatSetupError(err))
      setStep('error')
    }
  }

  async function handlePasteSubmit() {
    setError(null)
    setStep('generating')
    try {
      const isochrone = parseIsochroneJson(pasteValue)
      await runSetup(isochrone)
    } catch (err) {
      setError(formatSetupError(err))
      setStep('error')
    }
  }

  async function runSetup(isochrone: MultiPolygon) {
    const home: Home = homeLabel.trim()
      ? { ...homeFromIsochrone(isochrone), label: homeLabel.trim() }
      : homeFromIsochrone(isochrone)

    const level = await createLevelFromIsochrone({
      name: levelName.trim(),
      home,
      travelMinutes,
      isochrone,
      onProgress: (message, percent) => {
        setProgress({ message, percent: percent ?? progress.percent })
      },
    })

    onComplete(level)
  }

  function formatSetupError(err: unknown): string {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return 'Network error talking to OpenStreetMap (Overpass). Check your connection, disable ad blockers for this site, and try again.'
    }
    if (err instanceof Error) return err.message
    return 'Setup failed'
  }

  if (step === 'welcome') {
    return (
      <div className="panel setup-panel">
        <div className="brand">
          <span className="brand-icon">◎</span>
          <h1>Pellet Town</h1>
        </div>
        <p className="lede">
          Explore every street within bike range of home. Collect pellets as you ride — one
          neighborhood at a time.
        </p>
        <label>
          Level name
          <input value={levelName} onChange={(e) => setLevelName(e.target.value)} />
        </label>
        <label>
          Travel time (minutes, metadata for now)
          <input
            type="number"
            min={1}
            max={120}
            value={travelMinutes}
            onChange={(e) => setTravelMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          Home label (optional)
          <input
            value={homeLabel}
            onChange={(e) => setHomeLabel(e.target.value)}
            placeholder="e.g. 123 Main St"
          />
        </label>
        <button disabled={!canContinue} onClick={() => setStep('isochrone')}>
          Continue
        </button>
      </div>
    )
  }

  if (step === 'isochrone') {
    return (
      <div className="panel setup-panel">
        <h2>Load isochrone</h2>
        <p>For the prototype, paste a bike isochrone GeoJSON or use the bundled default.</p>
        <button onClick={handleUseDefault}>Use default isochrone</button>
        <div className="divider">or paste GeoJSON</div>
        <textarea
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          placeholder="Paste FeatureCollection or Feature with Polygon / MultiPolygon…"
          rows={8}
        />
        <div className="row">
          <button className="secondary" onClick={() => setStep('welcome')}>
            Back
          </button>
          <button disabled={!pasteValue.trim()} onClick={handlePasteSubmit}>
            Generate map
          </button>
        </div>
      </div>
    )
  }

  if (step === 'generating') {
    return (
      <div className="panel setup-panel">
        <h2>Building your map</h2>
        <p>{progress.message || 'Starting…'}</p>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="hint">Fetching OSM streets and placing pellets. This can take a minute.</p>
      </div>
    )
  }

  return (
    <div className="panel setup-panel">
      <h2>Something went wrong</h2>
      <p className="error-text">{error}</p>
      <button onClick={() => setStep('isochrone')}>Try again</button>
    </div>
  )
}
