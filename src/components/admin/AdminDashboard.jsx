"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ClipboardList, Image as ImageIcon, Loader2, LogOut, PhoneCall, RefreshCw, Search, ShieldCheck, Truck, UserRound } from 'lucide-react';
import { INQUIRY_STATUSES, INQUIRY_STATUS_HELP, INQUIRY_STATUS_LABELS } from '../../data/inquiryStatus.js';
import { getAdminInquiries, updateAdminInquiry } from '../../lib/admin/api.js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client.js';
import AdminRouteTools from './AdminRouteTools.jsx';

const EMPTY_FORM = {
  status: 'new',
  assignedAdminEmail: '',
  adminNotes: '',
  quotedPrice: '',
  targetPickupDate: '',
  targetDeliveryDate: '',
};

const ADMIN_PAGE_SIZE = 20;

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
  const isAdmin = profile?.role === 'admin';
  const supabase = getSupabaseBrowserClient();
  const knownReferencesRef = useRef(new Set());

  const selectedInquiry = useMemo(
    () => payload.inquiries.find((inquiry) => inquiry.reference === selectedReference) || payload.inquiries[0] || null,
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

        return data.inquiries[0]?.reference || '';
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

      <div className="admin-workspace">
        <div className="admin-inquiry-list">
          {payload.inquiries.length === 0 ? (
            <article className="admin-empty">
              <ClipboardList size={24} />
              <strong>No inquiries found</strong>
              <span>New client submissions will appear here.</span>
            </article>
          ) : (
            payload.inquiries.map((inquiry) => (
              <button
                key={inquiry.reference}
                className={selectedInquiry?.reference === inquiry.reference ? 'admin-inquiry-card active' : 'admin-inquiry-card'}
                type="button"
                onClick={() => setSelectedReference(inquiry.reference)}
              >
                <span>{inquiry.reference}</span>
                <strong>{inquiry.pickup_address} to {inquiry.delivery_address}</strong>
                <small>{INQUIRY_STATUS_LABELS[inquiry.status]} - {formatDate(inquiry.created_at)}</small>
                <em>{inquiry.assigned_admin_email || 'Unassigned'} - {formatMoney(inquiry.quoted_price)}</em>
              </button>
            ))
          )}

          {payload.pagination && (
            <div className="admin-pagination">
              <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                Previous
              </button>
              <span>
                Page {payload.pagination.page} of {payload.pagination.totalPages} • {payload.pagination.total} total
              </span>
              <button
                type="button"
                disabled={page >= payload.pagination.totalPages || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {selectedInquiry && (
          <article className="admin-detail">
            <div className="admin-detail-head">
              <div>
                <span>{selectedInquiry.reference}</span>
                <h3>{selectedInquiry.customer_name}</h3>
                <p>{selectedInquiry.customer_phone}</p>
              </div>
              <strong className={getStatusClass(selectedInquiry.status)}>{INQUIRY_STATUS_LABELS[selectedInquiry.status]}</strong>
            </div>

            <div className="admin-primary-actions">
              <a href={`tel:${selectedInquiry.customer_phone}`}>
                <PhoneCall size={16} />
                Call client
              </a>
              <span>
                <CalendarClock size={16} />
                Pickup: {formatDate(selectedInquiry.target_pickup_date)}
              </span>
            </div>

            <div className="admin-detail-grid">
              <p><strong>Pickup:</strong> {selectedInquiry.pickup_address}</p>
              <p><strong>Delivery:</strong> {selectedInquiry.delivery_address}</p>
              <p><strong>Cargo:</strong> {selectedInquiry.cargo_type}</p>
              <p><strong>Weight:</strong> {selectedInquiry.weight_kg || 'Not set'} kg</p>
              <p><strong>Quantity:</strong> {selectedInquiry.quantity}</p>
              <p><strong>Created:</strong> {formatDate(selectedInquiry.created_at)}</p>
              <p><strong>Assigned:</strong> {selectedInquiry.assigned_admin_email || 'Unassigned'}</p>
              <p><strong>Quote:</strong> {formatMoney(selectedInquiry.quoted_price)}</p>
              <p><strong>Delivery schedule:</strong> {formatDate(selectedInquiry.target_delivery_date)}</p>
              <p><strong>Updated:</strong> {formatDate(selectedInquiry.updated_at)}</p>
            </div>

            {selectedInquiry.customer_profile && (
              <div className="admin-client-card">
                <UserRound size={18} />
                <div>
                  <strong>{selectedInquiry.customer_profile.full_name}</strong>
                  <span>{selectedInquiry.customer_profile.email}</span>
                  <span>{selectedInquiry.customer_profile.location}</span>
                </div>
              </div>
            )}

            <AdminRouteTools inquiry={selectedInquiry} />

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
                <textarea value={form.adminNotes} onChange={(event) => updateForm('adminNotes', event.target.value)} rows="4" placeholder="Route notes, follow-up, port/ferry details, client confirmation..." />
              </label>

              <button type="submit" disabled={isSaving}>
                <ShieldCheck size={17} />
                Save Admin Update
              </button>
            </form>

            {selectedInquiry.images?.length > 0 && (
              <div className="admin-images">
                <div className="admin-detail-title">
                  <ImageIcon size={18} />
                  <h4>Cargo images</h4>
                </div>
                <div>
                  {selectedInquiry.images.map((image) => (
                    <a key={image.id || image.public_url} href={image.public_url} target="_blank" rel="noreferrer">
                      <img src={image.public_url} alt={image.filename} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="admin-history">
              <div className="admin-detail-title">
                <Truck size={18} />
                <h4>Status history</h4>
              </div>
              {(selectedInquiry.status_history || []).length === 0 ? (
                <p>No status history yet.</p>
              ) : (
                selectedInquiry.status_history.map((item) => (
                  <p key={item.id}><strong>{INQUIRY_STATUS_LABELS[item.status]}</strong> - {formatDate(item.created_at)}</p>
                ))
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

export default AdminDashboard;
