import { NextResponse } from 'next/server';
import { getPublicObjectUrl, hasR2Config, uploadObject } from '../../../lib/cloudflare/r2.js';
import { getUserFromRequest } from '../../../lib/supabase/auth.js';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

function cleanFilename(filename) {
  return String(filename || 'upload-photo').replace(/[^a-zA-Z0-9._-]/g, '-');
}

export async function POST(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasR2Config()) {
    return NextResponse.json(
      { error: 'Cloudflare R2 is not configured. Add R2 environment variables before uploading images.' },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const uploadType = formData.get('uploadType') === 'profile' ? 'profile' : 'cargo';

  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
  }

  if (!file.type?.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'Image file is empty.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image must be 8MB or smaller.' }, { status: 400 });
  }

  const filename = cleanFilename(file.name);
  const key = `${uploadType}/${user.id}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const body = Buffer.from(await file.arrayBuffer());

  await uploadObject({
    key,
    contentType: file.type,
    body,
  });

  return NextResponse.json({
    key,
    publicUrl: getPublicObjectUrl(key),
  });
}
