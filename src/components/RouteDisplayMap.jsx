"use client";

import { useEffect, useRef } from 'react';
import L from 'leaflet';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function createMarkerIcon(color, size = 18) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createTruckIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#111827;color:white;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:2px solid white;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

async function fetchOsrmRoute(p1, p2) {
  try {
    const url = `${OSRM_BASE}/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.length > 0) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    }
  } catch {
    // silently fall back to straight line
  }
  return null;
}

function RouteDisplayMap({ pickup, delivery, status, driverLat, driverLng, driverLocation, height = '260px' }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    async function renderMap() {
      if (!mapRef.current && mapElementRef.current) {
        mapRef.current = L.map(mapElementRef.current, {
          zoomControl: true,
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 18,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      // Clear all previous layers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.GeoJSON) {
          map.removeLayer(layer);
        }
      });

      if (!pickup?.lat || !pickup?.lng || !delivery?.lat || !delivery?.lng) return;

      const pLatLng = [pickup.lat, pickup.lng];
      const dLatLng = [delivery.lat, delivery.lng];

      // Pickup marker (green)
      L.marker(pLatLng, { icon: createMarkerIcon('#16a34a', 20) })
        .bindTooltip('Pickup', { permanent: false, direction: 'top' })
        .addTo(map);

      // Delivery marker (red)
      L.marker(dLatLng, { icon: createMarkerIcon('#ef4444', 20) })
        .bindTooltip('Delivery', { permanent: false, direction: 'top' })
        .addTo(map);

      // Try real road route from OSRM
      const routePoints = await fetchOsrmRoute(pickup, delivery);

      if (!isMounted) return;

      if (routePoints) {
        L.polyline(routePoints, {
          color: '#16a34a',
          weight: 5,
          opacity: 0.75,
        }).addTo(map);
      } else {
        // Fallback: straight dotted line
        L.polyline([pLatLng, dLatLng], {
          color: '#16a34a',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.6,
        }).addTo(map);
      }

      // Determine truck position
      let truckLatLng = null;
      const driverCoordValid =
        driverLat && driverLng &&
        isFinite(Number(driverLat)) &&
        isFinite(Number(driverLng));

      if (driverCoordValid) {
        // Admin-pinned exact location
        truckLatLng = [Number(driverLat), Number(driverLng)];
      } else {
        // Fall back to progress-based position
        let progress = 0;
        if (status === 'picked_up' || status === 'for_pickup') progress = 0.1;
        else if (status === 'in_transit') progress = 0.5;
        else if (status === 'delivered') progress = 1.0;

        if (routePoints && routePoints.length > 1) {
          const idx = Math.floor(progress * (routePoints.length - 1));
          truckLatLng = routePoints[Math.min(idx, routePoints.length - 1)];
        } else {
          truckLatLng = [
            pLatLng[0] + (dLatLng[0] - pLatLng[0]) * progress,
            pLatLng[1] + (dLatLng[1] - pLatLng[1]) * progress,
          ];
        }
      }

      if (truckLatLng) {
        const marker = L.marker(truckLatLng, { icon: createTruckIcon() }).addTo(map);
        if (driverLocation) {
          marker.bindTooltip(`🚛 ${driverLocation}`, { permanent: true, direction: 'top', offset: [0, -18] });
        }
      }

      // Fit map
      const allPoints = [pLatLng, dLatLng, ...(truckLatLng ? [truckLatLng] : [])];
      map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
    }

    renderMap();

    return () => {
      isMounted = false;
    };
  }, [pickup, delivery, status, driverLat, driverLng, driverLocation]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!pickup || !delivery) return null;

  const statusLabel =
    status === 'delivered' ? 'Delivered ✅' :
    status === 'in_transit' ? 'Moving 🚛' :
    status === 'picked_up' ? 'Picked Up 📦' :
    'Pending Route';

  return (
    <div style={{ padding: '1rem', background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Visual Route Progress
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 700 }}>
          {statusLabel}
        </span>
      </div>
      {driverLocation && (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.75rem', fontWeight: 600 }}>
          📍 Driver last reported at: <strong style={{ color: 'var(--ink)' }}>{driverLocation}</strong>
        </p>
      )}
      <div
        ref={mapElementRef}
        style={{ width: '100%', height, borderRadius: '8px', overflow: 'hidden', background: 'var(--soft)' }}
      />
    </div>
  );
}

export default RouteDisplayMap;
