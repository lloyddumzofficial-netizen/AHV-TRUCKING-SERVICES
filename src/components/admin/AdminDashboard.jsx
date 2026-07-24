"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarClock, ClipboardList, Image as ImageIcon, Loader2, LogOut, MapPin, PhoneCall, RefreshCw, Search, ShieldCheck, Trash2, Truck, UserRound, Monitor, X } from 'lucide-react';
import { INQUIRY_STATUSES, INQUIRY_STATUS_HELP, INQUIRY_STATUS_LABELS } from '../../data/inquiryStatus.js';
import { deleteAdminInquiry, getAdminInquiries, updateAdminInquiry } from '../../lib/admin/api.js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client.js';
import AdminRouteTools from './AdminRouteTools.jsx';
import dynamic from 'next/dynamic';

const AdminDispatcherMap = dynamic(() => import('./AdminDispatcherMap.jsx'), {
  ssr: false,
  loading: () => <div className="admin-dispatcher-map loading">Loading map...</div>,
});

const RouteDisplayMap = dynamic(() => import('../RouteDisplayMap.jsx'), {
  ssr: false,
  loading: () => <div style={{ height: '220px', background: 'var(--soft)', borderRadius: '10px', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading map...</div>,
});

const KANBAN_COLUMNS = [
  { id: 'new', label: 'New Requests', statuses: ['new'] },
  { id: 'processing', label: 'Processing', statuses: ['reviewing', 'quoted', 'accepted'] },
  { id: 'ready', label: 'Ready', statuses: ['scheduled', 'for_pickup', 'picked_up'] },
  { id: 'transit', label: 'In Transit', statuses: ['in_transit'] },
  { id: 'completed', label: 'Completed', statuses: ['delivered', 'cancelled'] }
];

const EMPTY_FORM = {
  status: 'new',
  assignedAdminEmail: '',
  adminNotes: '',
  quotedPrice: '',
  targetPickupDate: '',
  targetDeliveryDate: '',
  driverLocation: '',
  driverLat: '',
  driverLng: '',
};

const ADMIN_PAGE_SIZE = 100; // Increased for Kanban board

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleString();
}

function formatMoney(value) {
  if (!value) {
    return 'No quote yet';
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getStatusClass(status) {
  return `admin-status-chip ${status || 'new'}`;
}

function toDatetimeLocal(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 16);
}

function createFormState(inquiry) {
  if (!inquiry) {
    return EMPTY_FORM;
  }

  return {
    status: inquiry.status || 'new',
    assignedAdminEmail: inquiry.assigned_admin_email || '',
    adminNotes: inquiry.admin_notes || '',
    quotedPrice: inquiry.quoted_price || '',
    targetPickupDate: toDatetimeLocal(inquiry.target_pickup_date),
    targetDeliveryDate: toDatetimeLocal(inquiry.target_delivery_date),
    driverLocation: inquiry.driver_location || '',
    driverLat: inquiry.driver_lat || '',
    driverLng: inquiry.driver_lng || '',
  };
}

function AdminDashboard({ session, profile, setSession }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [payload, setPayload] = useState({ counters: {}, inquiries: [], admins: [] });
  const [page, setPage] = useState(1);
  const [selectedReference, setSelectedReference] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [newInquiryNotice, setNewInquiryNotice] = useState('');
  const [pendingDeleteReference, setPendingDeleteReference] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const isAdmin = profile?.role === 'admin';
  const supabase = getSupabaseBrowserClient();
  const knownReferencesRef = useRef(new Set());

  const selectedInquiry = useMemo(
    () => payload.inquiries.find((inquiry) => inquiry.reference === selectedReference) || null,
    [payload.inquiries, selectedReference],
  );

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (!isAdmin || !session?.access_token) {
      return;
    }

    if (!quiet) {
      setIsLoading(true);
      setStatus('Loading admin inquiries...');
    }

    try {
      const data = await getAdminInquiries(session.access_token, {
        status: statusFilter,
        search,
        page,
        pageSize: ADMIN_PAGE_SIZE,
      });
      const nextReferences = new Set((data.inquiries || []).map((inquiry) => inquiry.reference));
      const previousReferences = knownReferencesRef.current;

      if (previousReferences.size > 0 && quiet) {
        const freshReferences = [...nextReferences].filter((reference) => !previousReferences.has(reference));

        if (freshReferences.length > 0) {
          setNewInquiryNotice(`${freshReferences.length} new inquiry${freshReferences.length > 1 ? 'ies' : ''} received.`);
        }
      }

      knownReferencesRef.current = nextReferences;
      setPayload(data);
      setSelectedReference((current) => {
        if (current && data.inquiries.some((inquiry) => inquiry.reference === current)) {
          return current;
        }

        return ''; // Don't auto-select in Kanban view
      });
      setLastSyncedAt(new Date().toLocaleTimeString());
      if (!quiet) {
        setStatus('');
      }
    } catch (loadError) {
      setStatus(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, page, search, session?.access_token, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!isAdmin || !session?.access_token) {
      return undefined;
    }

    const refreshTimer = window.setInterval(() => {
        getAdminInquiries(session.access_token, {
          status: statusFilter,
          search,
          page,
          pageSize: ADMIN_PAGE_SIZE,
        })
      .then((data) => {
        setPayload(data);
        setLastSyncedAt(new Date().toLocaleTimeString());
      })
      .catch(() => undefined);
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [isAdmin, page, search, session, statusFilter]);

  useEffect(() => {
    if (!isAdmin || !session?.access_token || !supabase) {
      return undefined;
    }

    let refreshTimer;
    const syncLiveUpdate = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        loadDashboard({ quiet: true });
        setLiveStatus('Live update received.');
      }, 350);
    };

    const channel = supabase
      .channel('ahv-admin-live-inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, syncLiveUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_images' }, syncLiveUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_status_history' }, syncLiveUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, syncLiveUpdate)
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          setLiveStatus('Realtime connected.');
        }
      });

    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loadDashboard, session?.access_token, supabase]);

  useEffect(() => {
    setForm(createFormState(selectedInquiry));
    setPendingDeleteReference('');
  }, [selectedInquiry]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveInquiry = async (event) => {
    event.preventDefault();

    if (!selectedInquiry || !session?.access_token) {
      return;
    }

    setIsSaving(true);
    setStatus('Saving admin updates...');

    try {
      await updateAdminInquiry(session.access_token, selectedInquiry.reference, form);
      await loadDashboard({ quiet: true });
      setStatus('Inquiry updated.');
    } catch (saveError) {
      setStatus(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const rejectInquiry = async () => {
    if (!selectedInquiry || !session?.access_token) {
      return;
    }

    setIsSaving(true);
    setStatus('Rejecting inquiry...');

    try {
      await updateAdminInquiry(session.access_token, selectedInquiry.reference, {
        ...form,
        status: 'cancelled',
        adminNotes: form.adminNotes || 'Inquiry rejected by AHV admin.',
      });
      await loadDashboard({ quiet: true });
      setStatus('Inquiry rejected.');
    } catch (rejectError) {
      setStatus(rejectError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteInquiry = async () => {
    if (!selectedInquiry || !session?.access_token) {
      return;
    }

    if (pendingDeleteReference !== selectedInquiry.reference) {
      setPendingDeleteReference(selectedInquiry.reference);
      setStatus('Tap Delete Inquiry again to permanently remove this inquiry record.');
      return;
    }

    setIsSaving(true);
    setStatus('Deleting inquiry...');

    try {
      await deleteAdminInquiry(session.access_token, selectedInquiry.reference);
      setPendingDeleteReference('');
      setSelectedReference('');
      await loadDashboard({ quiet: true });
      setStatus('Inquiry deleted.');
    } catch (deleteError) {
      setStatus(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="admin-dashboard" id="admin">
      <div className="section-heading admin-heading">
        <div>
          <p className="eyebrow">Admin operations</p>
          <h2>Manage AHV trucking inquiries.</h2>
          <p>Review all client submissions, assign admins, update status, inspect cargo images, and plan the real route.</p>
        </div>
        <div className="admin-command-bar">
          <button className="admin-refresh-button" type="button" onClick={() => loadDashboard()} disabled={isLoading}>
            <RefreshCw size={17} />
            Refresh
          </button>
          <button className="admin-logout-button" type="button" onClick={signOut}>
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </div>

      <div className="admin-kpis">
        {['all', ...INQUIRY_STATUSES].map((item) => (
          <button
            key={item}
            className={statusFilter === item ? 'admin-kpi active' : 'admin-kpi'}
            type="button"
            onClick={() => setStatusFilter(item)}
          >
            <span>{item === 'all' ? 'All' : INQUIRY_STATUS_LABELS[item]}</span>
            <strong>{payload.counters?.[item] || 0}</strong>
            <small>{item === 'all' ? 'Total requests' : INQUIRY_STATUS_HELP[item]}</small>
          </button>
        ))}
      </div>

      <div className="admin-search">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, client, phone, pickup, delivery, cargo" />
      </div>

      {status && (
        <p className="admin-status">
          {(isSaving || isLoading) && <Loader2 size={16} />}
          {status}
        </p>
      )}
      {lastSyncedAt && <p className="admin-sync-note">Synced {lastSyncedAt}. Auto-refresh runs every 30 seconds.</p>}
      {liveStatus && <p className="admin-live-note">{liveStatus}</p>}
      {newInquiryNotice && (
        <button className="admin-new-notice" type="button" onClick={() => {
          setNewInquiryNotice('');
          setPage(1);
          loadDashboard();
        }}>
          {newInquiryNotice} Tap to review latest.
        </button>
      )}

      <div className="admin-map-container">
        <AdminDispatcherMap inquiries={payload.inquiries} />
      </div>

      <div className="desktop-only-warning">
        <Monitor size={48} />
        <strong>Desktop Layout Required</strong>
        <p>The Admin Kanban Board is designed for wide screens. Please access this dashboard from a desktop or laptop computer.</p>
      </div>

      <div className="admin-kanban-board">
        {KANBAN_COLUMNS.map((col) => {
          const colInquiries = payload.inquiries.filter((inq) => col.statuses.includes(inq.status));
          return (
            <div key={col.id} className="admin-kanban-column">
              <div className="admin-kanban-header">
                <span>{col.label}</span>
                <span className="count">{colInquiries.length}</span>
              </div>
              <div className="admin-kanban-cards">
                {colInquiries.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Empty
                  </div>
                ) : (
                  colInquiries.map((inquiry) => (
                    <button
                      key={inquiry.reference}
                      className="admin-kanban-card"
                      type="button"
                      onClick={() => setSelectedReference(inquiry.reference)}
                      style={{
                        borderColor: selectedInquiry?.reference === inquiry.reference ? 'var(--green)' : undefined,
                        boxShadow: selectedInquiry?.reference === inquiry.reference ? '0 0 0 2px rgba(22,163,74,0.18)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="ref">{inquiry.reference}</span>
                        <span className={`admin-status-chip ${inquiry.status}`} style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}>
                          {INQUIRY_STATUS_LABELS[inquiry.status]}
                        </span>
                      </div>
                      <strong className="route" style={{ fontSize: '0.85rem' }}>
                        {inquiry.customer_name || 'Unknown'}
                      </strong>
                      <small className="date" style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        {inquiry.pickup_address} → {inquiry.delivery_address}
                      </small>
                      <em className="price">{formatMoney(inquiry.quoted_price)}</em>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-over backdrop */}
      {selectedInquiry && (
        <div
          className="admin-slide-backdrop"
          onClick={() => setSelectedReference('')}
          role="presentation"
        />
      )}

      {/* Slide-over Detail Panel */}
      <div className={`admin-slide-panel ${selectedInquiry ? 'open' : ''}`}>
        {selectedInquiry && (
          <>
            <div className="admin-slide-header">
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--green-dark)', textTransform: 'uppercase' }}>
                  {selectedInquiry.reference}
                </span>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.1rem' }}>
                  {selectedInquiry.customer_name}
                </h3>
              </div>
              <button className="admin-slide-close" type="button" onClick={() => setSelectedReference('')}>
                <X size={20} />
              </button>
            </div>

            <div className="admin-slide-content" style={{ paddingRight: '1.25rem', boxSizing: 'border-box' }}>

              {/* Quick Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'var(--soft)', borderRadius: '10px', padding: '1rem' }}>
                <div>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Phone</small>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{selectedInquiry.customer_phone}</p>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Status</small>
                  <p style={{ margin: '0.2rem 0 0' }}>
                    <strong className={getStatusClass(selectedInquiry.status)}>{INQUIRY_STATUS_LABELS[selectedInquiry.status]}</strong>
                  </p>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Cargo</small>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedInquiry.cargo_type || '—'}</p>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Weight</small>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedInquiry.weight_kg ? `${selectedInquiry.weight_kg} kg` : '—'}</p>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Pickup</small>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedInquiry.pickup_address}</p>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <small style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Delivery</small>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedInquiry.delivery_address}</p>
                </div>
              </div>

              {/* Call & Reject actions */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <a
                  href={`tel:${selectedInquiry.customer_phone}`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--ink)', color: '#fff', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem' }}
                >
                  <PhoneCall size={15} /> Call Client
                </a>
                <button
                  type="button"
                  onClick={rejectInquiry}
                  disabled={isSaving || selectedInquiry.status === 'cancelled'}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  <Ban size={15} /> Reject
                </button>
              </div>

              {/* Route Tools */}
              <AdminRouteTools inquiry={selectedInquiry} />

              {/* Update Form */}
              <form className="admin-update-form" onSubmit={saveInquiry}>
                <label>
                  Status
                  <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                    {INQUIRY_STATUSES.map((item) => (
                      <option key={item} value={item}>{INQUIRY_STATUS_LABELS[item]}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Assigned admin
                  <select value={form.assignedAdminEmail} onChange={(event) => updateForm('assignedAdminEmail', event.target.value)}>
                    <option value="">Unassigned</option>
                    {payload.admins.map((admin) => (
                      <option key={admin.email} value={admin.email}>{admin.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Quoted price
                  <input type="number" min="0" step="0.01" value={form.quotedPrice} onChange={(event) => updateForm('quotedPrice', event.target.value)} placeholder="0.00" />
                </label>

                <label>
                  Pickup schedule
                  <input type="datetime-local" value={form.targetPickupDate} onChange={(event) => updateForm('targetPickupDate', event.target.value)} />
                </label>

                <label>
                  Delivery schedule
                  <input type="datetime-local" value={form.targetDeliveryDate} onChange={(event) => updateForm('targetDeliveryDate', event.target.value)} />
                </label>

                <label className="admin-notes-field">
                  Internal notes
                  <textarea value={form.adminNotes} onChange={(event) => updateForm('adminNotes', event.target.value)} rows="3" placeholder="Route notes, follow-up, port/ferry details..." />
                </label>

                {/* Driver Current Location Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setLocationQuery(form.driverLocation || '');
                    setLocationSuggestions([]);
                    setSelectedLocation(form.driverLat ? { lat: form.driverLat, lng: form.driverLng, label: form.driverLocation } : null);
                    setShowLocationModal(true);
                  }}
                  style={{
                    gridColumn: '1 / -1',
                    background: form.driverLat && form.driverLng
                      ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                      : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: form.driverLat && form.driverLng ? '1px solid #86efac' : '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: form.driverLat ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={18} color="white" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em' }}>Driver Location</p>
                      <p style={{ margin: '0.1rem 0 0', fontWeight: 700, fontSize: '0.88rem', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {form.driverLocation || 'Click to set location'}
                      </p>
                    </div>
                  </div>
                </button>
                </form>

                {/* Fixed Save Button */}
                <div style={{
                  position: 'sticky',
                  bottom: '-1.25rem',
                  left: 0,
                  right: 0,
                  background: 'var(--bg)',
                  padding: '1rem 0',
                  marginTop: '0.5rem',
                  borderTop: '1px solid var(--line)',
                  zIndex: 50,
                  display: 'flex',
                  justifyContent: 'flex-end'
                }}>
                  <button 
                    type="button" 
                    onClick={saveInquiry}
                    disabled={isSaving} 
                    style={{ 
                      width: '100%', 
                      padding: '1rem', 
                      fontSize: '0.95rem', 
                      background: 'var(--ink)', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '10px', 
                      fontWeight: 800, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <ShieldCheck size={18} />
                    {isSaving ? 'Saving...' : 'Save Admin Update'}
                  </button>
                </div>

              {/* Live Route Map Preview */}
              {selectedInquiry.pickup_lat && selectedInquiry.pickup_lng && selectedInquiry.delivery_lat && selectedInquiry.delivery_lng && (
                <RouteDisplayMap
                  pickup={{ lat: Number(selectedInquiry.pickup_lat), lng: Number(selectedInquiry.pickup_lng) }}
                  delivery={{ lat: Number(selectedInquiry.delivery_lat), lng: Number(selectedInquiry.delivery_lng) }}
                  status={form.status}
                  driverLat={form.driverLat || selectedInquiry.driver_lat}
                  driverLng={form.driverLng || selectedInquiry.driver_lng}
                  driverLocation={form.driverLocation || selectedInquiry.driver_location}
                  height="220px"
                />
              )}

              {/* Cargo Images */}
              <div className="admin-images">
                <div className="admin-detail-title">
                  <ImageIcon size={18} />
                  <h4>Cargo images</h4>
                </div>
                {selectedInquiry.images?.length > 0 ? (
                  <div>
                    {selectedInquiry.images.map((image) => {
                      const imageUrl = image.public_url || image.publicUrl || image.url;
                      return imageUrl ? (
                        <a key={image.id || imageUrl} href={imageUrl} target="_blank" rel="noreferrer">
                          <img src={imageUrl} alt={image.filename || 'Cargo image'} />
                          <span>{image.filename || 'Cargo image'}</span>
                        </a>
                      ) : (
                        <div className="admin-image-missing" key={image.id || image.filename}>
                          <ImageIcon size={20} />
                          <span>{image.filename || 'Cargo image'} has no public URL.</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="admin-empty-note">No cargo images attached.</p>
                )}
              </div>

              {/* Status History */}
              <div className="admin-history">
                <div className="admin-detail-title">
                  <Truck size={18} />
                  <h4>Status history</h4>
                </div>
                {(selectedInquiry.status_history || []).length === 0 ? (
                  <p>No status history yet.</p>
                ) : (
                  selectedInquiry.status_history.map((item) => (
                    <p key={item.id}><strong>{INQUIRY_STATUS_LABELS[item.status]}</strong> — {formatDate(item.created_at)}</p>
                  ))
                )}
              </div>

              {/* Danger Zone */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                <button
                  className={pendingDeleteReference === selectedInquiry.reference ? 'confirm' : ''}
                  type="button"
                  onClick={deleteInquiry}
                  disabled={isSaving}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: pendingDeleteReference === selectedInquiry.reference ? '#dc2626' : '#fff', color: pendingDeleteReference === selectedInquiry.reference ? '#fff' : '#dc2626', border: '1px solid #fca5a5', fontWeight: 700, cursor: 'pointer' }}
                >
                  <Trash2 size={15} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  {pendingDeleteReference === selectedInquiry.reference ? 'Confirm Delete' : 'Delete Inquiry'}
                </button>
              </div>

            </div>
          </>
        )}
      </div>
      {/* Driver Location Modal */}
      {showLocationModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowLocationModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 2000 }}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2001,
            width: '100%',
            maxWidth: '520px',
            background: '#fff',
            borderRadius: '20px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #16a34a, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={20} color="white" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Update Driver Location</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Search for the driver's current position</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                style={{ background: 'var(--soft)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Box */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  autoFocus
                  value={locationQuery}
                  onChange={async (e) => {
                    const q = e.target.value;
                    setLocationQuery(q);
                    setSelectedLocation(null);
                    if (q.trim().length < 3) { setLocationSuggestions([]); return; }
                    setLocationSearching(true);
                    try {
                      const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Philippines')}&format=json&limit=6&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } }
                      );
                      const data = await res.json();
                      setLocationSuggestions(data);
                    } catch { setLocationSuggestions([]); }
                    setLocationSearching(false);
                  }}
                  placeholder="Type a city, municipality, or barangay..."
                  style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '12px', border: '1.5px solid var(--line)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }}
                />
                {locationSearching && (
                  <Loader2 size={16} style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />
                )}
              </div>
            </div>

            {/* Suggestions */}
            {locationSuggestions.length > 0 && !selectedLocation && (
              <div style={{ maxHeight: '250px', overflowY: 'auto', borderBottom: '1px solid var(--line)' }}>
                {locationSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedLocation({ lat: item.lat, lng: item.lon, label: item.display_name });
                      setLocationQuery(item.display_name);
                      setLocationSuggestions([]);
                    }}
                    style={{ width: '100%', padding: '0.9rem 1.5rem', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--soft)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <MapPin size={15} style={{ color: '#16a34a', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--ink)', display: 'block', lineHeight: 1.3 }}>
                        {item.address?.city || item.address?.town || item.address?.municipality || item.address?.county || item.address?.state || item.display_name.split(',')[0]}
                      </strong>
                      <small style={{ color: 'var(--muted)', fontSize: '0.76rem', lineHeight: 1.4 }}>
                        {item.display_name}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Location Preview */}
            {selectedLocation && (
              <div style={{ padding: '1rem 1.5rem', background: '#f0fdf4', borderBottom: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={16} color="white" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#15803d' }}>📍 Location selected</p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedLocation.label}
                  </p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#4ade80', fontFamily: 'monospace' }}>
                    {Number(selectedLocation.lat).toFixed(5)}, {Number(selectedLocation.lng).toFixed(5)}
                  </p>
                </div>
              </div>
            )}

            {/* Confirm Button */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                style={{ flex: 1, padding: '0.85rem', borderRadius: '12px', border: '1.5px solid var(--line)', background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedLocation}
                onClick={() => {
                  if (!selectedLocation) return;
                  updateForm('driverLocation', selectedLocation.label);
                  updateForm('driverLat', selectedLocation.lat);
                  updateForm('driverLng', selectedLocation.lng);
                  setShowLocationModal(false);
                }}
                style={{
                  flex: 2,
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: selectedLocation ? 'linear-gradient(135deg, #16a34a, #15803d)' : '#e2e8f0',
                  color: selectedLocation ? '#fff' : '#94a3b8',
                  fontWeight: 800,
                  cursor: selectedLocation ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.2s',
                }}
              >
                <MapPin size={15} />
                Confirm Location
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default AdminDashboard;
