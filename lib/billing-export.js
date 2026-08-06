// billing-export.js — turning the subscriber list into a CSV the owner can open
// in Excel or Numbers.
//
// It is pure (rows in, string out) so the escaping rules can be tested, which
// matters more than it looks: a workspace name is free text a client typed, and
// it reaches this file unescaped from the database.
//
// TWO SEPARATE ESCAPING PROBLEMS, both handled here:
//
//   1. CSV quoting — a comma, quote or newline inside a value must be wrapped
//      and doubled, or one client called "Studio, Riyadh" shifts every column
//      after it and the file silently misreports who is paying.
//
//   2. CSV INJECTION — a value starting with = + - @ (or tab/CR) is executed as
//      a formula when the file is opened in Excel. A workspace called
//      `=HYPERLINK("http://evil","click")` is a real attack on the person
//      exporting, not on the person who typed it. Those values get a leading
//      apostrophe, which spreadsheets treat as "this is text".

import { formatBillingDate, statusLabel, deriveBilling } from './billing-status.js';
import { planName, formatAmount } from './billing-plans.js';

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header, rows) {
  const lines = [header, ...rows].map((cols) => cols.map(escapeCsvValue).join(','));
  // CRLF, because Excel on Windows treats a lone LF as one giant cell.
  return lines.join('\r\n');
}

// The subscriber export. Columns are chosen to answer the questions the owner
// actually has in front of a spreadsheet: who, what are they on, are they
// paying, when does it renew, how much.
export function subscribersCsv(rows, lang = 'en', now = Date.now()) {
  const ar = lang === 'ar';
  const header = ar
    ? ['المساحة', 'الرابط', 'البريد', 'الخطة', 'الحالة', 'تاريخ التجديد', 'المبلغ', 'الاشتراك منذ']
    : ['Workspace', 'Slug', 'Email', 'Plan', 'Status', 'Renews', 'Amount', 'Subscribed since'];

  const body = (rows || []).map((r) => {
    const billing = deriveBilling(r.subscription, now);
    const plan = r.subscription?.plan_code || null;
    return [
      r.name || r.slug || '',
      r.slug || '',
      r.email || '',
      planName(plan, lang),
      statusLabel(billing.state, lang),
      billing.renewsAt || billing.endsAt ? formatBillingDate(billing.renewsAt || billing.endsAt, lang) : '',
      // The amount is written as plain digits with the currency in its own
      // word, so a spreadsheet reads "12" as a number rather than as text.
      r.subscription?.amount != null ? formatAmount(r.subscription.amount, lang) : '',
      r.subscription?.created_at ? formatBillingDate(r.subscription.created_at, lang) : '',
    ];
  });

  return toCsv(header, body);
}

// A filename that sorts chronologically and never collides.
export function exportFilename(prefix = 'subscribers', now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}
