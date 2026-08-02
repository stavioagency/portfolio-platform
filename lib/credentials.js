// Credential handoff — how a new workspace's details get to the client.
//
// WHY THIS EXISTS: creating a workspace produces a password that is shown once
// and never stored. The delivery step used to be a single "Copy details" button
// next to an automatic email, so a mistyped address meant the credentials went
// to a stranger and the owner had nothing left to hand over. These builders give
// the same facts several shapes — plain text, a WhatsApp message, an email body —
// so email is one route among several rather than the only one.
//
// Pure string formatting, no DOM and no network, so the wording is testable and
// the two callers (a new invite and a password reset) cannot drift apart.

// A tenant's public address. Returns null when either part is missing rather
// than emitting a half-formed URL the admin might paste to a client.
export function portfolioUrl(origin, slug) {
  const o = String(origin || '').replace(/\/+$/, '');
  const s = String(slug || '').replace(/^\/+/, '');
  if (!o || !s) return null;
  return `${o}/${s}`;
}

// The fields shared by every format below, normalised once.
function fields(c) {
  return {
    workspace: (c?.workspace || '').trim(),
    username: (c?.username || '').trim(),
    password: (c?.password || '').trim(),
    email: (c?.email || '').trim(),
    url: (c?.url || '').trim(),
    signInUrl: (c?.signInUrl || '').trim(),
  };
}

// Only include lines that actually have a value — a "Portfolio: " with nothing
// after it reads as a broken message, and the URL is genuinely optional.
function joinLines(pairs) {
  return pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}

// Plain block for "Copy all" — pasteable anywhere, no markup.
export function credentialsText(creds, lang = 'en') {
  const f = fields(creds);
  const ar = lang === 'ar';
  return joinLines([
    [ar ? 'المساحة' : 'Workspace', f.workspace],
    [ar ? 'الموقع' : 'Portfolio', f.url],
    [ar ? 'رابط الدخول' : 'Sign in', f.signInUrl],
    [ar ? 'اسم المستخدم' : 'Username', f.username],
    [ar ? 'كلمة المرور' : 'Password', f.password],
    [ar ? 'البريد' : 'Email', f.email],
  ]);
}

// A message the admin can paste straight into a chat. Deliberately warmer than
// credentialsText and it explains the password change, because the client reads
// this one — it is not an internal record.
export function whatsappMessage(creds, lang = 'en') {
  const f = fields(creds);
  const ar = lang === 'ar';
  const head = ar
    ? `مرحبًا! موقعك الشخصي${f.workspace ? ` «${f.workspace}»` : ''} جاهز 🎉`
    : `Hi! Your portfolio${f.workspace ? ` "${f.workspace}"` : ''} is ready 🎉`;
  const body = joinLines([
    [ar ? 'الموقع' : 'Portfolio', f.url],
    [ar ? 'لوحة التحكم' : 'Dashboard', f.signInUrl],
    [ar ? 'اسم المستخدم' : 'Username', f.username],
    [ar ? 'كلمة المرور المؤقتة' : 'Temporary password', f.password],
  ]);
  const tail = ar
    ? 'سيُطلب منك تغيير كلمة المرور عند أول تسجيل دخول.'
    : "You'll be asked to change the password the first time you sign in.";
  return [head, '', body, '', tail].join('\n');
}

// Subject + body for the owner's own mail client. Same content as the WhatsApp
// message; only the framing differs.
export function emailSubject(creds, lang = 'en') {
  const f = fields(creds);
  const ar = lang === 'ar';
  if (ar) return f.workspace ? `تفاصيل الدخول — ${f.workspace}` : 'تفاصيل الدخول لموقعك';
  return f.workspace ? `Your portfolio login — ${f.workspace}` : 'Your portfolio login';
}

// A mailto: URL. Every part is encodeURIComponent'd — an unescaped newline or
// ampersand in a workspace name would silently truncate the body.
export function mailtoLink(creds, lang = 'en') {
  const f = fields(creds);
  const params = [
    `subject=${encodeURIComponent(emailSubject(creds, lang))}`,
    `body=${encodeURIComponent(whatsappMessage(creds, lang))}`,
  ].join('&');
  return `mailto:${encodeURIComponent(f.email)}?${params}`;
}

// Filename for the downloaded copy. Slug-ish so it is safe on every filesystem.
// The extension is a parameter because the sheet ships as a PDF while the
// clipboard/plain-text paths still describe themselves as .txt.
export function credentialsFilename(creds, ext = 'txt') {
  const base = String(creds?.workspace || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-credentials.${ext}`;
}

// Display name for a tenant row. `tenants.name` is a plain text column (NOT the
// {ar,en} jsonb the profile content uses), so there is nothing to pick between —
// it is the name, or the slug when a workspace was created without one.
export function workspaceLabel(tenant) {
  if (!tenant) return '';
  return (tenant.name || tenant.slug || '').trim();
}
