import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const requestedNext = requestUrl.searchParams.get('next') || '/inquire#auth';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/inquire#auth';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/?auth=failed#auth', requestUrl.origin));
  }

  const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });
  let error;

  try {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } catch {
    return NextResponse.redirect(new URL('/?auth=failed#auth', requestUrl.origin));
  }

  if (error) {
    return NextResponse.redirect(new URL('/?auth=failed#auth', requestUrl.origin));
  }

  return redirectResponse;
}
