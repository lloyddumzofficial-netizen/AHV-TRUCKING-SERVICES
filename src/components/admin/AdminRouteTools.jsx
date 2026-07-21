"use client";

import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Navigation } from 'lucide-react';

function buildGoogleMapsUrl(inquiry) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${inquiry.pickup_lat},${inquiry.pickup_lng}`,
    destination: `${inquiry.delivery_lat},${inquiry.delivery_lng}`,
    travelmode: 'driving',
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildWazeUrl(inquiry) {
  return `https://waze.com/ul?ll=${inquiry.delivery_lat},${inquiry.delivery_lng}&navigate=yes`;
}

function AdminRouteTools({ inquiry }) {
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState('');
  const routeParams = useMemo(() => {
    if (!inquiry) {
      return '';
    }

    return new URLSearchParams({
      pickupLat: String(inquiry.pickup_lat),
      pickupLng: String(inquiry.pickup_lng),
      deliveryLat: String(inquiry.delivery_lat),
      deliveryLng: String(inquiry.delivery_lng),
    }).toString();
  }, [inquiry]);

  useEffect(() => {
    if (!routeParams) {
      return undefined;
    }

    const controller = new AbortController();
    setStatus('Calculating road route...');
    setRoute(null);

    fetch(`/api/routes/directions?${routeParams}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Route unavailable.');
        }

        setRoute(payload.route);
        setStatus('');
      })
      .catch((routeError) => {
        if (routeError.name === 'AbortError') {
          return;
        }

        setStatus('Road route unavailable. Use external maps for manual review.');
      });

    return () => controller.abort();
  }, [routeParams]);

  if (!inquiry) {
    return null;
  }

  return (
    <section className="admin-route-tools">
      <div className="admin-detail-title">
        <MapPinned size={18} />
        <h4>Admin route review</h4>
      </div>

      <div className="admin-route-summary">
        <span>{route ? route.provider : 'Free route tools'}</span>
        <strong>{route ? `${route.distanceKm.toLocaleString()} km - ${route.durationText || 'duration unavailable'}` : status || 'Ready for route review'}</strong>
        <small>Confirm truck access, ports, ferry routes, road restrictions, receiving schedule, and final quote manually.</small>
      </div>

      <div className="admin-route-actions">
        <a href={buildWazeUrl(inquiry)} target="_blank" rel="noreferrer">
          <Navigation size={16} />
          Waze delivery
        </a>
        <a href={buildGoogleMapsUrl(inquiry)} target="_blank" rel="noreferrer">
          <MapPinned size={16} />
          Google route
        </a>
      </div>
    </section>
  );
}

export default AdminRouteTools;
