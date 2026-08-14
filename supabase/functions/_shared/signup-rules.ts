// signup-rules.ts — the slug and password rules, SERVER SIDE.
//
// WHY THIS DUPLICATES lib/
// ------------------------
// lib/reserved-slugs.js and lib/password-policy.js are browser JavaScript in
// the Next app; this is Deno on Supabase. Two runtimes, no shared module path —
// the same constraint that makes billing-plans-sync take its plan list as a
// POST body rather than importing it.
//
// So these are mirrors, and the mirror that matters is THIS one: the browser
// copy exists to give the user instant feedback, this copy decides. If they
// ever disagree, the user is told "no" after pressing the button, which is
// annoying; the reverse — the server being laxer — would be a security bug.
// tests/signup-rules-parity.test.mjs compares the reserved lists as text and
// fails if they drift.

// Keep in step with lib/reserved-slugs.js. A tenant slug becomes /{slug}, and
// Next.js resolves static routes first, so a workspace claiming one of these is
// not an error — it is silently unreachable.
const RESERVED_SLUGS = new Set([
  "admin", "subscribe", "signup", "privacy", "terms", "api", "_next",
  "login", "signin", "sign-in", "signout", "sign-out", "register", "verify",
  "account", "billing", "checkout", "pricing", "plans", "invoice", "invoices",
  "dashboard", "settings", "support", "help", "docs", "blog", "about",
  // the coming admin split, reserved before either route exists
  "studio", "console", "me",
  "contact", "status", "health", "webhook", "webhooks", "callback",
  "designakum", "official", "www", "mail", "email", "root", "system",
  "security", "abuse", "postmaster", "no-reply", "noreply",
]);

const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Returns an error CODE, or "" when acceptable.
export function slugError(raw: unknown): string {
  const slug = String(raw ?? "").trim().toLowerCase();
  if (!slug) return "slug_required";
  if (slug.length < SLUG_MIN) return "slug_too_short";
  if (slug.length > SLUG_MAX) return "slug_too_long";
  if (!SLUG_SHAPE.test(slug)) return "slug_invalid_characters";
  if (RESERVED_SLUGS.has(slug)) return "slug_reserved";
  if (/^\d+$/.test(slug)) return "slug_reserved";
  return "";
}

export function normalizeSlug(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

// Keep in step with lib/password-policy.js. The BYTE cap is the load-bearing
// rule: bcrypt ignores input past byte 72, so a longer password is silently
// truncated and a different long password can unlock the same account. Arabic
// is the realistic way to hit it — two bytes per letter.
const PASSWORD_MIN = 8;
const PASSWORD_MAX_CHARS = 20;
const PASSWORD_MAX_BYTES = 72;

export function passwordError(password: unknown): string {
  const value = String(password ?? "");
  if (value.length < PASSWORD_MIN) return "password_too_short";
  if (value.length > PASSWORD_MAX_CHARS) return "password_too_long";
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return "password_too_long";
  return "";
}

// A deliberately permissive shape check. Real deliverability is proven by the
// verification email arriving, not by a regex — an address that passes this and
// does not exist simply never gets confirmed, which is the correct outcome and
// costs nothing.
export function emailError(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return "email_invalid";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return "email_invalid";
  return "";
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

// Workspace display name. Bilingual by nature, so this only bounds length and
// refuses something that is entirely whitespace.
export function workspaceNameError(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) return "workspace_name_required";
  if (name.length > 60) return "workspace_name_too_long";
  return "";
}
