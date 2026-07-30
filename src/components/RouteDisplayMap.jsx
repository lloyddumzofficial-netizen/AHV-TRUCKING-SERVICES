"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { getSupabaseBrowserClient } from '../lib/supabase/client.js';
import { escapeHtml } from '../lib/security/sanitize.js';
import { fixAge, formatAge, isFixFresh } from '../lib/gps/tracking.js';

// How often the "Live / Stale" chip re-evaluates. Without this the chip is
// computed during render only, so it stays green indefinitely after the driver's
// last update until some unrelated re-render happens.
const FRESHNESS_TICK_MS = 10000;
// Duration of the truck marker glide between fixes.
const MARKER_ANIMATION_MS = 600;

function createMarkerIcon(color, size = 18) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${escapeHtml(color)};border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
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

async function fetchOsrmRoute(p1, p2, signal) {
  try {
    const params = new URLSearchParams({
      pickupLat: String(p1.lat),
      pickupLng: String(p1.lng),
      deliveryLat: String(p2.lat),
      deliveryLng: String(p2.lng),
    });
    const res = await fetch(`/api/routes/directions?${params.toString()}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.route?.coordinates?.length > 0) {
      return data.route.coordinates;
    }
  } catch {
    // Aborted, or OSRM unavailable — fall back to a straight line.
  }
  return null;
}

function formatGpsTime(value) {
  if (!value) return 'No live GPS yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No live GPS yet';
  return date.toLocaleString();
}

/** Numeric coordinate or null. Never treats a legitimate 0 as absent. */
function toCoord(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** ms timestamp for ordering comparisons, or 0 when unknown. */
function toTime(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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
  driverFixAt,
  driverTrackingActive,
  inquiryReference,
  height,
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const truckMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const routeLayersRef = useRef([]);
  const routePointsRef = useRef(null);
  const animationRef = useRef(null);
  const hasFittedRef = useRef(false);

  // Single piece of live driver state so an update is always internally
  // consistent (position and its own timestamp move together).
  const [live, setLive] = useState(() => ({
    lat: toCoord(driverLat),
    lng: toCoord(driverLng),
    location: driverLocation,
    accuracy: driverAccuracy,
    speed: driverSpeedKph,
    heading: driverHeading,
    updatedAt: driverUpdatedAt,
    fixAt: driverFixAt || driverUpdatedAt,
    active: driverTrackingActive,
  }));

  const [isAutoTracking, setIsAutoTracking] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [, setFreshnessTick] = useState(0);

  const pickupLat = toCoord(pickup?.lat);
  const pickupLng = toCoord(pickup?.lng);
  const deliveryLat = toCoord(delivery?.lat);
  const deliveryLng = toCoord(delivery?.lng);
  const hasRoute =
    pickupLat !== null && pickupLng !== null && deliveryLat !== null && deliveryLng !== null;

  // A newer position must never be replaced by an older one. Both the 30s parent
  // poll and the realtime channel feed this, and the poll can return a snapshot
  // older than what realtime already delivered.
  const applyUpdate = useCallback((next) => {
    setLive((current) => {
      if (toTime(next.fixAt) < toTime(current.fixAt)) return current;
      return { ...current, ...next };
    });
  }, []);

  // Sync props (initial load + parent poll) into live state.
  useEffect(() => {
    applyUpdate({
      lat: toCoord(driverLat),
      lng: toCoord(driverLng),
      location: driverLocation,
      accuracy: driverAccuracy,
      speed: driverSpeedKph,
      heading: driverHeading,
      updatedAt: driverUpdatedAt,
      fixAt: driverFixAt || driverUpdatedAt,
      active: driverTrackingActive,
    });
  }, [
    applyUpdate,
    driverLat,
    driverLng,
    driverLocation,
    driverAccuracy,
    driverSpeedKph,
    driverHeading,
    driverUpdatedAt,
    driverFixAt,
    driverTrackingActive,
  ]);

  // Realtime subscription.
  useEffect(() => {
    if (!inquiryReference) return undefined;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRealtimeStatus('unavailable');
      return undefined;
    }

    const channel = supabase
      .channel(`public:inquiries:ref=${inquiryReference}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inquiries',
          filter: `reference=eq.${inquiryReference}`,
        },
        (payload) => {
          const row = payload.new || {};
          const lat = toCoord(row.driver_lat);
          const lng = toCoord(row.driver_lng);

          const next = {
            location: row.driver_location,
            accuracy: row.driver_accuracy_m,
            speed: row.driver_speed_kph,
            heading: row.driver_heading,
            updatedAt: row.driver_updated_at,
            fixAt: row.driver_fix_at || row.driver_updated_at,
            active: row.driver_tracking_active,
          };

          // A "stop tracking" update legitimately carries no coordinates. Gating
          // the whole handler on coordinates meant the viewer never learned that
          // tracking had ended.
          if (lat !== null && lng !== null) {
            next.lat = lat;
            next.lng = lng;
          }

          applyUpdate(next);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
          setRealtimeStatus('reconnecting');
        } else if (subscriptionStatus === 'CLOSED') setRealtimeStatus('closed');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyUpdate, inquiryReference]);

  // Re-evaluate freshness on a timer so the chip ages without user interaction.
  useEffect(() => {
    const id = window.setInterval(() => setFreshnessTick((n) => n + 1), FRESHNESS_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ------------------------------------------------------------------
  // 1. Create the Leaflet instance exactly once
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (mapRef.current || !mapElementRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    // Any manual interaction detaches the follow camera.
    const detach = () => setIsAutoTracking(false);
    map.on('dragstart', detach);
    map.on('wheel', detach);
    map.on('touchstart', detach);
    map.on('zoomstart', detach);
    map.on('keypress', detach);

    mapRef.current = map;

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      map.remove();
      // Every layer belonged to the map just destroyed. Leaving these populated
      // meant a StrictMode remount called setLatLng on an orphaned marker.
      mapRef.current = null;
      truckMarkerRef.current = null;
      accuracyCircleRef.current = null;
      routeLayersRef.current = [];
      routePointsRef.current = null;
      hasFittedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // 2. Draw the static route — only when the endpoints actually change
  // ------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasRoute) return undefined;

    const controller = new AbortController();
    let isMounted = true;

    routeLayersRef.current.forEach((layer) => layer.remove());
    routeLayersRef.current = [];

    const pLatLng = [pickupLat, pickupLng];
    const dLatLng = [deliveryLat, deliveryLng];

    const pMarker = L.marker(pLatLng, { icon: createMarkerIcon('#16a34a', 20) })
      .bindTooltip('Pickup', { direction: 'top' })
      .addTo(map);
    const dMarker = L.marker(dLatLng, { icon: createMarkerIcon('#ef4444', 20) })
      .bindTooltip('Delivery', { direction: 'top' })
      .addTo(map);

    routeLayersRef.current.push(pMarker, dMarker);

    // Fit once. Re-fitting on every realtime tick used to yank the camera away
    // from wherever the user had panned.
    if (!hasFittedRef.current) {
      map.fitBounds(L.latLngBounds([pLatLng, dLatLng]), { padding: [50, 50] });
      hasFittedRef.current = true;
    }

    (async () => {
      const routePoints = await fetchOsrmRoute(
        { lat: pickupLat, lng: pickupLng },
        { lat: deliveryLat, lng: deliveryLng },
        controller.signal,
      );
      if (!isMounted || !mapRef.current) return;

      routePointsRef.current = routePoints;

      const polyline = routePoints
        ? L.polyline(routePoints, { color: '#16a34a', weight: 6, opacity: 0.8 })
        : L.polyline([pLatLng, dLatLng], {
            color: '#16a34a',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.6,
          });

      polyline.addTo(map);
      routeLayersRef.current.push(polyline);
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
    // Primitive deps only. Depending on the `pickup`/`delivery` objects re-ran
    // this on every parent render, re-fetching OSRM on each 30s poll.
  }, [hasRoute, pickupLat, pickupLng, deliveryLat, deliveryLng]);

  // ------------------------------------------------------------------
  // 3. Truck marker, accuracy circle, follow camera
  // ------------------------------------------------------------------
  const driverCoordValid = live.lat !== null && live.lng !== null;
  const driverAccuracyM = Number(live.accuracy);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasRoute) return;

    let truckLatLng;

    if (driverCoordValid) {
      truckLatLng = [live.lat, live.lng];
    } else {
      // No GPS: estimate a position along the route from the status.
      let progress = 0;
      if (status === 'picked_up' || status === 'for_pickup') progress = 0.1;
      else if (status === 'in_transit') progress = 0.5;
      else if (status === 'delivered') progress = 1.0;

      const points = routePointsRef.current;
      if (points && points.length > 1) {
        const idx = Math.floor(progress * (points.length - 1));
        truckLatLng = points[Math.min(idx, points.length - 1)];
      } else {
        truckLatLng = [
          pickupLat + (deliveryLat - pickupLat) * progress,
          pickupLng + (deliveryLng - pickupLng) * progress,
        ];
      }
    }

    if (!truckLatLng) return;

    const isLive = Boolean(live.active) && isFixFresh(live.fixAt);
    const label = live.location ? `Truck: ${live.location}` : 'Truck Location';

    if (!truckMarkerRef.current) {
      truckMarkerRef.current = L.marker(truckLatLng, {
        icon: createTruckIcon(isLive),
        zIndexOffset: 1000,
      }).addTo(map);
      // Text node, not a string: Leaflet assigns string content via innerHTML,
      // and driver_location originates from an unauthenticated endpoint.
      truckMarkerRef.current.bindTooltip(document.createTextNode(label), { direction: 'top' });
    } else {
      const marker = truckMarkerRef.current;
      marker.setIcon(createTruckIcon(isLive));
      marker.setTooltipContent(document.createTextNode(label));

      // Glide to the new position instead of teleporting.
      const from = marker.getLatLng();
      const to = L.latLng(truckLatLng);
      window.cancelAnimationFrame(animationRef.current);

      if (from.distanceTo(to) > 1) {
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / MARKER_ANIMATION_MS);
          // easeOutQuad
          const eased = 1 - (1 - t) * (1 - t);
          marker.setLatLng([
            from.lat + (to.lat - from.lat) * eased,
            from.lng + (to.lng - from.lng) * eased,
          ]);
          if (t < 1 && mapRef.current) {
            animationRef.current = window.requestAnimationFrame(step);
          }
        };
        animationRef.current = window.requestAnimationFrame(step);
      } else {
        marker.setLatLng(to);
      }
    }

    // Accuracy circle: a +/-1500 m fix should not look like a precise pin.
    if (driverCoordValid && Number.isFinite(driverAccuracyM) && driverAccuracyM > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle(truckLatLng, {
          radius: driverAccuracyM,
          color: '#16a34a',
          weight: 1,
          opacity: 0.35,
          fillColor: '#16a34a',
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(truckLatLng);
        accuracyCircleRef.current.setRadius(driverAccuracyM);
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }

    if (isAutoTracking) {
      if (driverCoordValid) {
        // panTo, not setView(_, 15): hard-locking the zoom meant the user could
        // never follow the truck while zoomed out.
        map.panTo(truckLatLng, { animate: true });
      } else if (!hasFittedRef.current) {
        map.fitBounds(
          L.latLngBounds([[pickupLat, pickupLng], [deliveryLat, deliveryLng], truckLatLng]),
          { padding: [50, 50] },
        );
      }
    }
  }, [
    hasRoute,
    driverCoordValid,
    driverAccuracyM,
    live.lat,
    live.lng,
    live.active,
    live.fixAt,
    live.location,
    status,
    pickupLat,
    pickupLng,
    deliveryLat,
    deliveryLng,
    isAutoTracking,
  ]);

  const handleTrackClick = () => {
    setIsAutoTracking(true);
    if (mapRef.current && driverCoordValid) {
      mapRef.current.panTo([live.lat, live.lng], { animate: true });
    }
  };

  // Nothing to draw without both endpoints. Number() of a missing coordinate is
  // NaN, which used to slip past a truthiness guard and render an empty box.
  if (!hasRoute) return null;

  const statusLabel =
    status === 'delivered' ? 'Delivered ✅' :
    status === 'in_transit' ? 'Moving 🚛' :
    status === 'picked_up' ? 'Picked Up 📦' :
    'Pending Route';

  const age = fixAge(live.fixAt);
  const gpsFresh = isFixFresh(live.fixAt);
  const showingLive = driverCoordValid && gpsFresh && Boolean(live.active);

  let chipClass = 'gps-status-chip';
  let chipLabel = statusLabel;

  if (driverCoordValid && age !== null) {
    if (showingLive) {
      chipClass = 'gps-status-chip live';
      chipLabel = `Live · ${formatAge(age)}`;
    } else {
      chipClass = 'gps-status-chip stale';
      chipLabel = live.active ? `Stale · ${formatAge(age)}` : `Offline · ${formatAge(age)}`;
    }
  }

  const mapHeight = height || 'clamp(220px, 42vh, 420px)';

  return (
    <div className="route-live-map">
      <div className="route-live-map-head">
        <div>
          <span>Live route progress</span>
          <strong>{driverCoordValid ? 'Driver GPS visible' : 'Estimated route position'}</strong>
        </div>
        <div className="route-live-map-chips">
          {realtimeStatus === 'reconnecting' && (
            <span className="gps-status-chip reconnecting">Reconnecting…</span>
          )}
          <span className={chipClass}>{chipLabel}</span>
        </div>
      </div>
      <div className="route-gps-meta">
        <span>Last sync: <strong>{formatGpsTime(live.updatedAt)}</strong></span>
        <span>Accuracy: <strong>{Number.isFinite(driverAccuracyM) ? `${Math.round(driverAccuracyM)} m` : 'N/A'}</strong></span>
        <span>Speed: <strong>{Number.isFinite(Number(live.speed)) ? `${Math.round(Number(live.speed))} kph` : 'N/A'}</strong></span>
        <span>Heading: <strong>{Number.isFinite(Number(live.heading)) ? `${Math.round(Number(live.heading))} deg` : 'N/A'}</strong></span>
      </div>
      {live.location && (
        <p className="route-driver-location">
          Driver last reported at <strong>{live.location}</strong>
        </p>
      )}

      <div className="route-live-map-shell" style={{ height: mapHeight }}>
        <div ref={mapElementRef} className="route-live-map-frame" />

        {driverCoordValid && (
          <button
            type="button"
            className={isAutoTracking ? 'route-follow-btn is-following' : 'route-follow-btn'}
            onClick={handleTrackClick}
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
