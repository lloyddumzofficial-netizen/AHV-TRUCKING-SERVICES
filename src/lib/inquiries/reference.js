export function createInquiryReference() {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `AHV-${stamp}-${suffix}`;
}
