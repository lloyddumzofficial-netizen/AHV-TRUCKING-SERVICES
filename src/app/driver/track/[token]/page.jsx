"use client";

import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BatteryCharging,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  Truck,
  WifiOff,
  Sun,
} from 'lucide-react';

const TRACKING_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 3000,
  timeout: 15000,
};

// How often to send a heartbeat even if GPS hasn't moved
const HEARTBEAT_MS = 15000;
// How often to retry a failed send (ms)
const RETRY_MS = 5000;
// Max consecutive send failures before showing a strong warning
const MAX_FAIL_BEFORE_WARN = 3;
// Message shown in browser "leave page?" dialog
const LEAVE_WARNING = 'GPS tracking is still ON. If you leave, your location will stop being shared with the customer. Are you sure?';

function formatCoordinate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(5) : 'Waiting…';
}

function formatAccuracy(value) {
  return Number.isFinite(Number(value)) ? `+/- ${Math.round(Number(value))} m` : 'Checking…';
}

function coordsToPayload(position, active = true) {
  const { latitude, longitude, accuracy, speed, heading } = position.coords;
  const speedKph = Number.isFinite(speed) && speed !== null ? speed * 3.6 : null;
  return {
    lat: latitude,
    lng: longitude,
    accuracy,
    speed: speedKph,
    heading,
    active,
    timestamp: new Date(position.timestamp || Date.now()).toISOString(),
    locationLabel: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  };
}

// ---------------------------------------------------------------------------
// NoSleep video trick — plays a tiny silent video loop to prevent screen sleep
// on browsers that don't support the Wake Lock API (e.g. older iOS Safari).
// ---------------------------------------------------------------------------
let noSleepVideo = null;
function enableNoSleep() {
  if (typeof window === 'undefined') return;
  if (!noSleepVideo) {
    noSleepVideo = document.createElement('video');
    noSleepVideo.setAttribute('loop', '');
    noSleepVideo.setAttribute('playsinline', '');
    noSleepVideo.setAttribute('muted', '');
    // 1x1 pixel silent MP4 (inline base64 - very tiny)
    noSleepVideo.setAttribute('src', 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAsxtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGNkN2QzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiBkZXNxdWFudHBlbmFsdHk9MTMgbmFsLWhyZD1ub25lIGNvbG9yc3BhY2U9dW5zcGVjaWZpZWQgYml0ZGVwdGg9OCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiByZW9yZGVyPTEgZHVwbGljYXRlX21lcmdlPTEgbm8tc3R5bGVzPTAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAOaGdgAAAABkUAAAAMaWV0ZgAAAA==');
    noSleepVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    document.body.appendChild(noSleepVideo);
  }
  noSleepVideo.play().catch(() => {});
}
function disableNoSleep() {
  if (noSleepVideo) {
    noSleepVideo.pause();
  }
}

export default function DriverTrackingPage({ params }) {
  const { token } = use(params);

  const [inquiry, setInquiry] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [consecutiveFails, setConsecutiveFails] = useState(0);
  const [screenWarning, setScreenWarning] = useState(false);

  const wakeLockRef = useRef(null);
  const heartbeatRef = useRef(null);
  const retryRef = useRef(null);
  const lastPayloadRef = useRef(null);
  const watchIdRef = useRef(null);
  const isTrackingRef = useRef(false);
  const failCountRef = useRef(0);

  // ------------------------------------------------------------------
  // Load inquiry
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch(`/api/driver/track/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setInquiry(data.inquiry);
        if (data.inquiry?.driver_lat && data.inquiry?.driver_lng) {
          const saved = {
            lat: data.inquiry.driver_lat,
            lng: data.inquiry.driver_lng,
            accuracy: data.inquiry.driver_accuracy_m,
            speed: data.inquiry.driver_speed_kph,
            heading: data.inquiry.driver_heading,
          };
          setLastPayload(saved);
          lastPayloadRef.current = saved;
          setLastUpdated(data.inquiry.driver_updated_at ? new Date(data.inquiry.driver_updated_at) : null);
        }
      })
      .catch((err) => setError(err.message));
  }, [token]);

  // ------------------------------------------------------------------
  // Wake Lock — request / re-request
  // ------------------------------------------------------------------
  const requestWakeLock = useCallback(async () => {
    // First try native Wake Lock API
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockActive(true);
        setScreenWarning(false);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
          // If still tracking, set a screen warning and attempt re-acquire
          if (isTrackingRef.current) {
            setScreenWarning(true);
            window.setTimeout(() => {
              if (isTrackingRef.current) requestWakeLock();
            }, 2000);
          }
        });
        return;
      } catch {
        // Fall through to NoSleep fallback
      }
    }
    // NoSleep video fallback for iOS Safari / older browsers
    enableNoSleep();
    setWakeLockActive(true); // treat as "active" for UI purposes
    setScreenWarning(false);
  }, []);

  const releaseWakeLock = useCallback(async () => {
    disableNoSleep();
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Already released
    } finally {
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Re-acquire wake lock when user comes back to the tab / unlocks phone
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isTrackingRef.current) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestWakeLock]);

  // ------------------------------------------------------------------
  // Send location with retry logic
  // ------------------------------------------------------------------
  const sendLocation = useCallback(async (payload) => {
    window.clearTimeout(retryRef.current);
    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch(`/api/driver/track/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.error || 'Could not send GPS location.');

      if (payload.lat && payload.lng) {
        setLastPayload(payload);
        lastPayloadRef.current = payload;
      }
      setLastUpdated(new Date(data.driverUpdatedAt || Date.now()));
      failCountRef.current = 0;
      setConsecutiveFails(0);
    } catch (err) {
      failCountRef.current += 1;
      setConsecutiveFails(failCountRef.current);
      setSendError(`Send failed (${failCountRef.current}x): ${err.message}`);
      // Auto-retry after RETRY_MS if still tracking
      if (isTrackingRef.current) {
        retryRef.current = window.setTimeout(() => {
          if (lastPayloadRef.current && isTrackingRef.current) {
            sendLocation({ ...lastPayloadRef.current, active: true, timestamp: new Date().toISOString() });
          }
        }, RETRY_MS);
      }
    } finally {
      setIsSending(false);
    }
  }, [token]);

  // ------------------------------------------------------------------
  // Stop tracking
  // ------------------------------------------------------------------
  const stopTracking = useCallback(async () => {
    isTrackingRef.current = false;
    setIsTracking(false);

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    window.clearInterval(heartbeatRef.current);
    window.clearTimeout(retryRef.current);
    heartbeatRef.current = null;
    retryRef.current = null;
    setGpsError(null);
    setScreenWarning(false);
    await releaseWakeLock();

    const finalPayload = lastPayloadRef.current
      ? { ...lastPayloadRef.current, active: false, timestamp: new Date().toISOString() }
      : { active: false, timestamp: new Date().toISOString() };
    await sendLocation(finalPayload);
  }, [releaseWakeLock, sendLocation]);

  // ------------------------------------------------------------------
  // Start tracking
  // ------------------------------------------------------------------
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this phone or browser.');
      return;
    }

    isTrackingRef.current = true;
    failCountRef.current = 0;
    setIsTracking(true);
    setGpsError(null);
    setSendError(null);
    setConsecutiveFails(0);
    requestWakeLock();

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const payload = coordsToPayload(position, true);
        lastPayloadRef.current = payload;
        sendLocation(payload);
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}. Will retry automatically.`);
        // Don't stop tracking — GPS might recover (e.g. user goes outside)
      },
      TRACKING_OPTIONS,
    );

    watchIdRef.current = id;

    // Heartbeat: keep the server alive even when GPS doesn't fire a new position
    heartbeatRef.current = window.setInterval(() => {
      if (lastPayloadRef.current && isTrackingRef.current) {
        sendLocation({ ...lastPayloadRef.current, active: true, timestamp: new Date().toISOString() });
      }
    }, HEARTBEAT_MS);
  }, [requestWakeLock, sendLocation]);

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      window.clearInterval(heartbeatRef.current);
      window.clearTimeout(retryRef.current);
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // ------------------------------------------------------------------
  // Warn driver before leaving/closing page while tracking is active
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isTrackingRef.current) return;
      e.preventDefault();
      e.returnValue = LEAVE_WARNING; // required for Chrome
      return LEAVE_WARNING;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ------------------------------------------------------------------
  // Error screen
  // ------------------------------------------------------------------
  if (error) {
    return (
      <main className="driver-tracking-page">
        <section className="driver-state-card">
          <AlertCircle size={46} />
          <h1>Tracking link invalid</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!inquiry) {
    return (
      <main className="driver-tracking-page">
        <section className="driver-state-card">
          <Loader2 size={36} className="spinner" />
          <h1>Loading driver trip</h1>
          <p>Please wait while AHV verifies this secure tracking link.</p>
        </section>
      </main>
    );
  }

  const hasNetworkIssue = consecutiveFails >= MAX_FAIL_BEFORE_WARN;

  return (
    <main className="driver-tracking-page">
      <section className="driver-tracking-card">

        {/* Sticky DO NOT LEAVE banner — only when tracking */}
        {isTracking && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 999,
            background: '#dc2626',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '10px',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: '700',
            fontSize: '0.88rem',
            boxShadow: '0 4px 12px rgba(220,38,38,0.35)',
            animation: 'pulseBorder 2s ease-in-out infinite',
          }}>
            <Radio size={18} style={{ flexShrink: 0, animation: 'pulseGps 1.2s infinite' }} />
            <span>🔴 GPS LIVE — Huwag mag-back o mag-close ng browser! Mawawala ang tracking.</span>
          </div>
        )}

        <div className="driver-track-header">
          <div>
            <span>AHV Driver GPS</span>
            <h1>{inquiry.reference}</h1>
            <p>
              Keep this page <strong>open and screen ON</strong> while driving.
              The customer will see your live location automatically.
            </p>
          </div>
          <div className={isTracking ? 'driver-live-orb active' : 'driver-live-orb'}>
            <Radio size={22} />
          </div>
        </div>

        {/* Screen warning banner */}
        {screenWarning && isTracking && (
          <div className="driver-alert warn" style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e', marginBottom: '0.75rem' }}>
            <Sun size={18} />
            <span>
              <strong>Screen lock detected!</strong> Your phone screen may have dimmed or locked.
              Tap here or unlock your phone to keep GPS active.
            </span>
          </div>
        )}

        {/* Network warning banner */}
        {hasNetworkIssue && isTracking && (
          <div className="driver-alert" style={{ marginBottom: '0.75rem' }}>
            <WifiOff size={18} />
            <span>
              <strong>Network issue ({consecutiveFails} retries).</strong> Still trying to send your location.
              Check your mobile data signal.
            </span>
          </div>
        )}

        <div className="driver-route-panel">
          <div>
            <MapPin size={18} />
            <span>Pickup</span>
            <strong>{inquiry.pickup_address || 'AHV pickup point'}</strong>
          </div>
          <div>
            <Truck size={18} />
            <span>Delivery</span>
            <strong>{inquiry.delivery_address}</strong>
          </div>
        </div>

        <div className="driver-gps-grid">
          <div>
            <span>Latitude</span>
            <strong>{formatCoordinate(lastPayload?.lat)}</strong>
          </div>
          <div>
            <span>Longitude</span>
            <strong>{formatCoordinate(lastPayload?.lng)}</strong>
          </div>
          <div>
            <span>Accuracy</span>
            <strong>{formatAccuracy(lastPayload?.accuracy)}</strong>
          </div>
          <div>
            <span>Speed</span>
            <strong>
              {Number.isFinite(Number(lastPayload?.speed))
                ? `${Math.round(Number(lastPayload.speed))} kph`
                : '0 kph'}
            </strong>
          </div>
        </div>

        {gpsError && (
          <div className="driver-alert">
            <AlertCircle size={18} />
            <span>{gpsError}</span>
          </div>
        )}

        {sendError && !hasNetworkIssue && (
          <div className="driver-alert">
            <AlertCircle size={18} />
            <span>{sendError}</span>
          </div>
        )}

        <button
          type="button"
          className={isTracking ? 'driver-track-button danger' : 'driver-track-button'}
          onClick={isTracking ? stopTracking : startTracking}
          disabled={isSending && !isTracking}
        >
          {isTracking ? (
            <>
              <Loader2 size={22} className="spinner" />
              Stop sharing location
            </>
          ) : (
            <>
              <Navigation size={22} />
              Start live GPS tracking
            </>
          )}
        </button>

        {/* Tips for driver — only show when active */}
        {isTracking && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.85rem 1rem',
            background: 'rgba(22,163,74,0.07)',
            border: '1px solid rgba(22,163,74,0.2)',
            borderRadius: '10px',
            fontSize: '0.8rem',
            color: 'var(--ink, #111)',
            lineHeight: '1.6',
          }}>
            <strong>💡 Tips para laging on ang GPS:</strong>
            <ul style={{ margin: '0.4rem 0 0 1.1rem', padding: 0 }}>
              <li>I-plug ang charger habang nagdadrive</li>
              <li>I-lower brightness pero huwag i-lock ang screen</li>
              <li>Huwag mag-switch ng apps — keep this tab open</li>
              <li>Kung nawala ang signal, auto-retry ito kapag bumalik ang data</li>
            </ul>
          </div>
        )}

        <div className="driver-sync-footer">
          <span className={isTracking ? 'active' : ''}>
            <CheckCircle2 size={16} />
            {isTracking ? 'Live tracking active' : 'Tracking paused'}
          </span>
          <span>
            <BatteryCharging size={16} />
            {wakeLockActive ? 'Screen kept awake ✅' : 'Screen not locked ⚠️'}
          </span>
          <span>
            <ShieldCheck size={16} />
            {lastUpdated
              ? `Last sent ${lastUpdated.toLocaleTimeString()}`
              : 'Waiting for first GPS fix'}
          </span>
        </div>
      </section>
    </main>
  );
}
