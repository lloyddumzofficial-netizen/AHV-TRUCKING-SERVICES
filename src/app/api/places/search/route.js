import { NextResponse } from 'next/server';
import { enforceIpRateLimit } from '../../../../lib/security/rateLimit.js';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

function hasGooglePlacesConfig() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

function mapGooglePlace(place) {
  const location = place.location || {};
  const photo = place.photos?.[0];

  return {
    id: place.id,
    name: place.displayName?.text || place.formattedAddress?.split(',')[0] || 'Selected place',
    address: place.formattedAddress || '',
    lat: Number(location.latitude),
    lng: Number(location.longitude),
    type: place.primaryTypeDisplayName?.text || place.primaryType || 'place',
    category: 'google_places',
    photoName: photo?.name || '',
    photoAttributions: photo?.authorAttributions || [],
    source: 'google',
  };
}

function mapPlaceResult(place) {
  return {
    id: `${place.osm_type}-${place.osm_id}`,
    name: place.name || place.namedetails?.name || place.display_name?.split(',')[0] || 'Selected place',
    address: place.display_name || '',
    lat: Number(place.lat),
    lng: Number(place.lon),
    type: place.type || place.class || 'place',
    category: place.class || '',
    photoName: '',
    source: 'openstreetmap',
  };
}

async function searchGooglePlaces(query) {
  const response = await fetch(GOOGLE_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.photos',
        'places.primaryType',
        'places.primaryTypeDisplayName',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: `${query}, Philippines`,
      pageSize: 6,
      regionCode: 'PH',
      languageCode: 'en',
    }),
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error('Google Places search is temporarily unavailable.');
  }

  const payload = await response.json();

  return (payload.places || [])
    .map(mapGooglePlace)
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

async function searchOpenStreetMap(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    countrycodes: 'ph',
    limit: '6',
  });

  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AHV-Trucking-Services/1.0 local logistics inquiry app',
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return [];
  }

  const places = await response.json();

  return places
    .map(mapPlaceResult)
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

export async function GET(request) {
  // Debounced type-ahead: ~1 request per keystroke burst per user is normal,
  // so 40/min is generous for a human and stops a scripted quota drain.
  const limited = enforceIpRateLimit(request, 'places-search', { limit: 40, windowMs: 60000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = hasGooglePlacesConfig()
      ? await searchGooglePlaces(query)
      : await searchOpenStreetMap(query);

    return NextResponse.json({ places });
  } catch {
    const fallbackPlaces = await searchOpenStreetMap(query).catch(() => []);

    return NextResponse.json({ places: fallbackPlaces });
  }
}
