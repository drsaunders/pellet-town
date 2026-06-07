export interface GpsPosition {
  lat: number
  lon: number
  accuracy?: number
  timestamp: number
}

export type GpsCallback = (position: GpsPosition) => void

export class GpsTracker {
  private watchId: number | null = null

  start(onUpdate: GpsCallback): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported in this browser')
    }

    this.stop()
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onUpdate({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
      },
      (error) => {
        console.error('GPS error', error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    )
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }

  get isTracking(): boolean {
    return this.watchId !== null
  }
}
