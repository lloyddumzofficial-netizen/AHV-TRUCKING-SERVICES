"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Menu, Phone, MessageCircle, X, AlertTriangle } from 'lucide-react';
import Hero from './components/Hero.jsx';
import TruckShowcase from './components/TruckShowcase.jsx';
import InquiryForm from './components/InquiryForm.jsx';
import Footer from './components/Footer.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import CustomerInquiryList from './components/CustomerInquiryList.jsx';
import AdminDashboard from './components/admin/AdminDashboard.jsx';
import MobileNav from './components/MobileNav.jsx';
import { CONTACT_PHONE, CONTACT_PHONE_LABEL, SERVICE_LANES, TRUCK_INFO, FLEET } from './data/siteContent.js';
import ProfileOnboarding from './components/profile/ProfileOnboarding.jsx';
import { getProfile } from './lib/profile/api.js';
import { getNotifications } from './lib/notifications/api.js';
import { getSupabaseBrowserClient } from './lib/supabase/client.js';

const CLIENT_VIEWS = {
  home: 'home',
  inquire: 'inquire',
  myInquiries: 'my-inquiries',
  track: 'track',
  truck: 'truck',
  notifications: 'notifications',
  profile: 'profile',
};

const VIEW_PATHS = {
  [CLIENT_VIEWS.home]: '/',
  [CLIENT_VIEWS.inquire]: '/inquire',
  [CLIENT_VIEWS.myInquiries]: '/my-inquiries',
  [CLIENT_VIEWS.truck]: '/#truck',
  [CLIENT_VIEWS.track]: '/track',
  [CLIENT_VIEWS.notifications]: '/#notifications',
  [CLIENT_VIEWS.profile]: '/#profile',
};

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function CustomerNotifications({ session, setSession, onStartInquiry, onOpenInquiries, onNotificationsSeen }) {
  const [notifications, setNotifications] = useState([]);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!session?.access_token) {
      setNotifications([]);
      return;
    }

    setIsLoading(true);
    setStatus('Loading updates...');

    try {
      const data = await getNotifications(session.access_token, { limit: 20, days: 3 });
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      onNotificationsSeen?.(data.latestAt);
      setStatus('');
    } catch (error) {
      setStatus(error.message || 'Could not load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [onNotificationsSeen, session?.access_token]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  if (!session) {
    return (
      <section className="customer-dashboard-view">
        <div className="screen-heading">
          <p className="eyebrow">Notifications</p>
          <h1>Sign in to see AHV updates.</h1>
          <p>Your inquiry quote, pickup, and delivery notifications appear here.</p>
        </div>
        <AuthPanel session={session} setSession={setSession} />
      </section>
    );
  }

  return (
    <section className="customer-dashboard-view">
      <div className="screen-heading">
        <p className="eyebrow">Notifications</p>
        <h1>Latest AHV updates.</h1>
        <p>Quote, schedule, pickup, and delivery activity from your saved inquiries.</p>
      </div>

      <div className="customer-mini-panel">
        <div className="customer-mini-panel-head">
          <strong>Inquiry alerts</strong>
          <button type="button" onClick={loadNotifications} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {status && <p className="submit-status">{status}</p>}
        {/* Loading first. The previous `!isLoading && length === 0 ? empty : list`
            fell into the LIST branch while loading, rendering a blank panel. */}
        {isLoading && notifications.length === 0 ? (
          <div className="skeleton-card" aria-busy="true" aria-label="Loading updates">
            <div className="skeleton-pulse skeleton-title" />
            <div className="skeleton-pulse skeleton-line" />
            <div className="skeleton-pulse skeleton-line" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="premium-empty-state">
            <h3>No updates yet</h3>
            <p>Start an inquiry and AHV status updates will show up here.</p>
            <button type="button" onClick={onStartInquiry}>Request Quote</button>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((item) => (
              <button key={item.id} type="button" onClick={onOpenInquiries}>
                <span>{item.label}</span>
                <strong>{item.reference}</strong>
                <p>{item.message}</p>
                <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'No timestamp yet'}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CustomerProfileView({ session, setSession, profile, onStartInquiry, onOpenInquiries, onSignOut }) {
  if (!session) {
    return (
      <section className="customer-dashboard-view">
        <div className="screen-heading">
          <p className="eyebrow">Profile</p>
          <h1>Sign in to manage your AHV profile.</h1>
          <p>Your verified profile is required before submitting trucking inquiries.</p>
        </div>
        <AuthPanel session={session} setSession={setSession} />
      </section>
    );
  }

  return (
    <section className="customer-dashboard-view">
      <div className="screen-heading">
        <p className="eyebrow">Profile</p>
        <h1>Your AHV account.</h1>
        <p>These details help AHV admins verify and process your trucking requests.</p>
      </div>

      <div className="customer-profile-card">
        {profile?.profile_image_url ? (
          <img src={profile.profile_image_url} alt="Profile" />
        ) : (
          <div className="customer-profile-avatar">{profile?.full_name?.charAt(0) || session.user.email?.charAt(0) || 'A'}</div>
        )}
        <div>
          <span>Signed in as</span>
          <strong>{profile?.full_name || session.user.email}</strong>
          <p>{session.user.email}</p>
        </div>
      </div>

      <div className="customer-mini-panel profile-details-panel">
        <strong>Contact details</strong>
        <dl>
          <div>
            <dt>Phone</dt>
            <dd>{profile?.phone || 'Not set'}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{profile?.location || 'Not set'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{profile?.profile_image_url && profile?.phone && profile?.location ? 'Complete' : 'Needs completion'}</dd>
          </div>
        </dl>
        <div className="profile-action-row">
          <button type="button" onClick={onStartInquiry}>Request Quote</button>
          <button type="button" onClick={onOpenInquiries}>My Inquiries</button>
          <button type="button" onClick={onSignOut}>Logout</button>
        </div>
      </div>
    </section>
  );
}

function App({ initialView = CLIENT_VIEWS.home, initialReference = '', adminOnly = false }) {
  const [inquiry, setInquiry] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [profileStatus, setProfileStatus] = useState('');
  const [toasts, setToasts] = useState([]);
  const [trackingReference, setTrackingReference] = useState(initialReference || '');
  const [inquiryFilter, setInquiryFilter] = useState('all');
  const [notificationCount, setNotificationCount] = useState(0);
  const [clientView, setClientView] = useState(
    Object.values(CLIENT_VIEWS).includes(initialView) ? initialView : CLIENT_VIEWS.home,
  );
  const isAdmin = profile?.role === 'admin';
  const adminExperience = adminOnly || isAdmin;
  const isProfileLoading = Boolean(authReady && session && profile === undefined);

  const toastTimersRef = useRef([]);
  const notificationTimerRef = useRef(null);

  const notificationStorageKey = session?.user?.id ? `ahv-notifications-seen-${session.user.id}` : '';

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    // Date.now() alone collides for two toasts raised in the same millisecond:
    // React warns on the duplicate key and removeToast deletes both.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    const timer = window.setTimeout(() => removeToast(id), 4500);
    toastTimersRef.current.push(timer);
  }, [removeToast]);

  // Auto-dismiss timers outlived the component otherwise.
  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current = [];
  }, []);

  const markNotificationsSeen = useCallback((latestAt) => {
    if (!notificationStorageKey || typeof window === 'undefined') {
      return;
    }

    const seenAt = latestAt || new Date().toISOString();
    window.localStorage.setItem(notificationStorageKey, seenAt);
    setNotificationCount(0);
  }, [notificationStorageKey]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSession(null);
      setProfile(null);
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    // 7s, matching the profile fetch below. At 2s a slow Philippine mobile
    // connection routinely timed out and a signed-in user was told to sign in
    // again, with all their inquiries gone.
    withTimeout(supabase.auth.getSession(), 7000, 'Auth check timed out. Please sign in again.')
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        if (!data.session) {
          setProfile(null);
        }
        setAuthReady(true);
      })
      .catch((authError) => {
        if (!mounted) {
          return;
        }

        setProfileStatus(authError.message || 'Could not check your session.');
        setSession(null);
        setProfile(null);
        setAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession((prevSession) => {
        // Only clear profile if the actual user identity changes
        if (prevSession?.user?.id !== nextSession?.user?.id) {
          setProfile(nextSession ? undefined : null);
        }
        return nextSession;
      });
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !session?.user?.id) {
      return;
    }

    // Only fetch if profile is undefined (not yet loaded for this user)
    if (profile !== undefined) {
      return;
    }

    let active = true;
    setProfileStatus('Checking account...');

    withTimeout(getProfile(session.access_token), 7000, 'Profile check timed out. Please refresh or sign in again.')
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
  }, [authReady, session?.user?.id, session?.access_token, profile]);

  useEffect(() => {
    if (!authReady || !session?.access_token || adminExperience || !notificationStorageKey) {
      setNotificationCount(0);
      return undefined;
    }

    let active = true;

    const refreshNotificationBadge = async () => {
      try {
        const data = await getNotifications(session.access_token, { limit: 12, days: 3 });
        if (!active) return;

        const seenAt = window.localStorage.getItem(notificationStorageKey) || '';
        const seenTime = seenAt ? new Date(seenAt).getTime() : 0;
        const unreadCount = (data.notifications || []).filter((item) => {
          const createdTime = new Date(item.createdAt || 0).getTime();
          return Number.isFinite(createdTime) && createdTime > seenTime;
        }).length;

        setNotificationCount(Math.min(unreadCount, 9));
      } catch {
        if (active) setNotificationCount(0);
      }
    };

    refreshNotificationBadge();
    notificationTimerRef.current = window.setInterval(refreshNotificationBadge, 60000);

    return () => {
      active = false;
      window.clearInterval(notificationTimerRef.current);
      notificationTimerRef.current = null;
    };
  }, [adminExperience, authReady, notificationStorageKey, session?.access_token]);

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

  const openProtectedView = (view, message = 'Sign in first to access this feature.') => {
    if (!session) {
      addToast(message, 'info');
      navigateClient(CLIENT_VIEWS.inquire);
      return;
    }

    navigateClient(view);
  };

  const openMyInquiries = (filter = 'all') => {
    setInquiryFilter(filter);
    openProtectedView(CLIENT_VIEWS.myInquiries, 'Sign in first to view your AHV inquiries.');
  };

  const openNotifications = () => {
    markNotificationsSeen();
    openProtectedView(CLIENT_VIEWS.notifications, 'Sign in first to view AHV notifications.');
  };

  const openProfile = () => {
    openProtectedView(CLIENT_VIEWS.profile, 'Sign in first to manage your AHV profile.');
  };

  const openSupport = () => {
    if (CONTACT_PHONE && typeof window !== 'undefined') {
      window.location.href = `tel:${CONTACT_PHONE}`;
      return;
    }

    addToast('AHV phone number is not configured yet.', 'error');
  };

  const trackReference = (rawReference) => {
    const reference = rawReference.trim().toUpperCase();

    if (!reference) {
      addToast('Enter your AHV tracking or inquiry reference first.', 'error');
      return;
    }

    setTrackingReference(reference);
    setClientView(CLIENT_VIEWS.track);
    setMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/track/${encodeURIComponent(reference)}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!authReady || adminOnly || isAdmin || typeof window === 'undefined') {
      return;
    }

    const hashView = window.location.hash.replace('#', '');
    if ([CLIENT_VIEWS.home, CLIENT_VIEWS.inquire, CLIENT_VIEWS.myInquiries, CLIENT_VIEWS.truck, CLIENT_VIEWS.notifications, CLIENT_VIEWS.profile].includes(hashView)) {
      setClientView(hashView);
    }
  }, [adminOnly, authReady, isAdmin]);

  // Global Scroll Animation Observer
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const timer = setTimeout(() => {
      document.querySelectorAll('.scroll-animate').forEach((el) => {
        observer.observe(el);
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [clientView]);

  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined' || window.location.pathname === '/admin') {
      return;
    }

    window.history.replaceState(null, '', '/admin');
  }, [isAdmin]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      navigateClient(CLIENT_VIEWS.home);
    }
  };

  const returnToTop = () => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMobileNavigate = (view) => {
    if (view === CLIENT_VIEWS.myInquiries) {
      openMyInquiries('all');
      return;
    }

    if (view === CLIENT_VIEWS.notifications) {
      openNotifications();
      return;
    }

    if (view === CLIENT_VIEWS.profile) {
      openProfile();
      return;
    }

    navigateClient(view);
  };

  return (
    <div className={`app-shell ${adminExperience ? 'admin-app-shell' : ''}`}>
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map(({ id, message, type }) => (
            <div key={id} className={`toast toast-${type}`}>
              {type === 'success' && <CheckCircle2 size={16} />}
              {type === 'error' && <AlertTriangle size={16} />}
              <span>{message}</span>
              <button type="button" className="toast-close" onClick={() => removeToast(id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!adminExperience && (
      <header className="site-header">
        <button className="brand brand-button" type="button" aria-label="AHV Trucking home" onClick={() => (isAdmin ? returnToTop() : navigateClient(CLIENT_VIEWS.home))}>
          <img src="/SVG/HEADER LOGO.svg" alt="AHV Logo" className="brand-logo-img" />
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
          {session && (
            <button className="logout-button" type="button" onClick={handleSignOut} style={{ color: 'var(--red)', fontWeight: '600' }}>
              Logout
            </button>
          )}
        </nav>

        {!isAdmin && profile && profile.full_name && (
          <button 
            className="header-profile" 
            onClick={openProfile}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            title="View My Inquiries"
          >
            {profile.profile_image_url ? (
              <img src={profile.profile_image_url} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--line)', display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{profile.full_name.charAt(0)}</span>
              </div>
            )}
            <strong className="desktop-only" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{profile.full_name.split(' ')[0]}</strong>
          </button>
        )}

        {CONTACT_PHONE && (
          <a className="header-call" href={`tel:${CONTACT_PHONE}`} style={{ marginLeft: profile ? '1rem' : 'auto' }}>
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
            {session && (
              <button type="button" onClick={handleSignOut} style={{ color: 'var(--red)', fontWeight: '600' }}>
                Logout
              </button>
            )}
          </nav>
        )}
      </header>
      )}

      <main>
        {!isAdmin && !adminOnly && <ProfileOnboarding session={session} profile={profile} setProfile={setProfile} setSession={setSession} />}
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
                  onMyInquiries={() => openMyInquiries('all')}
                  onTrackReference={trackReference}
                  onSupport={openSupport}
                  onNotifications={openNotifications}
                  notificationCount={notificationCount}
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
              <section className="app-screen" style={{ paddingTop: '1rem' }}>
                <TruckShowcase fleet={FLEET} lanes={SERVICE_LANES} onInquire={() => navigateClient(CLIENT_VIEWS.inquire)} />
              </section>
            )}

            {clientView === CLIENT_VIEWS.inquire && (
              <section className="app-screen inquiry-screen" style={{ paddingTop: '1rem' }}>
                <InquiryForm 
                  onInquirySubmit={setInquiry} 
                  submittedInquiry={inquiry} 
                  session={session} 
                  profile={profile} 
                  setSession={setSession} 
                  onViewMyInquiries={() => navigateClient(CLIENT_VIEWS.myInquiries)} 
                  onTrackInquiry={trackReference}
                />
              </section>
            )}

            {clientView === CLIENT_VIEWS.myInquiries && (
              <section className="app-screen my-inquiries-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Customer portal</p>
                  <h1>Track your AHV trucking requests.</h1>
                  <p>See live inquiry status, quote updates, pickup schedule, and delivery progress from AHV admin.</p>
                </div>
                <div className="customer-workspace">
                  <AuthPanel session={session} setSession={setSession} />
                  <CustomerInquiryList
                    session={session}
                    heading="All saved inquiries"
                    eyebrow={inquiryFilter === 'active' ? 'Active requests' : inquiryFilter === 'completed' ? 'Completed requests' : 'My requests'}
                    statusFilter={inquiryFilter}
                    onStartInquiry={() => navigateClient(CLIENT_VIEWS.inquire)}
                  />
                </div>
              </section>
            )}

            {clientView === CLIENT_VIEWS.track && (
              <section className="app-screen my-inquiries-screen">
                <div className="screen-heading">
                  <p className="eyebrow">Tracking</p>
                  <h1>{trackingReference || 'Track an AHV request'}</h1>
                  <p>Sign in with the same customer account used for the inquiry to view protected status updates.</p>
                </div>
                <div className="customer-workspace">
                  <AuthPanel session={session} setSession={setSession} />
                  <CustomerInquiryList
                    session={session}
                    heading="Tracking details"
                    eyebrow="Inquiry reference"
                    reference={trackingReference}
                  />
                </div>
              </section>
            )}

            {clientView === CLIENT_VIEWS.notifications && (
              <CustomerNotifications
                session={session}
                setSession={setSession}
                onStartInquiry={() => navigateClient(CLIENT_VIEWS.inquire)}
                onOpenInquiries={() => openMyInquiries('all')}
                onNotificationsSeen={markNotificationsSeen}
              />
            )}

            {clientView === CLIENT_VIEWS.profile && (
              <CustomerProfileView
                session={session}
                setSession={setSession}
                profile={profile}
                onStartInquiry={() => navigateClient(CLIENT_VIEWS.inquire)}
                onOpenInquiries={() => openMyInquiries('all')}
                onSignOut={handleSignOut}
              />
            )}
          </>
        )}
      </main>

      {!isAdmin && !adminOnly && (
        <button
          className={!session || clientView === CLIENT_VIEWS.inquire || inquiry ? 'floating-inquire hidden' : 'floating-inquire'}
          type="button"
          onClick={() => navigateClient(CLIENT_VIEWS.inquire)}
        >
          <MessageCircle size={18} />
          Inquire
        </button>
      )}

      {!adminExperience && <Footer phone={CONTACT_PHONE} phoneLabel={CONTACT_PHONE_LABEL} />}

      {!adminExperience && (
        <MobileNav currentView={clientView} onNavigate={handleMobileNavigate} notificationCount={notificationCount} />
      )}
    </div>
  );
}

export default App;
