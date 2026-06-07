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

interface MapViewProps {
  isochrone: MultiPolygon
  home: Home
  pellets: Pellet[]
  userLocation?: { lat: number; lon: number; accuracy?: number }
}

export function MapView({ isochrone, home, pellets, userLocation }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const accuracySourceId = 'user-accuracy'

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
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right')

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
          features: uneatenPelletsToGeoJSON(pellets),
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
    })

    mapRef.current = map

    return () => {
      userMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [home.lat, home.lon, home.label, isochrone])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const source = map.getSource('pellets') as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: uneatenPelletsToGeoJSON(pellets),
    })
  }, [pellets])

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

    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'user-marker'
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat([userLocation.lon, userLocation.lat])
    }

    if (userLocation.accuracy && map.getSource(accuracySourceId)) {
      const source = map.getSource(accuracySourceId) as GeoJSONSource
      source.setData({
        type: 'FeatureCollection',
        features: [
          circle(point([userLocation.lon, userLocation.lat]), userLocation.accuracy, {
            units: 'meters',
            steps: 64,
          }),
        ],
      })
    }
  }, [userLocation])

  return <div ref={containerRef} className="map-view" />
}
