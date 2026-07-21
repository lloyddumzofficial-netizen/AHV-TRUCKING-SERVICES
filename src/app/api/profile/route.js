import { NextResponse } from 'next/server';
import { getRoleForEmail } from '../../../lib/admin/roles.js';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabase/admin.js';
import { getUserFromRequest } from '../../../lib/supabase/auth.js';

function missingBackendResponse() {
  return NextResponse.json(
    { error: 'Supabase database is not configured. Add SUPABASE_SERVICE_ROLE_KEY before using profiles.' },
    { status: 503 },
  );
}

function requiredString(value, field) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function isProfileComplete(profile) {
  return Boolean(profile.full_name && profile.phone && profile.location && profile.profile_image_url);
}

export async function GET(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  const supabase = getSupabaseAdminClient();
  const { data, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 502 });
  }

  if (!data) {
    const role = getRoleForEmail(user.email);

    if (role === 'admin') {
      const { data: adminProfile, error: adminProfileError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: user.id,
            email: user.email || '',
            role: 'admin',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        )
        .select('*')
        .single();

      if (adminProfileError) {
        return NextResponse.json({ error: adminProfileError.message }, { status: 502 });
      }

      return NextResponse.json({ profile: adminProfile });
    }

    return NextResponse.json({ profile: null });
  }

  const role = getRoleForEmail(user.email, data.role);

  if (role !== data.role) {
    const { data: updatedProfile, error: roleError } = await supabase
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('*')
      .single();

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 502 });
    }

    return NextResponse.json({ profile: updatedProfile });
  }

  return NextResponse.json({ profile: data });
}

export async function PUT(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  try {
    const body = await request.json();
    const existing = await getSupabaseAdminClient()
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const profile = {
      id: user.id,
      email: user.email || '',
      full_name: requiredString(body.fullName, 'Full name'),
      phone: requiredString(body.phone, 'Phone'),
      location: requiredString(body.location, 'Location'),
      profile_image_key: requiredString(body.profileImageKey, 'Profile photo'),
      profile_image_url: requiredString(body.profileImageUrl, 'Profile photo URL'),
      role: getRoleForEmail(user.email, existing.data?.role),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!isProfileComplete(profile)) {
      return NextResponse.json({ error: 'Complete profile is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error: saveError } = await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'id' })
      .select('*')
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 502 });
    }

    return NextResponse.json({ profile: data });
  } catch (saveError) {
    const status = saveError.message.includes('required') ? 400 : 502;
    return NextResponse.json({ error: saveError.message }, { status });
  }
}
