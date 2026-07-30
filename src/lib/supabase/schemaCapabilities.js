// Tolerate the GPS-hardening migration not having been applied yet.
//
// 20260730_driver_gps_hardening.sql adds driver_fix_at and
// driver_token_expires_at. Selecting a column that does not exist makes
// PostgREST fail the whole request (SQLSTATE 42703), so shipping this code
// before running the migration would take driver tracking down entirely.
//
// Each route asks once per process whether the columns are present and caches
// the answer, then selects accordingly. Delete this module (and its callers'
// fallbacks) once the migration is applied everywhere.

const UNDEFINED_COLUMN = '42703';

/** True when a Supabase error is "column does not exist". */
export function isUndefinedColumnError(error) {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  return /column .* does not exist/i.test(error.message || '');
}

// null = not probed yet.
let hasGpsHardeningColumns = null;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} whether driver_fix_at / driver_token_expires_at exist
 */
export async function supportsGpsHardeningColumns(supabase) {
  if (hasGpsHardeningColumns !== null) return hasGpsHardeningColumns;

  const { error } = await supabase
    .from('inquiries')
    .select('driver_fix_at, driver_token_expires_at')
    .limit(1);

  hasGpsHardeningColumns = !isUndefinedColumnError(error);

  if (!hasGpsHardeningColumns) {
    console.warn(
      '[ahv] driver_fix_at / driver_token_expires_at are missing. Run ' +
      'supabase/migrations/20260730_driver_gps_hardening.sql — until then, GPS ' +
      'freshness falls back to driver_updated_at and tracking links do not expire.',
    );
  }

  return hasGpsHardeningColumns;
}

/** Test-only / hot-reload escape hatch. */
export function resetSchemaCapabilityCache() {
  hasGpsHardeningColumns = null;
}
