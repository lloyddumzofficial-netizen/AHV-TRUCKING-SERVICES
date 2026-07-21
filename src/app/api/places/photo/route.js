import { NextResponse } from 'next/server';

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

function pickBestPhoto(pages) {
  const candidates = Object.values(pages || {})
    .map((page) => {
      const image = page.imageinfo?.[0];

      if (!image?.thumburl && !image?.url) {
        return null;
      }

      return {
        title: page.title?.replace(/^File:/, '') || 'Nearby place photo',
        imageUrl: image.thumburl || image.url,
        sourceUrl: image.descriptionurl || image.url,
        author: image.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') || '',
        license: image.extmetadata?.LicenseShortName?.value || '',
        width: Number(image.thumbwidth || image.width || 0),
        height: Number(image.thumbheight || image.height || 0),
      };
    })
    .filter(Boolean)
    .sort((first, second) => (second.width * second.height) - (first.width * first.height));

  return candidates[0] || null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const photoName = searchParams.get('photoName');
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (process.env.GOOGLE_MAPS_API_KEY && photoName) {
    return NextResponse.json({
      photo: {
        title: 'Google Places photo',
        imageUrl: `/api/places/photo/media?name=${encodeURIComponent(photoName)}&maxWidth=1200`,
        sourceUrl: 'https://www.google.com/maps',
        author: '',
        license: 'Google Places',
        width: 1200,
        height: 675,
        source: 'google',
      },
    });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ photo: null });
  }

  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: '1200',
    ggslimit: '10',
    ggsnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*',
  });

  const response = await fetch(`${COMMONS_API_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AHV-Trucking-Services/1.0 local logistics inquiry app',
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return NextResponse.json({ photo: null });
  }

  const payload = await response.json();

  return NextResponse.json({
    photo: pickBestPhoto(payload.query?.pages),
  });
}
