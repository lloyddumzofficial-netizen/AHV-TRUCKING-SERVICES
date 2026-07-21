import { NextResponse } from 'next/server';
import { INQUIRY_STATUSES } from '../../../../data/inquiryStatus.js';
import { getAdminContext } from '../../../../lib/admin/auth.js';
import { getAdminDirectory } from '../../../../lib/admin/roles.js';
import { hydrateInquiryRows } from '../../../../lib/inquiries/serverQueries.js';

function mapInquiry(row, profilesById) {
  return {
    ...row,
    customer_profile: profilesById.get(row.user_id) || null,
    assigned_admin: row.assigned_admin_id ? profilesById.get(row.assigned_admin_id) || null : null,
    images: row.inquiry_images || [],
    status_history: row.inquiry_status_history || [],
  };
}

function matchesSearch(inquiry, search) {
  if (!search) {
    return true;
  }

  const haystack = [
    inquiry.reference,
    inquiry.customer_name,
    inquiry.customer_phone,
    inquiry.pickup_address,
    inquiry.delivery_address,
    inquiry.cargo_type,
    inquiry.status,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function sanitizeSearch(value) {
  return value.replaceAll('%', '').replaceAll(',', ' ').trim();
}

function applyAdminFilters(query, { status, search }) {
  let nextQuery = query;

  if (status !== 'all') {
    nextQuery = nextQuery.eq('status', status);
  }

  if (search) {
    const pattern = `%${sanitizeSearch(search)}%`;
    nextQuery = nextQuery.or(
      [
        `reference.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `pickup_address.ilike.${pattern}`,
        `delivery_address.ilike.${pattern}`,
        `cargo_type.ilike.${pattern}`,
      ].join(','),
    );
  }

  return nextQuery;
}

async function countByStatus(supabase, status) {
  let query = supabase
    .from('inquiries')
    .select('reference', { count: 'exact', head: true });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

export async function GET(request) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const search = searchParams.get('search')?.trim() || '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize')) || 20, 10), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = context.supabase;
  let query = applyAdminFilters(
    supabase
      .from('inquiries')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false }),
    { status, search },
  ).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  let inquiries;

  try {
    inquiries = (await hydrateInquiryRows(supabase, data || [])).filter((inquiry) => matchesSearch(inquiry, search));
  } catch (hydrateError) {
    return NextResponse.json({ error: hydrateError.message }, { status: 502 });
  }
  const profileIds = [...new Set(inquiries.flatMap((inquiry) => [inquiry.user_id, inquiry.assigned_admin_id]).filter(Boolean))];
  const profilesById = new Map();

  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone, location, profile_image_url, role')
      .in('id', profileIds);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 502 });
    }

    profiles.forEach((profile) => profilesById.set(profile.id, profile));
  }

  let counters;

  try {
    const counts = await Promise.all(['all', ...INQUIRY_STATUSES].map((inquiryStatus) => countByStatus(supabase, inquiryStatus)));
    counters = ['all', ...INQUIRY_STATUSES].reduce((current, inquiryStatus, index) => ({
      ...current,
      [inquiryStatus]: counts[index],
    }), {});
  } catch {
    counters = INQUIRY_STATUSES.reduce((current, inquiryStatus) => ({
      ...current,
      [inquiryStatus]: 0,
    }), { all: count || inquiries.length });
  }

  return NextResponse.json({
    admins: getAdminDirectory(),
    counters,
    inquiries: inquiries.map((inquiry) => mapInquiry(inquiry, profilesById)),
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: Math.max(Math.ceil((count || 0) / pageSize), 1),
    },
  });
}
