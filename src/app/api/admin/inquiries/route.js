export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAdminContext } from '../../../../lib/admin/auth.js';
import { getAdminDirectory } from '../../../../lib/admin/roles.js';
import { hydrateInquiryRows } from '../../../../lib/inquiries/serverQueries.js';
import { emptyStatusCounters, getStatusCounters } from '../../../../lib/admin/statusCounters.js';

function mapInquiry(row, profilesById) {
  return {
    ...row,
    customer_profile: profilesById.get(row.user_id) || null,
    assigned_admin: row.assigned_admin_id ? profilesById.get(row.assigned_admin_id) || null : null,
    images: row.images || [],
    status_history: row.status_history || [],
  };
}

// Characters that are structurally meaningful inside a PostgREST .or() filter,
// where the grammar is `field.operator.value` with comma-separated terms.
// Previously only % and , were stripped, so an innocuous query like "Bldg (A)"
// or "St. Paul" could produce a 400 instead of results.
function sanitizeSearch(value) {
  return value
    .replace(/[%,().*:"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyAdminFilters(query, { status, search }) {
  let nextQuery = query;

  if (status !== 'all') {
    nextQuery = nextQuery.eq('status', status);
  }

  const term = search ? sanitizeSearch(search) : '';

  if (term) {
    const pattern = `%${term}%`;
    nextQuery = nextQuery.or(
      [
        `reference.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `pickup_address.ilike.${pattern}`,
        `delivery_address.ilike.${pattern}`,
        `cargo_type.ilike.${pattern}`,
        // status was searchable via the old in-JS filter but not in SQL, so it
        // matched inconsistently and never affected the count.
        `status.ilike.${pattern}`,
      ].join(','),
    );
  }

  return nextQuery;
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
    // No in-JS re-filter here. SQL already applied the search and produced
    // `count`, so filtering again could only drop rows the database had matched —
    // making `pagination.total` overstate the rows actually returned and
    // rendering short pages.
    inquiries = await hydrateInquiryRows(supabase, data || []);
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
    counters = await getStatusCounters(supabase);
  } catch {
    counters = emptyStatusCounters(count || inquiries.length);
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
