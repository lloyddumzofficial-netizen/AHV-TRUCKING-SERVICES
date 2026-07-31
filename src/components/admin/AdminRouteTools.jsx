"use client";

import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Navigation } from 'lucide-react';

function toCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function getRouteCoordinates(inquiry) {
  if (!inquiry) {
    return null;
  }

  const pickupLat = toCoordinate(inquiry.pickup_lat);
  const pickupLng = toCoordinate(inquiry.pickup_lng);
  const deliveryLat = toCoordinate(inquiry.delivery_lat);
  const deliveryLng = toCoordinate(inquiry.delivery_lng);

  if ([pickupLat, pickupLng, deliveryLat, deliveryLng].some((coordinate) => coordinate === null)) {
    return null;
  }

  return { pickupLat, pickupLng, deliveryLat, deliveryLng };
}

function buildGoogleMapsUrl(inquiry) {
  const coordinates = getRouteCoordinates(inquiry);
  if (!coordinates) {
    return '';
  }

  const params = new URLSearchParams({
    api: '1',
    origin: `${coordinates.pickupLat},${coordinates.pickupLng}`,
    destination: `${coordinates.deliveryLat},${coordinates.deliveryLng}`,
    travelmode: 'driving',
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildWazeUrl(inquiry) {
  const coordinates = getRouteCoordinates(inquiry);
  if (!coordinates) {
    return '';
  }

  return `https://waze.com/ul?ll=${coordinates.deliveryLat},${coordinates.deliveryLng}&navigate=yes`;
}

function AdminRouteTools({ inquiry }) {
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState('');
  const routeCoordinates = useMemo(() => getRouteCoordinates(inquiry), [inquiry]);
  const routeParams = useMemo(() => {
    if (!routeCoordinates) {
      return '';
    }

    return new URLSearchParams({
      pickupLat: String(routeCoordinates.pickupLat),
      pickupLng: String(routeCoordinates.pickupLng),
      deliveryLat: String(routeCoordinates.deliveryLat),
      deliveryLng: String(routeCoordinates.deliveryLng),
    }).toString();
  }, [routeCoordinates]);

  useEffect(() => {
    if (!routeParams) {
      setRoute(null);
      setStatus('');
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

  const canOpenExternalRoutes = Boolean(routeCoordinates);
  const googleMapsUrl = buildGoogleMapsUrl(inquiry);
  const wazeUrl = buildWazeUrl(inquiry);

  return (
    <section className="admin-route-tools">
      <div className="admin-detail-title">
        <MapPinned size={18} />
        <h4>Admin route review</h4>
      </div>

      <div className="admin-route-summary">
        <span>{route ? route.provider : 'Free route tools'}</span>
        <strong>
          {canOpenExternalRoutes
            ? route
              ? `${route.distanceKm.toLocaleString()} km - ${route.durationText || 'duration unavailable'}`
              : status || 'Ready for route review'
            : 'Set pickup and delivery coordinates first'}
        </strong>
        <small>
          {canOpenExternalRoutes
            ? 'Confirm truck access, ports, ferry routes, road restrictions, receiving schedule, and final quote manually.'
            : 'Open the location picker or update the inquiry address before using route links.'}
        </small>
      </div>

      <div className="admin-route-actions">
        {canOpenExternalRoutes ? (
          <>
            <a href={wazeUrl} target="_blank" rel="noreferrer">
              <Navigation size={16} />
              Waze delivery
            </a>
            <a href={googleMapsUrl} target="_blank" rel="noreferrer">
              <MapPinned size={16} />
              Google route
            </a>
          </>
        ) : (
          <>
            <span className="disabled" title="Pickup and delivery coordinates are required">
              <Navigation size={16} />
              Waze unavailable
            </span>
            <span className="disabled" title="Pickup and delivery coordinates are required">
              <MapPinned size={16} />
              Google unavailable
            </span>
          </>
        )}
      </div>
    </section>
  );
}

export default AdminRouteTools;
