// Where a freshly-issued credential set lives between being created and being
// handed over.
//
// THE BUG THIS FIXES: the credentials used to be React state inside
// TenantAdminSection, which is mounted inside the "Add client" panel. Closing
// that panel unmounted the component and the temporary password was gone — not
// hidden, GONE, because it is never stored anywhere else. GoTrue keeps only a
// hash, so the owner's only remaining move was to reset the password or delete
// the workspace and start over. One stray click cost an onboarding.
//
// DELIBERATELY IN MEMORY ONLY. This is a plaintext password; putting it in
// localStorage or sessionStorage writes it to disk, leaves it readable by any
// script on the origin, and outlives the tab. A module-level Map survives what
// actually needed surviving — closing the modal, switching tabs, moving around
// the dashboard — and dies with the page, which is the correct lifetime for a
// secret that the product otherwise refuses to store.
//
// A page reload therefore still loses it, and that is by design: recovery is
// "Send welcome email" or "Reset password", both of which issue a fresh
// password. The workspace is never unrecoverable, which is the actual goal.

const store = new Map();

// Normalised so a uuid and a number key the same entry.
function key(tenantId) {
  return tenantId == null ? '' : String(tenantId);
}

// Keep the credentials for a workspace. Overwrites any previous set, because a
// reset makes the old password dead — holding onto it would let the admin hand
// over one that no longer works.
export function rememberCredentials(tenantId, creds) {
  const k = key(tenantId);
  if (!k || !creds) return null;
  const entry = { ...creds, tenantId: k, issuedAt: creds.issuedAt || Date.now() };
  store.set(k, entry);
  return entry;
}

export function recallCredentials(tenantId) {
  return store.get(key(tenantId)) || null;
}

export function hasCredentials(tenantId) {
  return store.has(key(tenantId));
}

// Called when the workspace is marked handed over, and on sign-out. Nothing
// should be able to read a password back after the admin says it is delivered.
export function forgetCredentials(tenantId) {
  return store.delete(key(tenantId));
}

// Sign-out and tenant-switch safety: never leave one operator's issued
// passwords readable in another's session.
export function clearAllCredentials() {
  store.clear();
}

// Which workspaces currently have credentials the admin could still hand over.
// Used to show "credentials ready" on a pending row versus "issue new ones".
export function workspacesWithCredentials() {
  return [...store.keys()];
}
