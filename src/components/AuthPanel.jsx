"use client";

import { useState } from 'react';
import { LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';
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

function AuthPanel({ session, setSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const supabase = getSupabaseBrowserClient();

  const signIn = async (event) => {
    event.preventDefault();
    setStatus('Signing in...');

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : 'Signed in.');
  };

  const signUp = async () => {
    setStatus('Creating account...');

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

    const { error } = await supabase.auth.signUp({ email, password });
    setStatus(error ? error.message : 'Account created. Check email confirmation if enabled.');
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setStatus('Signed out.');
  };

  const continueWithGoogle = async () => {
    setStatus('Opening Google sign in...');

    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }

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
        <div className="auth-user">
          <UserRound size={20} />
          <div>
            <span>Signed in</span>
            <strong>{session.user.email}</strong>
          </div>
          <button type="button" onClick={signOut}>
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>
      ) : (
        <div className="auth-form">
          <button className="google-auth-button" type="button" onClick={continueWithGoogle}>
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
                placeholder="At least 6 characters"
                required
              />
            </label>
            <div className="auth-actions">
              <button type="submit">
                <LogIn size={17} />
                Login
              </button>
              <button type="button" onClick={signUp}>
                Sign up
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
