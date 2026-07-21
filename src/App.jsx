"use client";

import { useEffect, useMemo, useState } from 'react';
import { Truck, Menu, Phone, MessageCircle } from 'lucide-react';
import Hero from './components/Hero.jsx';
import TruckShowcase from './components/TruckShowcase.jsx';
import InquiryForm from './components/InquiryForm.jsx';
import Footer from './components/Footer.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import CustomerInquiryList from './components/CustomerInquiryList.jsx';
import AdminDashboard from './components/admin/AdminDashboard.jsx';
import { CONTACT_PHONE, CONTACT_PHONE_LABEL, SERVICE_LANES, TRUCK_INFO } from './data/siteContent.js';
import ProfileOnboarding from './components/profile/ProfileOnboarding.jsx';
import { getProfile } from './lib/profile/api.js';
import { getSupabaseBrowserClient } from './lib/supabase/client.js';

const CLIENT_VIEWS = {
  home: 'home',
  inquire: 'inquire',
  myInquiries: 'my-inquiries',
  track: 'track',
  truck: 'truck',
};

const VIEW_PATHS = {
  [CLIENT_VIEWS.home]: '/',
  [CLIENT_VIEWS.inquire]: '/inquire',
  [CLIENT_VIEWS.myInquiries]: '/my-inquiries',
  [CLIENT_VIEWS.truck]: '/#truck',
};

function App({ initialView = CLIENT_VIEWS.home, initialReference = '', adminOnly = false }) {
  const [inquiry, setInquiry] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [profileStatus, setProfileStatus] = useState('');
  const [clientView, setClientView] = useState(
    Object.values(CLIENT_VIEWS).includes(initialView) ? initialView : CLIENT_VIEWS.home,
  );
  const isAdmin = profile?.role === 'admin';
  const isProfileLoading = Boolean(authReady && session && profile === undefined);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSession(null);
      setProfile(null);
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      if (!data.session) {
        setProfile(null);
      }
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(nextSession ? undefined : null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !session?.access_token) {
      return;
    }

    let active = true;
    setProfile(undefined);
    setProfileStatus('Checking account...');

    getProfile(session.access_token)
      .then((loadedProfile) => {
        if (active) {
          setProfile(loadedProfile);
          setProfileStatus('');
        }
      })
      .catch((profileError) => {
        if (active) {
          setProfile(null);
          setProfileStatus(profileError.message || 'Could not load your account profile.');
        }
      });

    return () => {
      active = false;
    };
  }, [authReady, session?.access_token]);

  const navItems = useMemo(
    () => [
      ...(isAdmin || adminOnly
        ? [{ label: 'Dashboard', view: 'admin' }]
        : [
            { label: 'Home', view: CLIENT_VIEWS.home },
            { label: 'Truck', view: CLIENT_VIEWS.truck },
            { label: 'Inquire', view: CLIENT_VIEWS.inquire },
            { label: 'My Requests', view: CLIENT_VIEWS.myInquiries },
          ]),
    ],
    [adminOnly, isAdmin],
  );

  const navigateClient = (view) => {
    if (adminOnly) {
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setClientView(view);
    setMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', VIEW_PATHS[view] || '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!authReady || adminOnly || isAdmin || typeof window === 'undefined') {
      return;
    }

    const hashView = window.location.hash.replace('#', '');
    if ([CLIENT_VIEWS.home, CLIENT_VIEWS.inquire, CLIENT_VIEWS.myInquiries, CLIENT_VIEWS.truck].includes(hashView)) {
      setClientView(hashView);
    }
  }, [adminOnly, authReady, isAdmin]);

  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined' || window.location.pathname === '/admin') {
      return;
    }

    window.history.replaceState(null, '', '/admin');
  }, [isAdmin]);

  const returnToTop = () => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand brand-button" type="button" aria-label="AHV Trucking home" onClick={() => (isAdmin ? returnToTop() : navigateClient(CLIENT_VIEWS.home))}>
          <span className="brand-icon">
            <Truck size={22} />
          </span>
          <span>
            AHV
            <small>Trucking Services</small>
          </span>
        </button>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={`${item.label}-${item.view}`}
              className={!isAdmin && clientView === item.view ? 'active' : ''}
              type="button"
              onClick={() => {
                if (!isAdmin && !adminOnly) {
                  navigateClient(item.view);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {CONTACT_PHONE && (
          <a className="header-call" href={`tel:${CONTACT_PHONE}`}>
            <Phone size={17} />
            {CONTACT_PHONE_LABEL || 'Call'}
          </a>
        )}

        <button
          className="menu-button"
          aria-expanded={menuOpen}
          aria-label="Toggle mobile menu"
          type="button"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <Menu size={22} />
        </button>

        {menuOpen && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <button
                key={`mobile-${item.label}-${item.view}`}
                type="button"
                onClick={() => {
                  if (!isAdmin && !adminOnly) {
                    navigateClient(item.view);
                    return;
                  }

                  setMenuOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main>
        {!isAdmin && !adminOnly && <ProfileOnboarding session={session} profile={profile} setProfile={setProfile} />}
        {!authReady || isProfileLoading ? (
          <section className="app-screen app-loading-screen" aria-live="polite">
            <p className="eyebrow">AHV account</p>
            <h1>{profileStatus || 'Checking your session...'}</h1>
            <p>Please wait while we restore your account and dashboard access.</p>
          </section>
        ) : isAdmin ? (
          <AdminDashboard session={session} profile={profile} setSession={setSession} />
        ) : adminOnly ? (
          <section className="app-screen admin-gate">
            <div className="screen-heading">
              <p className="eyebrow">Admin dashboard</p>
              <h1>Sign in with an AHV admin account.</h1>
              <p>Only emails listed in ADMIN_EMAILS can open inquiry operations.</p>
            </div>
            <AuthPanel session={session} setSession={setSession} />
            {session && profile !== undefined && profile?.role !== 'admin' && (
              <p className="admin-access-warning">This signed-in email is not an AHV admin. Add it to ADMIN_EMAILS, restart the dev server, then refresh this page.</p>
            )}
          </section>
        ) : (
          <>
            {clientView === CLIENT_VIEWS.home && (
              <>
                <Hero
                  truck={TRUCK_INFO}
                  lanes={SERVICE_LANES}
                  onInquire={() => navigateClient(CLIENT_VIEWS.inquire)}
                  onViewTruck={() => navigateClient(CLIENT_VIEWS.truck)}
                />
                <section className="home-next-actions">
                  <button type="button" onClick={() => navigateClient(CLIENT_VIEWS.inquire)}>
                    Start Inquiry
                  </button>
                  <button type="button" onClick={() => navigateClient(CLIENT_VIEWS.truck)}>
                    View Truck Details
                  </button>
                </section>
              </>
            )}

            {clientView === CLIENT_VIEWS.truck && (
              <section className="app-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Truck service</p>
                  <h1>Green Isuzu wingvan for AHV route requests.</h1>
                  <button type="button" onClick={() => navigateClient(CLIENT_VIEWS.inquire)}>Inquire Delivery</button>
                </div>
                <TruckShowcase truck={TRUCK_INFO} lanes={SERVICE_LANES} />
              </section>
            )}

            {clientView === CLIENT_VIEWS.inquire && (
              <section className="app-screen inquiry-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Create inquiry</p>
                  <h1>Tell AHV where to pick up and deliver.</h1>
                  <p>Sign in, complete your profile, then submit pickup, delivery, cargo details, and photos.</p>
                </div>
                <AuthPanel session={session} setSession={setSession} />
                <InquiryForm onInquirySubmit={setInquiry} submittedInquiry={inquiry} session={session} profile={profile} />
              </section>
            )}

            {clientView === CLIENT_VIEWS.myInquiries && (
              <section className="app-screen my-inquiries-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Customer portal</p>
                  <h1>Track your AHV trucking requests.</h1>
                  <p>See live inquiry status, quote updates, pickup schedule, and delivery progress from AHV admin.</p>
                </div>
                <AuthPanel session={session} setSession={setSession} />
                <CustomerInquiryList session={session} heading="All saved inquiries" eyebrow="My requests" />
              </section>
            )}

            {clientView === CLIENT_VIEWS.track && (
              <section className="app-screen my-inquiries-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Tracking</p>
                  <h1>{initialReference || 'Track an AHV request'}</h1>
                  <p>Sign in with the same customer account used for the inquiry to view protected status updates.</p>
                </div>
                <AuthPanel session={session} setSession={setSession} />
                <CustomerInquiryList
                  session={session}
                  heading="Tracking details"
                  eyebrow="Inquiry reference"
                  reference={initialReference}
                />
              </section>
            )}
          </>
        )}
      </main>

      {!isAdmin && !adminOnly && (
        <button className={clientView === CLIENT_VIEWS.inquire || inquiry ? 'floating-inquire hidden' : 'floating-inquire'} type="button" onClick={() => navigateClient(CLIENT_VIEWS.inquire)}>
          <MessageCircle size={18} />
          Inquire
        </button>
      )}

      <Footer phone={CONTACT_PHONE} phoneLabel={CONTACT_PHONE_LABEL} />
    </div>
  );
}

export default App;
