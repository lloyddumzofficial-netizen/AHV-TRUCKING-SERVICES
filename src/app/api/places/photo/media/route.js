import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const photoName = searchParams.get('name');
  const maxWidth = searchParams.get('maxWidth') || '1200';

  if (!process.env.GOOGLE_MAPS_API_KEY || !photoName) {
    return NextResponse.json({ error: 'Google place photo is not configured.' }, { status: 404 });
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
