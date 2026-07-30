export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { INQUIRY_STATUS_HELP, INQUIRY_STATUS_LABELS } from '../../../data/inquiryStatus.js';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabase/admin.js';
import { getUserFromRequest } from '../../../lib/supabase/auth.js';

function missingBackendResponse() {
  return NextResponse.json(
    { error: 'Supabase database is not configured. Add SUPABASE_SERVICE_ROLE_KEY before using notifications.' },
    { status: 503 },
  );
}

function createNotificationFromHistory(item, inquiry) {
  const status = item.status || inquiry.status || 'new';

  return {
    id: item.id || `${inquiry.reference}-${status}-${item.created_at}`,
    reference: inquiry.reference,
    status,
    label: INQUIRY_STATUS_LABELS[status] || status,
    message: item.notes || INQUIRY_STATUS_HELP[status] || 'AHV updated your inquiry.',
    route: `${inquiry.pickup_address || 'Pickup'} to ${inquiry.delivery_address || 'Delivery'}`,
    cargo: inquiry.cargo_type || 'Cargo',
    createdAt: item.created_at || inquiry.updated_at || inquiry.created_at,
  };
}

function createFallbackNotification(inquiry) {
  const status = inquiry.status || 'new';

  return {
    id: `${inquiry.reference}-${status}-${inquiry.updated_at || inquiry.created_at}`,
    reference: inquiry.reference,
    status,
    label: INQUIRY_STATUS_LABELS[status] || status,
    message: INQUIRY_STATUS_HELP[status] || 'AHV updated your inquiry.',
    route: `${inquiry.pickup_address || 'Pickup'} to ${inquiry.delivery_address || 'Delivery'}`,
    cargo: inquiry.cargo_type || 'Cargo',
    createdAt: inquiry.updated_at || inquiry.created_at,
  };
}

export async function GET(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 12, 1), 25);
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 3, 1), 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdminClient();

  const { data: inquiries, error: inquiriesError } = await supabase
    .from('inquiries')
    .select('reference, status, pickup_address, delivery_address, cargo_type, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit, 12));

  if (inquiriesError) {
    return NextResponse.json({ error: inquiriesError.message }, { status: 502 });
  }

  const inquiryRows = inquiries || [];
  const references = inquiryRows.map((inquiry) => inquiry.reference).filter(Boolean);
  const inquiryByReference = new Map(inquiryRows.map((inquiry) => [inquiry.reference, inquiry]));
  let notifications = [];

  if (references.length > 0) {
    const { data: history, error: historyError } = await supabase
      .from('inquiry_status_history')
      .select('id, inquiry_reference, status, notes, created_at')
      .in('inquiry_reference', references)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 502 });
    }

    notifications = (history || [])
      .map((item) => {
        const inquiry = inquiryByReference.get(item.inquiry_reference);
        return inquiry ? createNotificationFromHistory(item, inquiry) : null;
      })
      .filter(Boolean);
  }

  const notifiedReferences = new Set(notifications.map((item) => item.reference));
  for (const inquiry of inquiryRows) {
    const updatedAt = inquiry.updated_at || inquiry.created_at;
    if (!notifiedReferences.has(inquiry.reference) && updatedAt && updatedAt >= since) {
      notifications.push(createFallbackNotification(inquiry));
    }
  }

  notifications.sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));

  return NextResponse.json({
    notifications: notifications.slice(0, limit),
    latestAt: notifications[0]?.createdAt || null,
  });
}
