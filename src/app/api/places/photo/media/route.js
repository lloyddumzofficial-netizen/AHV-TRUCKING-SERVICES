import { NextResponse } from 'next/server';
import { enforceIpRateLimit } from '../../../../../lib/security/rateLimit.js';

// `name` is interpolated into a googleapis.com path with our billed API key
// attached, on an unauthenticated route. Without this allowlist a caller could
// traverse (`../../v1/places:searchText?...`) to any Places endpoint under our
// key. Google photo resource names look like `places/<id>/photos/<id>`.
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const MAX_WIDTH_PATTERN = /^\d{2,4}$/;

export async function GET(request) {
  const limited = enforceIpRateLimit(request, 'places-photo-media', { limit: 60, windowMs: 60000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const photoName = searchParams.get('name');
  const requestedWidth = searchParams.get('maxWidth') || '1200';
  const maxWidth = MAX_WIDTH_PATTERN.test(requestedWidth) ? requestedWidth : '1200';

  if (!process.env.GOOGLE_MAPS_API_KEY || !photoName) {
    return NextResponse.json({ error: 'Google place photo is not configured.' }, { status: 404 });
  }

  if (!PHOTO_NAME_PATTERN.test(photoName)) {
    return NextResponse.json({ error: 'Invalid photo reference.' }, { status: 400 });
  }

  const googlePhotoUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  googlePhotoUrl.searchParams.set('maxWidthPx', maxWidth);
  googlePhotoUrl.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(googlePhotoUrl, {
    redirect: 'follow',
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Google place photo is unavailable.' }, { status: 404 });
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const image = await response.arrayBuffer();

  return new NextResponse(image, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': contentType,
    },
  });
}
