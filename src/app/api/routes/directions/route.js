import { NextResponse } from 'next/server';

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

function readCoordinate(searchParams, key) {
  const value = Number(searchParams.get(key));

  if (!Number.isFinite(value)) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return null;
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  let pickupLat;
  let pickupLng;
  let deliveryLat;
  let deliveryLng;

  try {
    pickupLat = readCoordinate(searchParams, 'pickupLat');
    pickupLng = readCoordinate(searchParams, 'pickupLng');
    deliveryLat = readCoordinate(searchParams, 'deliveryLat');
    deliveryLng = readCoordinate(searchParams, 'deliveryLng');
  } catch (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 400 });
  }

  const coordinates = `${pickupLng},${pickupLat};${deliveryLng},${deliveryLat}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    alternatives: 'false',
  });

  const response = await fetch(`${OSRM_ROUTE_URL}/${coordinates}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AHV-Trucking-Services/1.0 local logistics inquiry app',
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Road route is temporarily unavailable.' }, { status: 502 });
  }

  const payload = await response.json();
  const route = payload.routes?.[0];

  if (!route?.geometry?.coordinates?.length) {
    return NextResponse.json({ error: 'No drivable route found for these markers.' }, { status: 404 });
  }

  const durationMinutes = route.duration / 60;

  return NextResponse.json({
    route: {
      provider: 'OSRM / OpenStreetMap',
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMinutes: Math.round(durationMinutes),
      durationText: formatDuration(durationMinutes),
    },
  });
}
