import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map } from 'maplibre-gl'
import type { MultiPolygon } from 'geojson'
import circle from '@turf/circle'
import { point } from '@turf/helpers'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLE } from '../config'
import { isochroneBounds } from '../geo/isochrone'
import { uneatenPelletsToGeoJSON } from '../geo/pellets'
import type { Home, Pellet } from '../types'

interface UserLocation {
  lat: number
  lon: number
  accuracy?: number
}

interface MapViewProps {
  isochrone: MultiPolygon
  home: Home
  pellets: Pellet[]
  userLocation?: UserLocation
  debugMode?: boolean
  debugPlacementActive?: boolean
  onDebugPlace?: (position: { lat: number; lon: number }) => void
}

/** Centers on our tracked location — does not call GPS itself (avoids a second blue dot). */
class RecenterControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private map: Map | null = null
  private getLocation: () => UserLocation | undefined

  constructor(getLocation: () => UserLocation | undefined) {
    this.getLocation = getLocation
  }

  onAdd(map: Map): HTMLElement {
    this.map = map
    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'maplibregl-ctrl-recenter'
    this.button.title = 'Center on my location'
    this.button.setAttribute('aria-label', 'Center on my location')
    this.button.innerHTML =
      '<span class="maplibregl-ctrl-icon maplibregl-ctrl-recenter-icon" aria-hidden="true"></span>'
    this.button.addEventListener('click', this.handleClick)

    this.container.appendChild(this.button)
    this.syncEnabled()
    return this.container
  }

  onRemove(): void {
    this.button?.removeEventListener('click', this.handleClick)
    this.container?.parentNode?.removeChild(this.container)
    this.container = null
    this.button = null
    this.map = null
  }

  syncEnabled(): void {
    if (!this.button) return
    const hasLocation = Boolean(this.getLocation())
    this.button.disabled = !hasLocation
    this.button.title = hasLocation
      ? 'Center on my location'
      : 'Start riding to show your location'
  }

  private handleClick = (): void => {
    const location = this.getLocation()
    if (!location || !this.map) return

    this.map.easeTo({
      center: [location.lon, location.lat],
      zoom: Math.max(this.map.getZoom(), 16),
      duration: 600,
    })
  }
}

export function MapView({
  isochrone,
  home,
  pellets,
  userLocation,
  debugMode = false,
  debugPlacementActive = false,
  onDebugPlace,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const recenterControlRef = useRef<RecenterControl | null>(null)
  const pelletsRef = useRef(pellets)
  pelletsRef.current = pellets
  const userLocationRef = useRef(userLocation)
  userLocationRef.current = userLocation
  const accuracySourceId = 'user-accuracy'

  const syncPelletsLayer = (map: Map) => {
    const source = map.getSource('pellets') as GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: uneatenPelletsToGeoJSON(pelletsRef.current),
    })
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const bounds = isochroneBounds(isochrone)
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 40 },
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')

    const recenter = new RecenterControl(() => userLocationRef.current)
    recenterControlRef.current = recenter
    map.addControl(recenter, 'top-right')

    map.on('load', () => {
      map.addSource('isochrone', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: isochrone,
        },
      })

      map.addLayer({
        id: 'isochrone-fill',
        type: 'fill',
        source: 'isochrone',
        paint: {
          'fill-color': '#5eead4',
          'fill-opacity': 0.18,
        },
      })

      map.addLayer({
        id: 'isochrone-line',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#2dd4bf',
          'line-width': 2,
          'line-opacity': 0.8,
        },
      })

      map.addSource('pellets', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: uneatenPelletsToGeoJSON(pelletsRef.current),
        },
      })

      map.addLayer({
        id: 'pellets',
        type: 'circle',
        source: 'pellets',
        paint: {
          'circle-radius': 4,
          'circle-color': '#fde047',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fbbf24',
          'circle-opacity': 0.95,
        },
      })

      map.addSource('home', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { label: home.label ?? 'Home' },
          geometry: { type: 'Point', coordinates: [home.lon, home.lat] },
        },
      })

      map.addLayer({
        id: 'home',
        type: 'circle',
        source: 'home',
        paint: {
          'circle-radius': 8,
          'circle-color': '#fb7185',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addSource(accuracySourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'user-accuracy',
        type: 'fill',
        source: accuracySourceId,
        paint: {
          'fill-color': '#60a5fa',
          'fill-opacity': 0.15,
        },
      })

      syncPelletsLayer(map)
    })

    mapRef.current = map

    return () => {
      userMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
      recenterControlRef.current = null
    }
  }, [home.lat, home.lon, home.label, isochrone])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncPelletsLayer(map)
  }, [pellets])

  useEffect(() => {
    recenterControlRef.current?.syncEnabled()
  }, [userLocation])

  const onDebugPlaceRef = useRef(onDebugPlace)
  onDebugPlaceRef.current = onDebugPlace

  useEffect(() => {
    const map = mapRef.current
    if (!map || !debugMode || !debugPlacementActive) {
      map?.getCanvas().classList.remove('map-debug-placement')
      return
    }

    map.getCanvas().classList.add('map-debug-placement')

    const handler = (event: maplibregl.MapMouseEvent) => {
      onDebugPlaceRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    }

    map.on('click', handler)
    return () => {
      map.off('click', handler)
      map.getCanvas().classList.remove('map-debug-placement')
    }
  }, [debugMode, debugPlacementActive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!userLocation) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      const source = map.getSource(accuracySourceId) as GeoJSONSource | undefined
      source?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const markerClass = debugMode ? 'user-marker user-marker-debug' : 'user-marker'

    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.className = markerClass
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.getElement().className = markerClass
      userMarkerRef.current.setLngLat([userLocation.lon, userLocation.lat])
    }

    const source = map.getSource(accuracySourceId) as GeoJSONSource | undefined
    if (!source) return

    if (debugMode || !userLocation.accuracy) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    source.setData({
      type: 'FeatureCollection',
      features: [
        circle(point([userLocation.lon, userLocation.lat]), userLocation.accuracy, {
          units: 'meters',
          steps: 64,
        }),
      ],
    })
  }, [userLocation, debugMode])

  const mapClass = debugMode && debugPlacementActive ? 'map-view map-debug-active' : 'map-view'

  return <div ref={containerRef} className={mapClass} />
}
