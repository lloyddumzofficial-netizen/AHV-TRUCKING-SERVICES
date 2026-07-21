export function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  return Boolean(email && getAdminEmails().includes(String(email).trim().toLowerCase()));
}

export function getRoleForEmail(email, existingRole = 'user') {
  if (existingRole === 'admin' || isAdminEmail(email)) {
    return 'admin';
  }

  return 'user';
}

export function getAdminDirectory() {
  return getAdminEmails().map((email) => ({
    email,
    label: email.split('@')[0],
  }));
}
