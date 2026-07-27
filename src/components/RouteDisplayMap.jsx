"use client";

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { getSupabaseBrowserClient } from '../lib/supabase/client.js';


function createMarkerIcon(color, size = 18) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createTruckIcon(isLive = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;background:${isLive ? '#16a34a' : '#111827'};color:white;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);border:3px solid white; transition: all 0.3s ease;">
      ${isLive ? '<span style="position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(22,163,74,.4);animation:pulseGps 1.5s infinite;"></span>' : ''}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    </div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

async function fetchOsrmRoute(p1, p2) {
  try {
    const params = new URLSearchParams({
      pickupLat: String(p1.lat),
      pickupLng: String(p1.lng),
      deliveryLat: String(p2.lat),
      deliveryLng: String(p2.lng),
    });
    const res = await fetch(`/api/routes/directions?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.route?.coordinates?.length > 0) {
      return data.route.coordinates;
    }
  } catch {
    // silently fall back to straight line
  }
  return null;
}

function formatGpsTime(value) {
  if (!value) return 'No live GPS yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No live GPS yet';
  return date.toLocaleString();
}

function RouteDisplayMap({
  pickup,
  delivery,
  status,
  driverLat,
  driverLng,
  driverLocation,
  driverAccuracy,
  driverSpeedKph,
  driverHeading,
  driverUpdatedAt,
  driverTrackingActive,
  inquiryReference,
  height = '400px',
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const truckMarkerRef = useRef(null);
  const routeLayersRef = useRef([]);
  const routePointsRef = useRef(null);

  // Local state to hold live driver coords if updated via realtime
  const [liveDriverLat, setLiveDriverLat] = useState(driverLat);
  const [liveDriverLng, setLiveDriverLng] = useState(driverLng);
  const [liveDriverMeta, setLiveDriverMeta] = useState({
    location: driverLocation,
    accuracy: driverAccuracy,
    speed: driverSpeedKph,
    heading: driverHeading,
    updatedAt: driverUpdatedAt,
    active: driverTrackingActive,
  });

  const [isAutoTracking, setIsAutoTracking] = useState(true);

  // Sync props to local state initially or when they change externally
  useEffect(() => {
    setLiveDriverLat(driverLat);
    setLiveDriverLng(driverLng);
    setLiveDriverMeta({
      location: driverLocation,
      accuracy: driverAccuracy,
      speed: driverSpeedKph,
      heading: driverHeading,
      updatedAt: driverUpdatedAt,
      active: driverTrackingActive,
    });
  }, [driverLat, driverLng, driverLocation, driverAccuracy, driverSpeedKph, driverHeading, driverUpdatedAt, driverTrackingActive]);

  // Supabase Realtime Subscription
  useEffect(() => {
    if (!inquiryReference) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase.channel(`public:inquiries:ref=${inquiryReference}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'inquiries',
        filter: `reference=eq.${inquiryReference}`
      }, (payload) => {
        if (payload.new.driver_lat && payload.new.driver_lng) {
          setLiveDriverLat(payload.new.driver_lat);
          setLiveDriverLng(payload.new.driver_lng);
          setLiveDriverMeta({
            location: payload.new.driver_location,
            accuracy: payload.new.driver_accuracy_m,
            speed: payload.new.driver_speed_kph,
            heading: payload.new.driver_heading,
            updatedAt: payload.new.driver_updated_at,
            active: payload.new.driver_tracking_active,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inquiryReference]);

  // 1. Map Initialization and Static Route
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isMounted = true;

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

      // Disable auto-tracking on manual map interaction
      mapRef.current.on('dragstart', () => setIsAutoTracking(false));
      mapRef.current.on('wheel', () => setIsAutoTracking(false));
      mapRef.current.on('touchstart', () => setIsAutoTracking(false));
    }

    const map = mapRef.current;

    // Clear previous static route layers
    routeLayersRef.current.forEach(layer => layer.remove());
    routeLayersRef.current = [];

    if (!pickup?.lat || !pickup?.lng || !delivery?.lat || !delivery?.lng) return;

    const pLatLng = [pickup.lat, pickup.lng];
    const dLatLng = [delivery.lat, delivery.lng];

    const pMarker = L.marker(pLatLng, { icon: createMarkerIcon('#16a34a', 20) })
      .bindTooltip('Pickup', { permanent: false, direction: 'top' })
      .addTo(map);
    const dMarker = L.marker(dLatLng, { icon: createMarkerIcon('#ef4444', 20) })
      .bindTooltip('Delivery', { permanent: false, direction: 'top' })
      .addTo(map);
      
    routeLayersRef.current.push(pMarker, dMarker);

    // Initial bounding
    let initialPoints = [pLatLng, dLatLng];
    map.fitBounds(L.latLngBounds(initialPoints), { padding: [50, 50] });

    async function fetchAndDrawRoute() {
      const routePoints = await fetchOsrmRoute(pickup, delivery);
      if (!isMounted) return;
      
      routePointsRef.current = routePoints;

      let polyline;
      if (routePoints) {
        polyline = L.polyline(routePoints, {
          color: '#16a34a',
          weight: 6,
          opacity: 0.8,
        }).addTo(map);
      } else {
        polyline = L.polyline([pLatLng, dLatLng], {
          color: '#16a34a',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.6,
        }).addTo(map);
      }
      routeLayersRef.current.push(polyline);
    }
    
    fetchAndDrawRoute();

    return () => {
      isMounted = false;
    };
  }, [pickup, delivery]); // ONLY re-run if pickup or delivery changes

  // 2. Truck Marker Updates & Auto-Tracking
  useEffect(() => {
    if (!mapRef.current) return;
    if (!pickup?.lat || !delivery?.lat) return;
    
    const map = mapRef.current;
    let truckLatLng = null;

    const driverCoordValid = liveDriverLat && liveDriverLng && isFinite(Number(liveDriverLat)) && isFinite(Number(liveDriverLng));

    if (driverCoordValid) {
      truckLatLng = [Number(liveDriverLat), Number(liveDriverLng)];
    } else {
      let progress = 0;
      if (status === 'picked_up' || status === 'for_pickup') progress = 0.1;
      else if (status === 'in_transit') progress = 0.5;
      else if (status === 'delivered') progress = 1.0;

      if (routePointsRef.current && routePointsRef.current.length > 1) {
        const idx = Math.floor(progress * (routePointsRef.current.length - 1));
        truckLatLng = routePointsRef.current[Math.min(idx, routePointsRef.current.length - 1)];
      } else {
        truckLatLng = [
          pickup.lat + (delivery.lat - pickup.lat) * progress,
          pickup.lng + (delivery.lng - pickup.lng) * progress,
        ];
      }
    }

    if (truckLatLng) {
      if (!truckMarkerRef.current) {
        truckMarkerRef.current = L.marker(truckLatLng, { icon: createTruckIcon(Boolean(liveDriverMeta.active)), zIndexOffset: 1000 })
          .bindTooltip(liveDriverMeta.location ? `Truck: ${liveDriverMeta.location}` : 'Truck Location', { permanent: false, direction: 'top' })
          .addTo(map);
      } else {
        truckMarkerRef.current.setLatLng(truckLatLng);
        truckMarkerRef.current.setIcon(createTruckIcon(Boolean(liveDriverMeta.active))); // Update icon state if active changed
      }

      // Auto-tracking camera logic
      if (isAutoTracking) {
        if (driverCoordValid) {
          // If we have live GPS, zoom in close to track the truck
          map.setView(truckLatLng, 15, { animate: true });
        } else {
          // If estimating, just make sure all points are in view
          const allPoints = [[pickup.lat, pickup.lng], [delivery.lat, delivery.lng], truckLatLng];
          map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
        }
      }
    }
  }, [liveDriverLat, liveDriverLng, liveDriverMeta, status, pickup, delivery, isAutoTracking]);

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

  const hasLiveGps = liveDriverLat && liveDriverLng;
  const gpsFresh = liveDriverMeta.updatedAt
    ? Date.now() - new Date(liveDriverMeta.updatedAt).getTime() < 120000
    : false;

  const handleTrackClick = () => {
    setIsAutoTracking(true);
    if (mapRef.current && hasLiveGps) {
      mapRef.current.setView([Number(liveDriverLat), Number(liveDriverLng)], 15, { animate: true });
    }
  };

  return (
    <div className="route-live-map">
      <div className="route-live-map-head">
        <div>
          <span>Live route progress</span>
          <strong>{hasLiveGps ? 'Driver GPS visible' : 'Estimated route position'}</strong>
        </div>
        <span className={gpsFresh && liveDriverMeta.active ? 'gps-status-chip live' : 'gps-status-chip'}>
          {gpsFresh && liveDriverMeta.active ? 'Live GPS' : statusLabel}
        </span>
      </div>
      <div className="route-gps-meta">
        <span>Last sync: <strong>{formatGpsTime(liveDriverMeta.updatedAt)}</strong></span>
        <span>Accuracy: <strong>{Number.isFinite(Number(liveDriverMeta.accuracy)) ? `${Math.round(Number(liveDriverMeta.accuracy))} m` : 'N/A'}</strong></span>
        <span>Speed: <strong>{Number.isFinite(Number(liveDriverMeta.speed)) ? `${Math.round(Number(liveDriverMeta.speed))} kph` : 'N/A'}</strong></span>
        <span>Heading: <strong>{Number.isFinite(Number(liveDriverMeta.heading)) ? `${Math.round(Number(liveDriverMeta.heading))} deg` : 'N/A'}</strong></span>
      </div>
      {liveDriverMeta.location && <p className="route-driver-location">Driver last reported at <strong>{liveDriverMeta.location}</strong></p>}
      
      <div style={{ position: 'relative', width: '100%', height }}>
        <div
          ref={mapElementRef}
          className="route-live-map-frame"
          style={{ height: '100%', width: '100%', borderRadius: '12px', border: '1px solid var(--line)' }}
        />
        
        {hasLiveGps && (
          <button
            type="button"
            onClick={handleTrackClick}
            style={{
              position: 'absolute',
              bottom: '24px',
              right: '24px',
              zIndex: 1000,
              backgroundColor: isAutoTracking ? '#16a34a' : '#ffffff',
              color: isAutoTracking ? '#ffffff' : '#111827',
              border: isAutoTracking ? 'none' : '1px solid #d1d5db',
              padding: '10px 16px',
              borderRadius: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <LocateFixed size={18} />
            {isAutoTracking ? 'Following Truck' : 'Find Truck'}
          </button>
        )}
      </div>
    </div>
  );
}

export default RouteDisplayMap;

