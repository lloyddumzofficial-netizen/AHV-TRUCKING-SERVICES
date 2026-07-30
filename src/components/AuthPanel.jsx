"use client";

import { useState } from 'react';
import { CheckCircle2, LogIn, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { getSupabaseBrowserClient } from '../lib/supabase/client.js';

function getAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return window.location.origin;
}

function getReturnPath() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (path === '/' || path === '/#auth') {
    return '/inquire#auth';
  }

  return path;
}

const MIN_PASSWORD_LENGTH = 6;

function AuthPanel({ session, setSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  // Every auth action is async against Supabase. Without this the buttons stayed
  // enabled and a rapid double tap fired duplicate signIn / signUp requests.
  const [busy, setBusy] = useState('');
  const supabase = getSupabaseBrowserClient();

  const isBusy = Boolean(busy);
  const userEmail = session?.user?.email || '';
  const displayName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || 'AHV Client';
  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'AH';

  /** Shared validation. signUp is type="button", so native form validation
   *  never ran for it — an empty email and a 1-char password got through. */
  const validateCredentials = () => {
    const trimmed = email.trim();

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('Enter a valid email address.');
      return null;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return null;
    }

    return { email: trimmed, password };
  };

  const signIn = async (event) => {
    event.preventDefault();
    if (isBusy) return;

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

    const credentials = validateCredentials();
    if (!credentials) return;

    setBusy('signIn');
    setStatus('Signing in...');

    try {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (data?.session) {
        setSession(data.session);
      }
      setStatus(error ? error.message : 'Signed in.');
    } finally {
      setBusy('');
    }
  };

  const signUp = async () => {
    if (isBusy) return;

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

    const credentials = validateCredentials();
    if (!credentials) return;

    setBusy('signUp');
    setStatus('Creating account...');

    try {
      const { data, error } = await supabase.auth.signUp(credentials);
      if (data?.session) {
        setSession(data.session);
      }
      setStatus(error ? error.message : 'Account created. Check email confirmation if enabled.');
    } finally {
      setBusy('');
    }
  };

  const signOut = async () => {
    if (isBusy) return;
    setBusy('signOut');

    try {
      await supabase?.auth.signOut();
      setSession(null);
      setStatus('Signed out.');
    } finally {
      setBusy('');
    }
  };

  const continueWithGoogle = async () => {
    if (isBusy) return;

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

    setBusy('google');
    setStatus('Opening Google sign in...');

    const origin = getAppOrigin();
    const nextPath = getReturnPath();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setStatus(error.message);
      // On success the browser navigates away, so only release on failure.
      setBusy('');
    }
  };

  return (
    <section className={`auth-panel ${session ? 'signed-in-panel' : ''}`} id="auth">
      {!session && (
        <div className="auth-copy">
          <ShieldCheck size={22} />
          <div>
            <span>Secure backend</span>
            <h2>Sign in to send an inquiry</h2>
            <p>Use Google to continue quickly. Your inquiry will be saved to the live backend after sign in.</p>
          </div>
        </div>
      )}

      {session ? (
        <div className="auth-user auth-user-card">
          <div className="auth-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}
          </div>
          <div className="auth-user-main">
            <div className="auth-user-topline">
              <span className="auth-verified-badge">
                <CheckCircle2 size={14} />
                Signed in
              </span>
            </div>
            <strong>{displayName}</strong>
            <p>
              <Mail size={14} />
              <span>{userEmail}</span>
            </p>
          </div>
          <button className="auth-logout-button" type="button" onClick={signOut} disabled={isBusy}>
            <LogOut size={17} />
            <span>{busy === 'signOut' ? 'Signing out…' : 'Logout'}</span>
          </button>
        </div>
      ) : (
        <div className="auth-form">
          <button className="google-auth-button" type="button" onClick={continueWithGoogle} disabled={isBusy}>
            <svg className="google-mark" aria-hidden="true" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.49 12.27c0-.83-.07-1.45-.22-2.09H12.24v3.8h6.47c-.13.94-.83 2.35-2.39 3.3l-.02.13 3.47 2.35.24.02c2.2-1.78 3.48-4.4 3.48-7.51z" />
              <path fill="#34A853" d="M12.24 22c3.15 0 5.79-.91 7.72-2.49l-3.68-2.5c-.98.6-2.3 1.02-4.04 1.02-3.08 0-5.69-1.78-6.62-4.25l-.14.01-3.61 2.44-.05.12C3.74 19.7 7.68 22 12.24 22z" />
              <path fill="#FBBC05" d="M5.62 13.78a5.54 5.54 0 0 1 0-3.56l-.01-.13-3.66-2.48-.12.05a9.1 9.1 0 0 0 0 8.68l3.79-2.56z" />
              <path fill="#EA4335" d="M12.24 5.97c2.19 0 3.67.83 4.51 1.52l3.3-2.82C18.02 3.02 15.39 2 12.24 2 7.68 2 3.74 4.3 1.83 7.66l3.79 2.56c.93-2.47 3.54-4.25 6.62-4.25z" />
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider">
            <span>or use email</span>
          </div>

          <form className="email-auth-form" onSubmit={signIn}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="client@email.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
            <div className="auth-actions">
              <button type="submit" disabled={isBusy}>
                <LogIn size={17} />
                {busy === 'signIn' ? 'Signing in…' : 'Login'}
              </button>
              <button type="button" onClick={signUp} disabled={isBusy}>
                {busy === 'signUp' ? 'Creating…' : 'Sign up'}
              </button>
            </div>
          </form>
        </div>
      )}

      {status && <p className="auth-status">{status}</p>}
    </section>
  );
}

export default AuthPanel;
