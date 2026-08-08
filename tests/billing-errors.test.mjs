// Tests for lib/billing-errors.js — extracting the real error out of a
// Supabase Edge Function call. Zero dependencies — run with: npm test
//
// The case that matters is the one that actually bit: supabase-js sets `data`
// to null on any non-2xx and hands back a generic message, so the server's own
// error code is reachable ONLY through error.context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeErrorCode, billingActionError } from '../lib/billing-errors.js';

// What supabase-js actually hands back for a non-2xx: data null, a generic
// message, and the real body hidden on `context`.
function httpError(status, body) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, json: async () => body },
  };
}

test('a successful call reports no error', async () => {
  assert.equal(await edgeErrorCode(null, { ok: true, grant: 'v1.x.y' }), null);
});

test('the server error code is read out of context, not the generic message', async () => {
  const err = httpError(400, { error: 'plan_not_available', plan_code: 'yearly' });
  assert.equal(await edgeErrorCode(err, null), 'plan_not_available');
});

test('a 200 response carrying an { error } body is still an error', async () => {
  assert.equal(await edgeErrorCode(null, { error: 'processing_failed' }), 'processing_failed');
});

test('a non-JSON body falls back to the generic message rather than throwing', async () => {
  // A platform-level 404 or 502 returns HTML. Reading it as JSON throws, and
  // that must not take the caller down with it.
  const err = {
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } },
  };
  assert.equal(await edgeErrorCode(err, null), 'Edge Function returned a non-2xx status code');
});

test('an error with no context at all still yields something', async () => {
  assert.equal(await edgeErrorCode({ message: 'Failed to fetch' }, null), 'Failed to fetch');
  assert.equal(await edgeErrorCode({}, null), 'unknown_error');
});

test('a body with only a message field is used', async () => {
  const err = httpError(401, { message: 'Missing authorization header' });
  assert.equal(await edgeErrorCode(err, null), 'Missing authorization header');
});

test('every known code maps to a sentence in both locales, and names the fix', async () => {
  const codes = [
    'plan_not_available', 'grant_signing_failed', 'invalid_redirect_url',
    'forbidden_not_owner', 'forbidden', 'not_a_paid_subscription',
    'no_subscription', 'already_subscribed', 'provider_unreachable', 'provider_error',
    'subscription_is_cancelled', 'invalid_comp_kind', 'not_a_comped_subscription',
  ];
  for (const code of codes) {
    for (const lang of ['ar', 'en']) {
      const msg = billingActionError(code, lang);
      assert.ok(msg && msg.length > 0, `${code}/${lang} has no message`);
      assert.ok(!msg.includes(code), `${code}/${lang} just echoes the raw code`);
    }
  }
});

test('the two operator-fixable faults name the exact thing to change', () => {
  assert.match(billingActionError('plan_not_available', 'en'), /Sync plans to PayPal/);
  assert.match(billingActionError('grant_signing_failed', 'en'), /BILLING_GRANT_SECRET/);
  assert.match(billingActionError('invalid_redirect_url', 'en'), /BILLING_RETURN_HOSTS/);
});

test('an unknown code is surfaced verbatim, never swallowed', () => {
  assert.match(billingActionError('some_new_thing', 'en'), /some_new_thing/);
  assert.match(billingActionError(undefined, 'en'), /unknown error/);
});

test("a provider rejection carries PayPal's own message through to the screen", async () => {
  // This is the case that cost a diagnosis round-trip: the body had the answer
  // ("shipping_preference") and every layer above it threw the answer away.
  const err = httpError(502, {
    error: 'provider_error',
    detail: 'paypal_400: Value is invalid., shipping_preference',
  });
  const code = await edgeErrorCode(err, null);
  assert.equal(code, 'provider_error: paypal_400: Value is invalid., shipping_preference');
  assert.match(billingActionError(code, 'en'), /shipping_preference/);
  assert.match(billingActionError(code, 'ar'), /shipping_preference/);
});
