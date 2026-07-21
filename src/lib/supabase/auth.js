import { createClient } from '@supabase/supabase-js';

export async function getUserFromRequest(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, error: 'Supabase environment variables are missing.' };
  }

  if (!token) {
    return { user: null, error: 'Missing Supabase access token.' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: error?.message || 'Invalid Supabase access token.' };
  }

  return { user: data.user, error: null };
}
