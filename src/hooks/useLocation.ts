import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface LocationResult {
  coords: string; // "lat,lng"
  name: string;
}

export const useLocation = () => {
  const [loading, setLoading] = useState(false);

  const getCurrentLocation = useCallback(async (): Promise<LocationResult | null> => {
    setLoading(true);
    try {
      let lat: number;
      let lng: number;

      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else if ('geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else {
        return null;
      }

      const coords = `${lat.toFixed(6)},${lng.toFixed(6)}`;

      // Reverse geocoding via Nominatim (free, no API key)
      let name = coords;
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
          { headers: { 'Accept-Language': 'hr,en' } }
        );
        if (resp.ok) {
          const data = await resp.json();
          const addr = data.address;
          // Build a short human-readable name
          const parts = [
            addr?.road || addr?.pedestrian,
            addr?.suburb || addr?.neighbourhood,
            addr?.city || addr?.town || addr?.village,
          ].filter(Boolean);
          if (parts.length > 0) {
            name = parts.join(', ');
          }
        }
      } catch {
        // Keep coords as name fallback
      }

      return { coords, name };
    } catch (e) {
      console.error('[Location] Error:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getCurrentLocation, loading };
};
