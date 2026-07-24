"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, ClipboardList, ClipboardCopy, Loader2, MapPin, RefreshCw, Route, Save, Search, X } from 'lucide-react';
import { INQUIRY_STATUS_HELP, INQUIRY_STATUS_LABELS } from '../data/inquiryStatus.js';
import { getInquiries, updateInquiryLocations } from '../lib/inquiries/api.js';
import { calculateDistanceKm } from '../lib/inquiries/distance.js';
import { getSupabaseBrowserClient } from '../lib/supabase/client.js';

const PhilippinesMapPicker = dynamic(() => import('./PhilippinesMapPicker.jsx'), {
  ssr: false,
  loading: () => <div className="map-loading">Loading Philippine map...</div>,
});

const RouteDisplayMap = dynamic(() => import('./RouteDisplayMap.jsx'), {
  ssr: false,
  loading: () => <div className="map-loading" style={{ height: '100px' }}>Loading Route Map...</div>,
});

const CORRECTABLE_STATUSES = ['new', 'reviewing'];

function getCustomerStatusClass(status) {
  return `customer-status-pill ${status || 'new'}`;
}

function formatInquiryDate(value) {
  if (!value) {
    return 'No update yet';
  }

  return new Date(value).toLocaleString();
}

function getTimeline(inquiry) {
  const history = Array.isArray(inquiry.status_history) ? inquiry.status_history : [];

  if (history.length === 0) {
    return [
      {
        id: `${inquiry.reference}-created`,
        status: inquiry.status || 'new',
        notes: 'Inquiry submitted.',
        created_at: inquiry.created_at || inquiry.updated_at,
      },
    ];
  }

  return [...history].sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
}

function createPointFromInquiry(inquiry, type) {
  const lat = Number(inquiry[`${type}_lat`]);
  const lng = Number(inquiry[`${type}_lng`]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function LocationCorrectionForm({ inquiry, session, onCancel, onSaved }) {
  const [pickup, setPickup] = useState(() => createPointFromInquiry(inquiry, 'pickup'));
  const [delivery, setDelivery] = useState(() => createPointFromInquiry(inquiry, 'delivery'));
  const [pickupAddress, setPickupAddress] = useState(inquiry.pickup_address || '');
  const [deliveryAddress, setDeliveryAddress] = useState(inquiry.delivery_address || '');
  const [activeMarker, setActiveMarker] = useState('pickup');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const routeDistance = useMemo(() => calculateDistanceKm(pickup, delivery), [delivery, pickup]);
  const canSave = Boolean(session?.access_token && pickup && delivery && pickupAddress.trim() && deliveryAddress.trim());

  const saveCorrection = async (event) => {
    event.preventDefault();

    if (!canSave) {
      setStatus('Set pickup, delivery, and both address fields first.');
      return;
    }

    setIsSaving(true);
    setStatus('Saving corrected locations...');

    try {
      await updateInquiryLocations(session.access_token, inquiry.reference, {
        pickup,
        delivery,
        pickupAddress,
        deliveryAddress,
        routeDistance,
      });
      setStatus('Locations updated. AHV admin will review the corrected markers.');
      await onSaved();
      onCancel();
    } catch (saveError) {
      setStatus(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="location-correction-form" onSubmit={saveCorrection}>
      <div className="location-correction-head">
        <div>
          <span>Correct location</span>
          <strong>Update pickup and delivery markers</strong>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close location correction">
          <X size={16} />
        </button>
      </div>

      <PhilippinesMapPicker
        pickup={pickup}
        delivery={delivery}
        setPickup={setPickup}
        setDelivery={setDelivery}
        activeMarker={activeMarker}
        setActiveMarker={setActiveMarker}
        routeDistance={routeDistance}
        setPickupAddress={setPickupAddress}
        setDeliveryAddress={setDeliveryAddress}
      />

      <div className="field-grid">
        <label>
          Correct pickup address
          <input value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} required />
        </label>
        <label>
          Correct delivery address
          <input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} required />
        </label>
      </div>

      <button className="location-correction-save" type="submit" disabled={!canSave || isSaving}>
        <Save size={16} />
        Save Corrected Location
      </button>
      {status && <p className="submit-status">{status}</p>}
    </form>
  );
}

function CustomerInquiryCard({ inquiry, session, showTimeline = false, onSaved }) {
  const pickupLabel = inquiry.pickupAddress || inquiry.pickup_address;
  const deliveryLabel = inquiry.deliveryAddress || inquiry.delivery_address;
  const distance = inquiry.routeDistance || inquiry.route_distance_km;
  const cargo = inquiry.cargoType || inquiry.cargo_type;
  const inquiryStatus = inquiry.status || 'new';
  const timeline = getTimeline(inquiry);
  const latestHistory = timeline[0];
  const visibleSteps = ['new', 'reviewing', 'quoted', 'scheduled', 'picked_up', 'in_transit', 'delivered'];
  
  const pickupPoint = { lat: Number(inquiry.pickup_lat), lng: Number(inquiry.pickup_lng) };
  const deliveryPoint = { lat: Number(inquiry.delivery_lat), lng: Number(inquiry.delivery_lng) };
  const currentStepIndex = visibleSteps.includes(inquiryStatus) ? visibleSteps.indexOf(inquiryStatus) : 0;
  const [isCorrectingLocation, setIsCorrectingLocation] = useState(false);
  const [copied, setCopied] = useState(false);
  const canCorrectLocation = showTimeline && CORRECTABLE_STATUSES.includes(inquiryStatus);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — select text
    }
  };

  return (
    <article className="recent-card customer-inquiry-card">
      <div className="customer-inquiry-head">
        <div className="customer-inquiry-ref">
          <span>{inquiry.reference}</span>
          <button
            type="button"
            className={`copy-ref-btn ${copied ? 'copied' : ''}`}
            onClick={copyReference}
            title={copied ? 'Copied!' : 'Copy reference number'}
            aria-label="Copy reference number"
          >
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <strong className={getCustomerStatusClass(inquiryStatus)}>
          {INQUIRY_STATUS_LABELS[inquiryStatus] || 'Pending'}
        </strong>
      </div>
      <strong>{pickupLabel} to {deliveryLabel}</strong>
      <small>
        <Route size={14} />
        {distance?.toLocaleString() || 'No'} km • {cargo}
      </small>
      <p>{INQUIRY_STATUS_HELP[inquiryStatus] || 'AHV is reviewing your request.'}</p>
      <em>Latest update: {formatInquiryDate(latestHistory?.created_at || inquiry.updated_at || inquiry.created_at)}</em>

      {showTimeline && (
        <div className="customer-location-note">
          <MapPin size={16} />
          <span>
            {canCorrectLocation
              ? 'Wrong pickup or delivery? You can still correct it before quote/schedule.'
              : 'Location changes are locked for this stage. Contact AHV admin if this needs correction.'}
          </span>
        </div>
      )}

      {canCorrectLocation && !isCorrectingLocation && (
        <button className="location-correction-toggle" type="button" onClick={() => setIsCorrectingLocation(true)}>
          <MapPin size={16} />
          Correct pickup/delivery
        </button>
      )}

      {isCorrectingLocation && (
        <LocationCorrectionForm
          inquiry={inquiry}
          session={session}
          onCancel={() => setIsCorrectingLocation(false)}
          onSaved={onSaved}
        />
      )}

      {showTimeline && (
        <>
          <div className="customer-lifecycle-strip" aria-label="Inquiry progress">
            {visibleSteps.map((step, index) => (
              <span key={step} className={index <= currentStepIndex ? 'active' : ''}>
                {INQUIRY_STATUS_LABELS[step]}
              </span>
            ))}
          </div>

          <div className="customer-status-timeline">
            {timeline.map((item) => (
              <div key={item.id || `${item.status}-${item.created_at}`}>
                <span />
                <strong>{INQUIRY_STATUS_LABELS[item.status] || item.status}</strong>
                <small>{formatInquiryDate(item.created_at)}</small>
                {item.notes && <p>{item.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <RouteDisplayMap
        pickup={pickupPoint}
        delivery={deliveryPoint}
        status={inquiryStatus}
        driverLat={inquiry.driver_lat}
        driverLng={inquiry.driver_lng}
        driverLocation={inquiry.driver_location}
        height="280px"
      />

      {showTimeline && Number(inquiry.quoted_price) > 0 && (
        <div className="customer-quote-box">
          <span>Quoted price</span>
          <strong>
            {new Intl.NumberFormat('en-PH', {
              style: 'currency',
              currency: 'PHP',
              maximumFractionDigits: 0,
            }).format(Number(inquiry.quoted_price))}
          </strong>
        </div>
      )}
    </article>
  );
}

function CustomerInquiryList({
  session,
  heading = 'Your request status',
  eyebrow = 'My inquiries',
  limit = 20,
  reference = '',
  compact = false,
  onStartInquiry,
}) {
  const [inquiries, setInquiries] = useState([]);
  const [search, setSearch] = useState(reference || '');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const supabase = getSupabaseBrowserClient();

  const loadInquiries = useCallback(async () => {
    if (!session?.access_token) {
      setInquiries([]);
      return;
    }

    setIsLoading(true);
    setStatus('Loading your inquiries...');

    try {
      const data = await getInquiries(session.access_token, {
        limit,
        reference,
      });
      setInquiries(Array.isArray(data.inquiries) ? data.inquiries : []);
      setStatus('');
    } catch (loadError) {
      setStatus(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [limit, reference, session?.access_token]);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    if (!session?.access_token || !session.user?.id || !supabase) {
      return undefined;
    }

    let refreshTimer;
    const refreshInquiries = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        loadInquiries();
      }, 350);
    };

    const channel = supabase
      .channel(`ahv-customer-status-${session.user.id}-${reference || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, refreshInquiries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_status_history' }, refreshInquiries)
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [loadInquiries, reference, session, supabase]);

  // 30-second polling fallback for real-time truck position updates
  useEffect(() => {
    if (!session?.access_token) return undefined;
    const interval = window.setInterval(() => {
      loadInquiries();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [loadInquiries, session?.access_token]);

  const visibleInquiries = useMemo(() => {
    if (reference || !search.trim()) {
      return inquiries;
    }

    const normalizedSearch = search.trim().toLowerCase();
    return inquiries.filter((inquiry) => [inquiry.reference, inquiry.pickup_address, inquiry.delivery_address, inquiry.cargo_type]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch));
  }, [inquiries, reference, search]);

  if (!session) {
    return (
      <section className="recent-inquiries">
        <div className="step-title">
          <ClipboardList size={20} />
          <div>
            <span>{eyebrow}</span>
            <h3>{heading}</h3>
          </div>
        </div>
        <p className="customer-empty-state">Sign in first to view saved inquiry status and AHV updates.</p>
      </section>
    );
  }

  return (
    <section className={compact ? 'recent-inquiries compact' : 'recent-inquiries'}>
      <div className="step-title">
        <ClipboardList size={20} />
        <div>
          <span>{eyebrow}</span>
          <h3>{heading}</h3>
        </div>
        {!compact && (
          <button
            type="button"
            className="inquiries-refresh-btn"
            onClick={loadInquiries}
            disabled={isLoading}
            title="Refresh inquiries"
            aria-label="Refresh inquiries"
          >
            <RefreshCw size={15} className={isLoading ? 'spinning' : ''} />
          </button>
        )}
      </div>

      {!reference && !compact && (
        <label className="customer-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by reference, pickup, delivery, cargo" />
        </label>
      )}

      {status && (
        <p className="submit-status">
          {isLoading && <Loader2 size={15} />}
          {status}
        </p>
      )}

      {visibleInquiries.length === 0 && !isLoading ? (
        <div className="customer-empty-state-block">
          <p className="customer-empty-state">No inquiries found yet.</p>
          {onStartInquiry && (
            <button type="button" className="empty-state-cta" onClick={onStartInquiry}>
              Start your first inquiry
            </button>
          )}
        </div>
      ) : (
        <div className="recent-list">
          {visibleInquiries.map((inquiry) => (
            <CustomerInquiryCard
              key={inquiry.reference}
              inquiry={inquiry}
              session={session}
              showTimeline={!compact}
              onSaved={loadInquiries}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default CustomerInquiryList;
