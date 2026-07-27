"use client";

import { use, useEffect, useRef, useState } from 'react';
import { AlertCircle, BatteryCharging, CheckCircle2, Loader2, MapPin, Navigation, Radio, ShieldCheck, Truck } from 'lucide-react';

const TRACKING_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 18000,
};

const HEARTBEAT_MS = 30000;

function formatCoordinate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(5) : 'Waiting';
}

function formatAccuracy(value) {
  return Number.isFinite(Number(value)) ? `+/- ${Math.round(Number(value))} m` : 'Checking';
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

export default function DriverTrackingPage({ params }) {
  const { token } = use(params);

  const [inquiry, setInquiry] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef(null);
  const heartbeatRef = useRef(null);
  const lastPayloadRef = useRef(null);

  useEffect(() => {
    fetch(`/api/driver/track/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setInquiry(data.inquiry);
        if (data.inquiry?.driver_lat && data.inquiry?.driver_lng) {
          setLastPayload({
            lat: data.inquiry.driver_lat,
            lng: data.inquiry.driver_lng,
            accuracy: data.inquiry.driver_accuracy_m,
            speed: data.inquiry.driver_speed_kph,
            heading: data.inquiry.driver_heading,
          });
          setLastUpdated(data.inquiry.driver_updated_at ? new Date(data.inquiry.driver_updated_at) : null);
        }
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const sendLocation = async (payload) => {
    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch(`/api/driver/track/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not send GPS location.');
      }

      if (payload.lat && payload.lng) {
        setLastPayload(payload);
        lastPayloadRef.current = payload;
      }
      setLastUpdated(new Date(data.driverUpdatedAt || Date.now()));
    } catch (err) {
      setSendError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false));
    } catch {
      setWakeLockActive(false);
    }
  };

  const releaseWakeLock = async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Wake lock can already be released by the browser.
    } finally {
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  const stopTracking = async () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    setIsTracking(false);
    setGpsError(null);
    await releaseWakeLock();

    if (lastPayloadRef.current) {
      await sendLocation({ ...lastPayloadRef.current, active: false, timestamp: new Date().toISOString() });
    } else {
      await sendLocation({ active: false, timestamp: new Date().toISOString() });
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this phone/browser.');
      return;
    }

    setIsTracking(true);
    setGpsError(null);
    setSendError(null);
    requestWakeLock();

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const payload = coordsToPayload(position, true);
        lastPayloadRef.current = payload;
        sendLocation(payload);
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
        setIsTracking(false);
      },
      TRACKING_OPTIONS,
    );

    heartbeatRef.current = window.setInterval(() => {
      if (lastPayloadRef.current) {
        sendLocation({ ...lastPayloadRef.current, active: true, timestamp: new Date().toISOString() });
      }
    }, HEARTBEAT_MS);

    setWatchId(id);
  };

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.clearInterval(heartbeatRef.current);
      releaseWakeLock();
    };
  }, [watchId]);

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

  return (
    <main className="driver-tracking-page">
      <section className="driver-tracking-card">
        <div className="driver-track-header">
          <div>
            <span>AHV Driver GPS</span>
            <h1>{inquiry.reference}</h1>
            <p>Keep this screen open while driving so the customer can see the truck location in real time.</p>
          </div>
          <div className={isTracking ? 'driver-live-orb active' : 'driver-live-orb'}>
            <Radio size={22} />
          </div>
        </div>

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
            <strong>{Number.isFinite(Number(lastPayload?.speed)) ? `${Math.round(Number(lastPayload.speed))} kph` : '0 kph'}</strong>
          </div>
        </div>

        {(gpsError || sendError) && (
          <div className="driver-alert">
            <AlertCircle size={18} />
            <span>{gpsError || sendError}</span>
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

        <div className="driver-sync-footer">
          <span className={isTracking ? 'active' : ''}>
            <CheckCircle2 size={16} />
            {isTracking ? 'Live tracking active' : 'Tracking paused'}
          </span>
          <span>
            <BatteryCharging size={16} />
            {wakeLockActive ? 'Screen kept awake' : 'Battery saver ready'}
          </span>
          <span>
            <ShieldCheck size={16} />
            {lastUpdated ? `Last sent ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first GPS fix'}
          </span>
        </div>
      </section>
    </main>
  );
}
