export async function logAdminAction(supabase, {
  adminUser,
  inquiryReference,
  action,
  before = null,
  after = null,
  notes = '',
}) {
  if (!supabase || !adminUser?.id || !action) {
    return;
  }

  const { error } = await supabase.from('admin_audit_logs').insert({
    id: crypto.randomUUID(),
    admin_user_id: adminUser.id,
    admin_email: adminUser.email || '',
    inquiry_reference: inquiryReference || null,
    action,
    before_data: before,
    after_data: after,
    notes: notes || '',
  });

  if (error) {
    console.warn('[admin] audit log skipped:', error.message);
  }
}
