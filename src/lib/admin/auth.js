import { getRoleForEmail } from './roles.js';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../supabase/admin.js';
import { getUserFromRequest } from '../supabase/auth.js';

export async function getAdminContext(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return { user: null, profile: null, supabase: null, error, status: 401 };
  }

  if (!hasSupabaseAdminConfig()) {
    return {
      user,
      profile: null,
      supabase: null,
      error: 'Supabase database is not configured.',
      status: 503,
    };
  }

  const supabase = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { user, profile: null, supabase, error: profileError.message, status: 502 };
  }

  const role = getRoleForEmail(user.email, profile?.role);

  if (role !== 'admin') {
    return { user, profile, supabase, error: 'Admin access is required.', status: 403 };
  }

  // Reconcile an ADMIN_EMAILS-derived role into the row. This is a write on a
  // read path, so a failure must not be silent — but it also must not block the
  // request, since authorization already succeeded above.
  if (profile && profile.role !== 'admin') {
    const { error: syncError } = await supabase
      .from('user_profiles')
      .update({ role: 'admin', updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (syncError) {
      console.error('[admin] role sync failed for', user.id, syncError.message);
    }
  }

  return { user, profile: { ...(profile || {}), role: 'admin' }, supabase, error: null, status: 200 };
}
