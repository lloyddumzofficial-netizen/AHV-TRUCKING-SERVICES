"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MapPin,
  Monitor,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { INQUIRY_STATUSES, INQUIRY_STATUS_LABELS } from '../../data/inquiryStatus.js';
import { deleteAdminInquiry, getAdminInquiries, updateAdminInquiry } from '../../lib/admin/api.js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client.js';
import AdminRouteTools from './AdminRouteTools.jsx';

const RouteDisplayMap = dynamic(() => import('../RouteDisplayMap.jsx'), {
  ssr: false,
  loading: () => <div className="admin-map-skeleton">Loading map...</div>,
});

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

const ADMIN_PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'customer', label: 'Customer A-Z' },
  { value: 'status', label: 'Status' },
  { value: 'quote', label: 'Highest quote' },
];

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  if (!value) {
    return 'No quote';
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

function countStatuses(counters, statuses) {
  return statuses.reduce((total, status) => total + Number(counters?.[status] || 0), 0);
}

function getInquirySubject(inquiry) {
  const cargo = inquiry.cargo_type || 'General cargo';
  const pickup = inquiry.pickup_address || 'Pickup not set';
  const delivery = inquiry.delivery_address || 'Delivery not set';

  return `${cargo} - ${pickup} to ${delivery}`;
}

function sortInquiries(inquiries, sortBy) {
  return [...inquiries].sort((first, second) => {
    if (sortBy === 'oldest') {
      return new Date(first.created_at || 0) - new Date(second.created_at || 0);
    }

    if (sortBy === 'customer') {
      return (first.customer_name || '').localeCompare(second.customer_name || '');
    }

    if (sortBy === 'status') {
      return (first.status || '').localeCompare(second.status || '');
    }

    if (sortBy === 'quote') {
      return Number(second.quoted_price || 0) - Number(first.quoted_price || 0);
    }

    return new Date(second.created_at || 0) - new Date(first.created_at || 0);
  });
}

function ToastIcon({ type }) {
  if (type === 'error') {
    return <AlertCircle size={18} />;
  }

  if (type === 'success') {
    return <CheckCircle2 size={18} />;
  }

  return <ShieldCheck size={18} />;
}

function AdminDashboard({ session, profile, setSession }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [payload, setPayload] = useState({ counters: {}, inquiries: [], admins: [], pagination: null });
  const [page, setPage] = useState(1);
  const [selectedReference, setSelectedReference] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [newInquiryNotice, setNewInquiryNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const isAdmin = profile?.role === 'admin';
  const supabase = getSupabaseBrowserClient();
  const knownReferencesRef = useRef(new Set());
  const isDirtyRef = useRef(false);
  const loadedReferenceRef = useRef('');

  const selectedInquiry = useMemo(
    () => payload.inquiries.find((inquiry) => inquiry.reference === selectedReference) || null,
    [payload.inquiries, selectedReference],
  );

  const sortedInquiries = useMemo(
    () => sortInquiries(payload.inquiries || [], sortBy),
    [payload.inquiries, sortBy],
  );

  const pagination = payload.pagination || {
    page,
    pageSize: ADMIN_PAGE_SIZE,
    total: sortedInquiries.length,
    totalPages: 1,
  };

  const hasFilters = Boolean(search.trim() || statusFilter !== 'all');
  const driverLink = selectedInquiry?.driver_tracking_token && typeof window !== 'undefined'
    ? `${window.location.origin}/driver/track/${selectedInquiry.driver_tracking_token}`
    : '';

  const addToast = useCallback((type, message) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, type, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

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
          const notice = `${freshReferences.length} new inquiry${freshReferences.length > 1 ? 'ies' : ''} received.`;
          setNewInquiryNotice(notice);
          addToast('info', notice);
        }
      }

      knownReferencesRef.current = nextReferences;
      setPayload(data);
      setSelectedReference((current) => {
        if (current && data.inquiries.some((inquiry) => inquiry.reference === current)) {
          return current;
        }

        return '';
      });
      setLastSyncedAt(new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }));
      if (!quiet) {
        setStatus('');
      }
    } catch (loadError) {
      setStatus(loadError.message);
      addToast('error', loadError.message || 'Could not load admin inquiries.');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, isAdmin, page, search, session?.access_token, statusFilter]);

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
          setLastSyncedAt(new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }));
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
        setLiveStatus('Realtime update received');
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
          setLiveStatus('Realtime connected');
        }
      });

    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loadDashboard, session?.access_token, supabase]);

  useEffect(() => {
    if (selectedInquiry?.reference !== loadedReferenceRef.current) {
      isDirtyRef.current = false;
      loadedReferenceRef.current = selectedInquiry?.reference || '';
      setForm(createFormState(selectedInquiry));
      setDeleteTarget(null);
      return;
    }

    if (isDirtyRef.current) {
      return;
    }

    setForm(createFormState(selectedInquiry));
    setDeleteTarget(null);
  }, [selectedInquiry]);

  useEffect(() => {
    const q = locationQuery;

    if (q.trim().length < 3 || selectedLocation?.label === q) {
      if (!selectedLocation && locationSuggestions.length > 0) {
        setLocationSuggestions([]);
      }
      return undefined;
    }

    setLocationSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${q}, Philippines`)}&format=json&limit=6&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        if (res.ok) {
          const data = await res.json();
          setLocationSuggestions(data);
        } else {
          setLocationSuggestions([]);
        }
      } catch {
        setLocationSuggestions([]);
      } finally {
        setLocationSearching(false);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [locationQuery, locationSuggestions.length, selectedLocation]);

  const updateForm = (field, value) => {
    isDirtyRef.current = true;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const patchInquiryInPayload = (reference, inquiry) => {
    if (!inquiry) {
      return;
    }

    setPayload((current) => ({
      ...current,
      inquiries: current.inquiries.map((item) => (item.reference === reference ? { ...item, ...inquiry } : item)),
    }));
  };

  const saveInquiry = async (event) => {
    if (event) {
      event.preventDefault();
    }

    if (!selectedInquiry || !session?.access_token) {
      return;
    }

    setIsSaving(true);
    setStatus('Saving admin updates...');

    try {
      const result = await updateAdminInquiry(session.access_token, selectedInquiry.reference, form);
      isDirtyRef.current = false;
      patchInquiryInPayload(selectedInquiry.reference, result?.inquiry);
      await loadDashboard({ quiet: true });
      setStatus('');
      addToast('success', 'Inquiry updated.');
    } catch (saveError) {
      setStatus(saveError.message);
      addToast('error', saveError.message || 'Could not update inquiry.');
    } finally {
      setIsSaving(false);
    }
  };

  const markAsRead = async (inquiry) => {
    if (!inquiry || inquiry.status !== 'new' || !session?.access_token) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await updateAdminInquiry(session.access_token, inquiry.reference, {
        status: 'reviewing',
        adminNotes: inquiry.admin_notes || 'Marked as read by AHV admin.',
      });
      patchInquiryInPayload(inquiry.reference, result?.inquiry);
      await loadDashboard({ quiet: true });
      addToast('success', `${inquiry.reference} marked as read.`);
    } catch (readError) {
      addToast('error', readError.message || 'Could not mark inquiry as read.');
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
      const result = await updateAdminInquiry(session.access_token, selectedInquiry.reference, {
        ...form,
        status: 'cancelled',
        adminNotes: form.adminNotes || 'Inquiry rejected by AHV admin.',
      });
      patchInquiryInPayload(selectedInquiry.reference, result?.inquiry);
      await loadDashboard({ quiet: true });
      setStatus('');
      addToast('success', 'Inquiry rejected.');
    } catch (rejectError) {
      setStatus(rejectError.message);
      addToast('error', rejectError.message || 'Could not reject inquiry.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteInquiry = async () => {
    if (!deleteTarget || !session?.access_token) {
      return;
    }

    setIsSaving(true);

    try {
      await deleteAdminInquiry(session.access_token, deleteTarget.reference);
      setDeleteTarget(null);
      setSelectedReference((current) => (current === deleteTarget.reference ? '' : current));
      await loadDashboard({ quiet: true });
      addToast('success', `${deleteTarget.reference} deleted.`);
    } catch (deleteError) {
      addToast('error', deleteError.message || 'Could not delete inquiry.');
    } finally {
      setIsSaving(false);
    }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  const generateDriverLink = async (reference) => {
    try {
      setGeneratingLink(true);
      const res = await fetch(`/api/admin/inquiries/${reference}/driver-link`, {
        method: 'POST',
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned a non-JSON response. Status: ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP Error ${res.status}`);
      }

      setPayload((current) => ({
        ...current,
        inquiries: current.inquiries.map((inquiry) =>
          inquiry.reference === reference ? { ...inquiry, driver_tracking_token: data.token } : inquiry
        ),
      }));
      addToast('success', 'Driver tracking link generated.');
    } catch (err) {
      addToast('error', err.message || 'Could not generate tracking link.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', 'Tracking link copied.');
    } catch {
      addToast('error', 'Could not copy tracking link.');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSortBy('newest');
    setPage(1);
  };

  const overviewCards = [
    {
      label: 'Total inquiries',
      value: payload.counters?.all || 0,
      help: 'All submitted requests',
      tone: 'ink',
    },
    {
      label: 'Pending',
      value: countStatuses(payload.counters, ['new', 'reviewing']),
      help: 'Needs review or follow-up',
      tone: 'amber',
    },
    {
      label: 'Active bookings',
      value: countStatuses(payload.counters, ['scheduled', 'for_pickup', 'picked_up', 'in_transit']),
      help: 'Scheduled or moving cargo',
      tone: 'green',
    },
    {
      label: 'Resolved',
      value: payload.counters?.delivered || 0,
      help: 'Delivered inquiries',
      tone: 'blue',
    },
  ];

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="admin-dashboard admin-console" id="admin">
      <div className="desktop-only-warning admin-desktop-gate">
        <Monitor size={44} />
        <strong>Desktop dashboard required</strong>
        <p>For admin safety and faster operations, please manage inquiries from a laptop or desktop screen.</p>
      </div>

      <div className="admin-console-shell">
        <aside className="admin-sidebar" aria-label="Admin dashboard navigation">
          <div className="admin-sidebar-brand">
            <Truck size={22} />
            <div>
              <strong>AHV Admin</strong>
              <span>Operations console</span>
            </div>
          </div>
          <nav>
            <a href="#admin-overview" className="active">
              <ClipboardList size={17} />
              Dashboard
            </a>
            <a href="#admin-inquiries">
              <Search size={17} />
              Inquiries
            </a>
            <a href="#admin-sync">
              <ShieldCheck size={17} />
              Realtime
            </a>
          </nav>
          <div className="admin-sidebar-status" id="admin-sync">
            <span>Last synced</span>
            <strong>{lastSyncedAt || 'Waiting'}</strong>
            <small>{liveStatus || 'Realtime starting'}</small>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-console-header">
            <div>
              <p className="eyebrow">Admin operations</p>
              <h1>Inquiries Management</h1>
              <p>Review client requests, quote routes, coordinate drivers, and keep each shipment moving.</p>
            </div>
            <div className="admin-command-bar">
              <button className="admin-refresh-button" type="button" onClick={() => loadDashboard()} disabled={isLoading}>
                <RefreshCw size={17} className={isLoading ? 'spinning' : ''} />
                Refresh
              </button>
              <button className="admin-logout-button" type="button" onClick={signOut}>
                <LogOut size={17} />
                Logout
              </button>
            </div>
          </header>

          <section className="admin-overview-grid" id="admin-overview" aria-label="Dashboard overview">
            {isLoading && sortedInquiries.length === 0 ? (
              [1, 2, 3, 4].map((item) => <div className="admin-overview-card skeleton-pulse" key={item} />)
            ) : (
              overviewCards.map((card) => (
                <article className={`admin-overview-card ${card.tone}`} key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.help}</small>
                </article>
              ))
            )}
          </section>

          {newInquiryNotice && (
            <button
              className="admin-new-notice"
              type="button"
              onClick={() => {
                setNewInquiryNotice('');
                setPage(1);
                loadDashboard();
              }}
            >
              {newInquiryNotice} Click to review latest.
            </button>
          )}

          <section className="admin-table-panel" id="admin-inquiries">
            <div className="admin-panel-head">
              <div>
                <span>Inquiries</span>
                <h2>Client requests queue</h2>
              </div>
              <p>{pagination.total || sortedInquiries.length} total records</p>
            </div>

            <div className="admin-filter-bar">
              <label className="admin-search">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search reference, client, phone, pickup, delivery, cargo"
                />
              </label>
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {INQUIRY_STATUSES.map((item) => (
                    <option key={item} value={item}>{INQUIRY_STATUS_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {hasFilters && (
                <button className="admin-clear-button" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {status && (
              <p className="admin-status">
                {(isSaving || isLoading) && <Loader2 size={16} className="spinning" />}
                {status}
              </p>
            )}

            <div className="admin-sync-strip">
              <span>Last synced: {lastSyncedAt || 'Not yet'}</span>
              <span>{liveStatus || 'Realtime starting'}</span>
              <span>Auto-refresh every 30 seconds</span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-inquiries-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Subject / Route</th>
                    <th>Status</th>
                    <th>Quote</th>
                    <th>Assigned</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && sortedInquiries.length === 0 ? (
                    [1, 2, 3, 4, 5].map((item) => (
                      <tr className="admin-table-skeleton" key={item}>
                        <td colSpan="7"><span className="skeleton-pulse" /></td>
                      </tr>
                    ))
                  ) : sortedInquiries.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <div className="admin-empty-state">
                          <ClipboardList size={28} />
                          <strong>No inquiries found</strong>
                          <span>Try another search term or clear the filters.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedInquiries.map((inquiry) => (
                      <tr
                        key={inquiry.reference}
                        className={selectedInquiry?.reference === inquiry.reference ? 'selected' : ''}
                      >
                        <td>
                          <time>{formatDate(inquiry.created_at)}</time>
                          <small>{inquiry.reference}</small>
                        </td>
                        <td>
                          <strong>{inquiry.customer_name || 'Unknown client'}</strong>
                          <small>{inquiry.customer_phone || 'No phone'}</small>
                        </td>
                        <td>
                          <strong>{inquiry.cargo_type || 'General cargo'}</strong>
                          <small>{inquiry.pickup_address || 'Pickup not set'} to {inquiry.delivery_address || 'Delivery not set'}</small>
                        </td>
                        <td>
                          <span className={getStatusClass(inquiry.status)}>
                            {INQUIRY_STATUS_LABELS[inquiry.status] || inquiry.status || 'New'}
                          </span>
                        </td>
                        <td>{formatMoney(inquiry.quoted_price)}</td>
                        <td>{inquiry.assigned_admin_email || 'Unassigned'}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" onClick={() => setSelectedReference(inquiry.reference)}>
                              <Eye size={15} />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => markAsRead(inquiry)}
                              disabled={isSaving || inquiry.status !== 'new'}
                            >
                              <CheckCircle2 size={15} />
                              Mark read
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setDeleteTarget(inquiry)}
                              disabled={isSaving}
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="admin-pagination">
              <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1 || isLoading}>
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>Page {pagination.page || page} of {pagination.totalPages || 1}</span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={isLoading || (pagination.page || page) >= (pagination.totalPages || 1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </section>
        </main>
      </div>

      {selectedInquiry && (
        <button
          className="admin-slide-backdrop"
          type="button"
          onClick={() => setSelectedReference('')}
          aria-label="Close inquiry details"
        />
      )}

      <aside className={`admin-slide-panel ${selectedInquiry ? 'open' : ''}`} aria-label="Inquiry details">
        {selectedInquiry && (
          <>
            <div className="admin-slide-header">
              <div>
                <span>{selectedInquiry.reference}</span>
                <h3>{selectedInquiry.customer_name || 'Unknown client'}</h3>
                <p>{getInquirySubject(selectedInquiry)}</p>
              </div>
              <button className="admin-slide-close" type="button" onClick={() => setSelectedReference('')} aria-label="Close details">
                <X size={20} />
              </button>
            </div>

            <div className="admin-slide-content">
              <section className="admin-detail-section">
                <div className="admin-detail-title">
                  <PhoneCall size={18} />
                  <h4>Client</h4>
                </div>
                <div className="admin-detail-grid compact">
                  <p><strong>Phone</strong><span>{selectedInquiry.customer_phone || 'Not provided'}</span></p>
                  <p><strong>Status</strong><span className={getStatusClass(selectedInquiry.status)}>{INQUIRY_STATUS_LABELS[selectedInquiry.status]}</span></p>
                  <p><strong>Cargo</strong><span>{selectedInquiry.cargo_type || 'General cargo'}</span></p>
                  <p><strong>Weight</strong><span>{selectedInquiry.weight_kg ? `${selectedInquiry.weight_kg} kg` : 'Not set'}</span></p>
                </div>
                <div className="admin-detail-actions">
                  <a href={`tel:${selectedInquiry.customer_phone || ''}`}>
                    <PhoneCall size={15} />
                    Call Client
                  </a>
                  <button type="button" onClick={rejectInquiry} disabled={isSaving || selectedInquiry.status === 'cancelled'}>
                    <Ban size={15} />
                    Reject
                  </button>
                </div>
              </section>

              <section className="admin-detail-section">
                <div className="admin-detail-title">
                  <MapPin size={18} />
                  <h4>Route</h4>
                </div>
                <div className="admin-route-pair">
                  <p><strong>Pickup</strong><span>{selectedInquiry.pickup_address || 'Pickup not set'}</span></p>
                  <p><strong>Delivery</strong><span>{selectedInquiry.delivery_address || 'Delivery not set'}</span></p>
                </div>
                <AdminRouteTools inquiry={selectedInquiry} />
              </section>

              <form className="admin-detail-section admin-update-form" onSubmit={saveInquiry}>
                <div className="admin-detail-title">
                  <ShieldCheck size={18} />
                  <h4>Operations</h4>
                </div>
                <div className="admin-form-grid">
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
                    <textarea value={form.adminNotes} onChange={(event) => updateForm('adminNotes', event.target.value)} rows="3" placeholder="Route notes, follow-up, port or ferry details..." />
                  </label>
                </div>
                <button
                  className={form.driverLat && form.driverLng ? 'admin-location-button active' : 'admin-location-button'}
                  type="button"
                  onClick={() => {
                    setLocationQuery(form.driverLocation || '');
                    setLocationSuggestions([]);
                    setSelectedLocation(form.driverLat ? { lat: form.driverLat, lng: form.driverLng, label: form.driverLocation } : null);
                    setShowLocationModal(true);
                  }}
                >
                  <span><MapPin size={18} /></span>
                  <div>
                    <strong>Manual driver location override</strong>
                    <small>{form.driverLocation || 'Click to set manually'}</small>
                  </div>
                </button>
                <div className="admin-sticky-save">
                  <button type="submit" disabled={isSaving}>
                    <ShieldCheck size={18} />
                    {isSaving ? 'Saving...' : 'Save Admin Update'}
                  </button>
                </div>
              </form>

              <section className="admin-detail-section">
                <div className="admin-detail-title">
                  <LinkIcon size={18} />
                  <h4>Driver Tracking</h4>
                </div>
                {driverLink ? (
                  <>
                    <p className="admin-helper-text">Send this secure link to the driver to stream live GPS coordinates.</p>
                    <div className="admin-copy-row">
                      <input type="text" readOnly value={driverLink} />
                      <button type="button" onClick={() => copyToClipboard(driverLink)}>
                        <Copy size={14} />
                        Copy
                      </button>
                    </div>
                    <a className="admin-text-link" href={`/driver/track/${selectedInquiry.driver_tracking_token}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} />
                      Test link as driver
                    </a>
                  </>
                ) : (
                  <>
                    <p className="admin-helper-text">No tracking link exists yet. Generate a secure link to send to the assigned driver.</p>
                    <button className="admin-generate-button" type="button" onClick={() => generateDriverLink(selectedInquiry.reference)} disabled={generatingLink}>
                      {generatingLink ? 'Generating...' : 'Generate Tracking Link'}
                    </button>
                  </>
                )}
              </section>

              {selectedInquiry.pickup_lat && selectedInquiry.pickup_lng && selectedInquiry.delivery_lat && selectedInquiry.delivery_lng && (
                <section className="admin-detail-section">
                  <div className="admin-detail-title">
                    <Truck size={18} />
                    <h4>Live Route Map</h4>
                  </div>
                  <RouteDisplayMap
                    pickup={{ lat: Number(selectedInquiry.pickup_lat), lng: Number(selectedInquiry.pickup_lng) }}
                    delivery={{ lat: Number(selectedInquiry.delivery_lat), lng: Number(selectedInquiry.delivery_lng) }}
                    status={form.status}
                    driverLat={form.driverLat || selectedInquiry.driver_lat}
                    driverLng={form.driverLng || selectedInquiry.driver_lng}
                    driverLocation={form.driverLocation || selectedInquiry.driver_location}
                    driverAccuracy={selectedInquiry.driver_accuracy_m}
                    driverSpeedKph={selectedInquiry.driver_speed_kph}
                    driverHeading={selectedInquiry.driver_heading}
                    driverUpdatedAt={selectedInquiry.driver_updated_at}
                    driverTrackingActive={selectedInquiry.driver_tracking_active}
                    inquiryReference={selectedInquiry.reference}
                    height="220px"
                  />
                </section>
              )}

              <section className="admin-detail-section admin-images">
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
              </section>

              <section className="admin-detail-section admin-history">
                <div className="admin-detail-title">
                  <ClipboardList size={18} />
                  <h4>Status history</h4>
                </div>
                {(selectedInquiry.status_history || []).length === 0 ? (
                  <p>No status history yet.</p>
                ) : (
                  selectedInquiry.status_history.map((item) => (
                    <p key={item.id}><strong>{INQUIRY_STATUS_LABELS[item.status]}</strong><span>{formatDate(item.created_at)}</span></p>
                  ))
                )}
              </section>

              <section className="admin-detail-section admin-danger-zone">
                <div>
                  <strong>Danger zone</strong>
                  <span>Deleting removes this inquiry record permanently.</span>
                </div>
                <button type="button" onClick={() => setDeleteTarget(selectedInquiry)} disabled={isSaving}>
                  <Trash2 size={15} />
                  Delete Inquiry
                </button>
              </section>
            </div>
          </>
        )}
      </aside>

      {deleteTarget && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
            <div className="admin-confirm-icon">
              <Trash2 size={22} />
            </div>
            <h3 id="admin-delete-title">Delete inquiry?</h3>
            <p>
              This will permanently remove <strong>{deleteTarget.reference}</strong> for <strong>{deleteTarget.customer_name || 'Unknown client'}</strong>.
            </p>
            <div className="admin-confirm-actions">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={isSaving}>Cancel</button>
              <button type="button" className="danger" onClick={confirmDeleteInquiry} disabled={isSaving}>
                {isSaving ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-location-modal" role="dialog" aria-modal="true" aria-labelledby="admin-location-title">
            <div className="admin-modal-header">
              <div>
                <span><MapPin size={20} /></span>
                <div>
                  <h3 id="admin-location-title">Update driver location</h3>
                  <p>Search for the driver's current position in the Philippines.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowLocationModal(false)} aria-label="Close location picker">
                <X size={18} />
              </button>
            </div>

            <label className="admin-location-search">
              <Search size={16} />
              <input
                autoFocus
                value={locationQuery}
                onChange={(event) => {
                  setLocationQuery(event.target.value);
                  if (selectedLocation) {
                    setSelectedLocation(null);
                  }
                }}
                placeholder="Type a city, municipality, or barangay..."
              />
              {locationSearching && <Loader2 size={16} className="spinning" />}
            </label>

            {locationSuggestions.length > 0 && !selectedLocation && (
              <div className="admin-location-suggestions">
                {locationSuggestions.map((item) => (
                  <button
                    key={`${item.lat}-${item.lon}-${item.display_name}`}
                    type="button"
                    onClick={() => {
                      setSelectedLocation({ lat: item.lat, lng: item.lon, label: item.display_name });
                      setLocationQuery(item.display_name);
                      setLocationSuggestions([]);
                    }}
                  >
                    <MapPin size={15} />
                    <span>
                      <strong>{item.address?.city || item.address?.town || item.address?.municipality || item.address?.county || item.address?.state || item.display_name.split(',')[0]}</strong>
                      <small>{item.display_name}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedLocation && (
              <div className="admin-selected-location">
                <MapPin size={18} />
                <div>
                  <strong>Location selected</strong>
                  <span>{selectedLocation.label}</span>
                  <small>{Number(selectedLocation.lat).toFixed(5)}, {Number(selectedLocation.lng).toFixed(5)}</small>
                </div>
              </div>
            )}

            <div className="admin-confirm-actions">
              <button type="button" onClick={() => setShowLocationModal(false)}>Cancel</button>
              <button
                type="button"
                className="confirm"
                disabled={!selectedLocation || isSavingLocation}
                onClick={async () => {
                  if (!selectedLocation || !selectedInquiry || !session?.access_token) {
                    return;
                  }

                  const nextForm = {
                    ...form,
                    driverLocation: selectedLocation.label,
                    driverLat: selectedLocation.lat,
                    driverLng: selectedLocation.lng,
                  };

                  isDirtyRef.current = true;
                  setIsSavingLocation(true);
                  setForm(nextForm);
                  setShowLocationModal(false);

                  try {
                    const result = await updateAdminInquiry(session.access_token, selectedInquiry.reference, nextForm);
                    patchInquiryInPayload(selectedInquiry.reference, result?.inquiry);
                    addToast('success', 'Driver location saved.');
                  } catch (saveErr) {
                    addToast('error', saveErr.message || 'Could not save driver location.');
                  } finally {
                    isDirtyRef.current = false;
                    setIsSavingLocation(false);
                  }
                }}
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.type}`} key={toast.id}>
            <ToastIcon type={toast.type} />
            <span>{toast.message}</span>
            <button
              className="toast-close"
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default AdminDashboard;
