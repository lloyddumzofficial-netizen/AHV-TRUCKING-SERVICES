"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ACCURACY_GRACE_MS,
  HEARTBEAT_MS,
  MAX_ACCEPTABLE_ACCURACY_M,
  QUEUE_LIMIT,
  TRACKING_OPTIONS,
  clearQueue,
  coordsToPayload,
  describeGeolocationError,
  evaluateFix,
  fixAge,
  formatAge,
  isFixFresh,
  loadQueue,
  retryDelay,
  saveQueue,
} from '../../../../lib/gps/tracking.js';
import { acquireWakeLock, releaseWakeLock } from '../../../../lib/gps/wakeLock.js';

// Consecutive send failures before the network warning is escalated.
const MAX_FAIL_BEFORE_WARN = 3;
// How often the on-screen fix age refreshes.
const AGE_TICK_MS = 5000;
const LEAVE_WARNING =
  'GPS tracking is still ON. If you leave, your location will stop being shared with the customer. Are you sure?';

function formatCoordinate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(5) : 'Waiting…';
}

function formatAccuracy(value) {
  return Number.isFinite(Number(value)) ? `+/- ${Math.round(Number(value))} m` : 'Checking…';
}

export default function DriverTrackingPage({ params }) {
  const { token } = use(params);

  const [inquiry, setInquiry] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [consecutiveFails, setConsecutiveFails] = useState(0);
  const [screenWarning, setScreenWarning] = useState(false);
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [permissionState, setPermissionState] = useState('unknown');
  const [ageTick, setAgeTick] = useState(0);

  const wakeLockRef = useRef(null);
  const wakeLockRetryRef = useRef(null);
  const heartbeatRef = useRef(null);
  const retryRef = useRef(null);
  const watchIdRef = useRef(null);
  const isTrackingRef = useRef(false);
  const failCountRef = useRef(0);
  const isMountedRef = useRef(true);

  // The last fix we successfully sent, annotated with sentAt. Drives gating.
  const lastSentFixRef = useRef(null);
  // Queue of fixes waiting to go out. Survives reloads via localStorage.
  const queueRef = useRef([]);
  // Guards against overlapping sends: several POSTs in flight land out of order.
  const isDrainingRef = useRef(false);
  const abortRef = useRef(null);
  const gpsErrorKeyRef = useRef(null);
  // drainQueue is defined below but referenced by listeners registered above it.
  // Going through a ref keeps those listeners off the first render's closure.
  const drainQueueRef = useRef(() => {});

  // ------------------------------------------------------------------
  // Load inquiry
  // ------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/driver/track/${token}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.error) throw new Error(data.error);

        setInquiry(data.inquiry);

        const lat = Number(data.inquiry?.driver_lat);
        const lng = Number(data.inquiry?.driver_lng);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const saved = {
            lat,
            lng,
            accuracy: data.inquiry.driver_accuracy_m,
            speed: data.inquiry.driver_speed_kph,
            heading: data.inquiry.driver_heading,
            fixTimestamp: data.inquiry.driver_fix_at || data.inquiry.driver_updated_at || null,
          };
          setLastPayload(saved);
          setLastSentAt(data.inquiry.driver_updated_at ? new Date(data.inquiry.driver_updated_at) : null);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      });

    return () => controller.abort();
  }, [token]);

  // ------------------------------------------------------------------
  // Restore any fixes stranded by a reload or a killed tab
  // ------------------------------------------------------------------
  useEffect(() => {
    const restored = loadQueue(token);
    queueRef.current = restored;
    setPendingCount(restored.length);
  }, [token]);

  // ------------------------------------------------------------------
  // Geolocation permission pre-flight + secure context check
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    if (!window.isSecureContext) {
      setGpsError({
        terminal: true,
        title: 'Hindi secure ang connection',
        message: 'Kailangan ng HTTPS para sa GPS. Buksan ang https:// na link na binigay ng AHV.',
      });
      return undefined;
    }

    if (!navigator.geolocation) {
      setGpsError({
        terminal: true,
        title: 'Walang GPS support',
        message: 'Hindi supported ang geolocation sa browser na ito. Gamitin ang Chrome o Safari.',
      });
      return undefined;
    }

    if (!navigator.permissions?.query) return undefined;

    let status = null;
    const handleChange = () => setPermissionState(status?.state || 'unknown');

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        status = result;
        setPermissionState(result.state);
        result.addEventListener('change', handleChange);
      })
      .catch(() => {
        // Firefox and some WebViews don't expose the geolocation permission.
      });

    return () => status?.removeEventListener('change', handleChange);
  }, []);

  // ------------------------------------------------------------------
  // Online / offline
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const goOnline = () => {
      setIsOffline(false);
      // Data is back — flush whatever piled up during the outage.
      if (isTrackingRef.current) drainQueueRef.current();
    };
    const goOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ------------------------------------------------------------------
  // Tick the displayed fix age so "Live / Stale" is never frozen
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isTracking) return undefined;
    const id = window.setInterval(() => setAgeTick((n) => n + 1), AGE_TICK_MS);
    return () => window.clearInterval(id);
  }, [isTracking]);

  // ------------------------------------------------------------------
  // Wake Lock
  // ------------------------------------------------------------------
  const requestWakeLock = useCallback(async () => {
    const result = await acquireWakeLock(wakeLockRef.current, () => {
      if (!isMountedRef.current) return;
      setWakeLockActive(false);

      if (isTrackingRef.current) {
        setScreenWarning(true);
        window.clearTimeout(wakeLockRetryRef.current);
        wakeLockRetryRef.current = window.setTimeout(() => {
          if (isTrackingRef.current && isMountedRef.current) requestWakeLock();
        }, 2000);
      }
    });

    if (!isMountedRef.current) {
      // Unmounted while awaiting — don't leave a sentinel behind.
      await releaseWakeLock(result.sentinel);
      return;
    }

    wakeLockRef.current = result.sentinel;
    // Report what is actually holding the screen, not what we attempted.
    setWakeLockActive(result.held);
    setScreenWarning(!result.held && isTrackingRef.current);
  }, []);

  const dropWakeLock = useCallback(async () => {
    window.clearTimeout(wakeLockRetryRef.current);
    wakeLockRetryRef.current = null;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    await releaseWakeLock(sentinel);
    if (isMountedRef.current) setWakeLockActive(false);
  }, []);

  // Re-acquire when the driver returns to the tab or unlocks the phone.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTrackingRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestWakeLock]);

  // ------------------------------------------------------------------
  // Queue draining — one send in flight at a time, oldest first
  // ------------------------------------------------------------------
  const persistQueue = useCallback(() => {
    saveQueue(token, queueRef.current);
    if (isMountedRef.current) setPendingCount(queueRef.current.length);
  }, [token]);

  const postPayload = useCallback(async (payload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`/api/driver/track/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const err = new Error(data.error || 'Could not send GPS location.');
        // 4xx other than 429 means this payload will never be accepted.
        err.permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
        throw err;
      }

      return data;
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [token]);

  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    if (queueRef.current.length === 0) return;

    isDrainingRef.current = true;
    if (isMountedRef.current) setIsSending(true);

    try {
      while (queueRef.current.length > 0) {
        const payload = queueRef.current[0];

        try {
          const data = await postPayload(payload);

          // Accepted (or superseded by a newer fix — either way it's done).
          queueRef.current.shift();
          persistQueue();

          if (!data.superseded) {
            lastSentFixRef.current = { ...payload, sentAt: Date.now() };
            if (isMountedRef.current) {
              setLastPayload(payload);
              setLastSentAt(new Date(data.driverUpdatedAt || Date.now()));
            }
          }

          failCountRef.current = 0;
          if (isMountedRef.current) {
            setConsecutiveFails(0);
            setSendError(null);
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            // Superseded by a newer send or a timeout; leave it queued.
            break;
          }

          if (err.permanent) {
            // The server will never take this one (expired token, bad payload).
            queueRef.current.shift();
            persistQueue();
            if (isMountedRef.current) setSendError(err.message);
            break;
          }

          failCountRef.current += 1;
          if (isMountedRef.current) {
            setConsecutiveFails(failCountRef.current);
            setSendError(`Send failed (${failCountRef.current}x): ${err.message}`);
          }

          if (isTrackingRef.current) {
            window.clearTimeout(retryRef.current);
            retryRef.current = window.setTimeout(() => {
              if (isTrackingRef.current) drainQueue();
            }, retryDelay(failCountRef.current));
          }
          break;
        }
      }
    } finally {
      isDrainingRef.current = false;
      if (isMountedRef.current) setIsSending(false);
    }
  }, [persistQueue, postPayload]);

  // Keep the listener-facing ref pointing at the current drainQueue.
  drainQueueRef.current = drainQueue;

  const enqueue = useCallback((payload) => {
    queueRef.current = [...queueRef.current, payload].slice(-QUEUE_LIMIT);
    persistQueue();
    // While offline the fix stays queued; the `online` listener flushes it.
    if (navigator.onLine !== false) drainQueue();
  }, [drainQueue, persistQueue]);

  // ------------------------------------------------------------------
  // Stop tracking
  // ------------------------------------------------------------------
  const stopTracking = useCallback(async () => {
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
    setLowAccuracy(false);
    await dropWakeLock();

    // Send the stop *before* clearing the tracking flag, so the retry path is
    // still armed. Clearing it first meant one failed request left the row
    // driver_tracking_active = true forever — a phantom live truck.
    const last = lastSentFixRef.current || lastPayload;
    const stopPayload = last
      ? { ...last, sentAt: undefined, active: false }
      : { active: false };

    // The stop write must land. Queued position fixes refer to a trip that is
    // now over, so drop them rather than let them delay the stop.
    queueRef.current = [stopPayload];
    persistQueue();
    await drainQueue();

    isTrackingRef.current = false;
    setIsTracking(false);

    // Anything left over refers to a finished trip.
    if (queueRef.current.length === 0) clearQueue(token);
  }, [drainQueue, dropWakeLock, lastPayload, persistQueue, token]);

  // ------------------------------------------------------------------
  // Start tracking
  // ------------------------------------------------------------------
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError({
        terminal: true,
        title: 'Walang GPS support',
        message: 'Hindi supported ang geolocation sa phone o browser na ito.',
      });
      return;
    }

    isTrackingRef.current = true;
    failCountRef.current = 0;
    gpsErrorKeyRef.current = null;
    setIsTracking(true);
    setGpsError(null);
    setSendError(null);
    setConsecutiveFails(0);
    requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const payload = coordsToPayload(position, true);
        const decision = evaluateFix(payload, lastSentFixRef.current);

        setLowAccuracy(decision.lowAccuracy);
        // A fix arrived, so clear any "no signal" message.
        if (gpsErrorKeyRef.current !== null) {
          gpsErrorKeyRef.current = null;
          setGpsError(null);
        }

        // Always surface the newest reading locally, even when we don't send it —
        // the driver should see the GPS is alive.
        setLastPayload(payload);

        if (decision.send) enqueue(payload);
      },
      (err) => {
        const described = describeGeolocationError(err);

        // TIMEOUT fires every ~20s; only re-render when the message changes.
        if (gpsErrorKeyRef.current !== err.code) {
          gpsErrorKeyRef.current = err.code;
          setGpsError(described);
        }

        // PERMISSION_DENIED is terminal: the watch will never fire again, so
        // continuing to publish active:true would be a lie.
        if (described.terminal) {
          stopTracking();
        }
      },
      TRACKING_OPTIONS,
    );

    // Heartbeat: resend the last known fix, keeping its ORIGINAL fixTimestamp so
    // the customer sees the true age of the position rather than a fresh lie.
    heartbeatRef.current = window.setInterval(() => {
      if (!isTrackingRef.current) return;
      if (queueRef.current.length > 0) {
        drainQueue();
        return;
      }
      const last = lastSentFixRef.current;
      if (last) enqueue({ ...last, sentAt: undefined, active: true });
    }, HEARTBEAT_MS);
  }, [drainQueue, enqueue, requestWakeLock, stopTracking]);

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      window.clearInterval(heartbeatRef.current);
      window.clearTimeout(retryRef.current);
      window.clearTimeout(wakeLockRetryRef.current);
      abortRef.current?.abort();

      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      releaseWakeLock(sentinel);

      // Client-side navigation unmounts this page without firing beforeunload.
      // Mark the trip inactive so the customer map doesn't show a phantom truck.
      if (isTrackingRef.current) {
        isTrackingRef.current = false;
        const last = lastSentFixRef.current;
        const body = JSON.stringify(last ? { ...last, sentAt: undefined, active: false } : { active: false });
        navigator.sendBeacon?.(
          `/api/driver/track/${token}`,
          new Blob([body], { type: 'application/json' }),
        );
      }
    };
  }, [token]);

  // ------------------------------------------------------------------
  // Leaving the page
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isTrackingRef.current) return;
      e.preventDefault();
      e.returnValue = LEAVE_WARNING;
      return LEAVE_WARNING;
    };

    // iOS Safari ignores beforeunload dialogs, so pagehide is the reliable
    // flush. sendBeacon survives the page going away; fetch does not.
    const handlePageHide = () => {
      if (!isTrackingRef.current) return;
      const last = lastSentFixRef.current;
      const pending = queueRef.current[queueRef.current.length - 1] || last;
      if (!pending) return;
      const body = JSON.stringify({ ...pending, sentAt: undefined, active: true });
      navigator.sendBeacon?.(
        `/api/driver/track/${token}`,
        new Blob([body], { type: 'application/json' }),
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [token]);

  // ------------------------------------------------------------------
  // Derived display state
  // ------------------------------------------------------------------
  const fixStatus = useMemo(() => {
    const stamp = lastPayload?.fixTimestamp;
    const age = fixAge(stamp);

    if (!isTracking) return { tone: 'idle', label: 'Tracking paused' };
    if (age === null) return { tone: 'waiting', label: 'Waiting for first GPS fix' };
    if (isFixFresh(stamp)) return { tone: 'live', label: `Live · ${formatAge(age)}` };
    return { tone: 'stale', label: `Stale · ${formatAge(age)}` };
    // ageTick forces this to recompute on a timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, lastPayload, ageTick]);

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
  const permissionBlocked = permissionState === 'denied';

  return (
    <main className="driver-tracking-page">
      <section className="driver-tracking-card">

        {isTracking && (
          <div className="driver-live-banner" role="status">
            <Radio size={18} className="driver-live-banner-icon" />
            <span lang="fil">
              🔴 GPS LIVE — Huwag mag-back o mag-close ng browser! Mawawala ang tracking.
            </span>
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

        <div className={`driver-fix-status is-${fixStatus.tone}`}>
          <span className="driver-fix-dot" aria-hidden="true" />
          <strong>{fixStatus.label}</strong>
          {pendingCount > 0 && <span className="driver-fix-pending">{pendingCount} queued</span>}
        </div>

        {permissionBlocked && !isTracking && (
          <div className="driver-alert danger">
            <AlertCircle size={18} />
            <span lang="fil">
              <strong>Naka-block ang location.</strong> Pindutin ang padlock 🔒 sa address bar →
              Location → Allow, tapos i-reload ang page.
            </span>
          </div>
        )}

        {isOffline && (
          <div className="driver-alert warn">
            <WifiOff size={18} />
            <span lang="fil">
              <strong>Offline.</strong> Naka-save ang {pendingCount || 'mga'} location updates at
              awtomatikong ipapadala kapag bumalik ang data.
            </span>
          </div>
        )}

        {screenWarning && isTracking && (
          <div className="driver-alert warn">
            <Sun size={18} />
            <span>
              <strong>Screen lock detected!</strong> Your phone screen may have dimmed or locked.
              Tap here or unlock your phone to keep GPS active.
            </span>
          </div>
        )}

        {lowAccuracy && isTracking && (
          <div className="driver-alert warn">
            <MapPin size={18} />
            <span lang="fil">
              <strong>Mahina ang GPS accuracy</strong> (mas malaki sa {MAX_ACCEPTABLE_ACCURACY_M} m).
              Hinihintay ang mas malinaw na signal — hanggang{' '}
              {Math.round(ACCURACY_GRACE_MS / 1000)}s bago ito ipadala.
            </span>
          </div>
        )}

        {hasNetworkIssue && isTracking && !isOffline && (
          <div className="driver-alert">
            <WifiOff size={18} />
            <span>
              <strong>Network issue ({consecutiveFails} retries).</strong> Still trying to send your
              location. Check your mobile data signal.
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
                : '—'}
            </strong>
          </div>
        </div>

        {gpsError && (
          <div className={gpsError.terminal ? 'driver-alert danger' : 'driver-alert'}>
            <AlertCircle size={18} />
            <span lang="fil">
              <strong>{gpsError.title}.</strong> {gpsError.message}
            </span>
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

        {isTracking && (
          <div className="driver-tips" lang="fil">
            <strong>💡 Tips para laging on ang GPS:</strong>
            <ul>
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
            {lastSentAt ? `Last sent ${lastSentAt.toLocaleTimeString()}` : 'Waiting for first GPS fix'}
          </span>
        </div>
      </section>
    </main>
  );
}
