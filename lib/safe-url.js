// safeUrl — sanitises tenant-admin-entered links before they are rendered to the
// public. Portfolio links, CTA buttons, and project URLs are attacker-controllable
// in a multi-tenant SaaS, so only navigational schemes are allowed. Anything with
// a dangerous scheme (javascript:, data:, vbscript:, file:, blob:, ...) or that
// cannot be parsed returns '' so the caller can drop the href / skip opening it.
//
// Kept dependency-free and in lib/ so it can be unit-tested (see tests/safe-url.test.mjs).
const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeUrl(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return '';

  // Reject control characters — tab/newline let "java\nscript:" smuggle a scheme
  // past a naive check because browsers strip them before parsing the URL.
  if (CONTROL_CHARS.test(v)) return '';

  // No valid scheme present? It's a relative path or a bare host.
  //   - starts with / . or #    -> same-origin path/hash, safe as-is
  //   - a colon before any /?#  -> a malformed scheme attempt (e.g. "ht!tp:") -> reject
  //   - bare "example.com/x"     -> assume https
  //   - anything else            -> leave as-is (relative)
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) {
    if (/^(\/|\.|#)/.test(v)) return v;
    if (/^[^/?#]*:/.test(v)) return ''; // colon in the scheme position but not a valid scheme
    if (/^[^\s/?#]+\.[^\s/?#]+/.test(v)) return `https://${v}`;
    return v;
  }

  try {
    const scheme = new URL(v).protocol.toLowerCase();
    return ALLOWED_SCHEMES.includes(scheme) ? v : '';
  } catch {
    return '';
  }
}

export default safeUrl;
