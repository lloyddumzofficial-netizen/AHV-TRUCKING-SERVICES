import { NextResponse } from 'next/server';
import { createUploadUrl, getPublicObjectUrl, hasR2Config } from '../../../../lib/cloudflare/r2.js';
import { getUserFromRequest } from '../../../../lib/supabase/auth.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasR2Config()) {
    return NextResponse.json(
      { error: 'Cloudflare R2 is not configured. Add R2 environment variables before uploading cargo images.' },
      { status: 503 },
    );
  }

  const body = await request.json();
  const filename = String(body.filename || 'cargo-photo').replace(/[^a-zA-Z0-9._-]/g, '-');
  const contentType = String(body.contentType || '');
  const size = Number(body.size || 0);
  const uploadType = body.uploadType === 'profile' ? 'profile' : 'cargo';

  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 400 });
  }

  if (size <= 0) {
    return NextResponse.json({ error: 'Image file is empty.' }, { status: 400 });
  }

  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image must be 8MB or smaller.' }, { status: 400 });
  }

  const key = `${uploadType}/${user.id}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const uploadUrl = await createUploadUrl({ key, contentType });

  return NextResponse.json({
    key,
    uploadUrl,
    publicUrl: getPublicObjectUrl(key),
  });
}
