// The custom password-reset flow, end to end, running the REAL Edge Function
// source — see tests/helpers/edge-runtime.mjs for how Node manages that and
// what is and is not simulated.
//
// This replaces supabase.auth.resetPasswordForEmail(), which HANDOFF §7 records
// as having effectively never delivered a message on this project. Everything
// that used to be Supabase's problem is now ours, so it is tested here:
//
//   * an unknown address is answered IDENTICALLY to a known one
//   * an expired token is refused
//   * a spent token cannot be spent twice
//   * asking again kills the previous link
//   * the password actually changes, and nothing else about the account does
//   * the email arrives in the right language
//   * no raw token and no password ever reaches a log
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdgeFunction, installEdgeRuntime, post, postRaw } from './helpers/edge-runtime.mjs';
import { RESET_TTL_MS, sha256Hex } from '../supabase/functions/_shared/reset-token.ts';

const REQUEST = 'request-password-reset';
const COMPLETE = 'complete-password-reset';

/** Set up a store, run `fn`, and always put the globals back. */
async function withRuntime(fn) {
  const rt = installEdgeRuntime();
  try { return await fn(rt); } finally { rt.restore(); }
}

const body = async (res) => await res.json();

/** The raw token out of the one link we just emailed. */
function tokenFromMail(mail) {
  const match = /\/reset-password\?token=([0-9a-f]{64})/.exec(mail.html);
  assert.ok(match, 'the email should contain a reset link with a 64-hex token');
  return match[1];
}

/** Request a reset for `user` and hand back the raw token from the mail. */
async function mintToken(rt, user) {
  const request = await loadEdgeFunction(REQUEST);
  const before = rt.sent.length;
  const res = await request(post({ email: user.email }));
  assert.equal(res.status, 200);
  assert.equal(rt.sent.length, before + 1, 'a reset mail should have been sent');
  return tokenFromMail(rt.sent[rt.sent.length - 1]);
}

// ===========================================================================
// Requesting a reset
// ===========================================================================

test('an existing account gets a reset mail, and a token row to match', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    const user = rt.store.addUser({ email: 'noura@example.com' });

    const res = await request(post({ email: 'noura@example.com' }));

    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), { ok: true });
    assert.equal(rt.sent.length, 1);
    assert.equal(rt.sent[0].to[0], 'noura@example.com');

    const rows = rt.store.rows('password_reset_tokens');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].used_at ?? null, null);
  });
});

// The P0 this file did not catch for two weeks. `listUsers` takes page and
// perPage and NOTHING else — an `email` property is silently dropped — so
// `listUsers({ page: 1, perPage: 1, email })` looked up the one newest account
// in the project and compared the requested address against that. Every other
// customer fell into the "no account" branch: ok:true, no mail, no token row.
//
// It passed because the fake honoured a filter the real SDK does not have.
// The fake now models the real thing, and this asserts the property that
// actually matters: an account that is not the first one findable must still
// get its reset mail.
test('a reset works for an account that is not the newest in the project', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    // Enough accounts that a single-page lookup cannot cover them by accident,
    // with the real customer buried in the middle rather than at either end.
    for (let i = 0; i < 60; i++) rt.store.addUser({ email: `filler${i}@example.com` });
    const user = rt.store.addUser({ email: 'buried@example.com' });
    for (let i = 60; i < 120; i++) rt.store.addUser({ email: `filler${i}@example.com` });

    const res = await request(post({ email: 'buried@example.com' }));

    assert.equal(res.status, 200);
    assert.equal(rt.sent.length, 1, 'the buried account must still receive a reset mail');
    assert.equal(rt.sent[0].to[0], 'buried@example.com');

    const rows = rt.store.rows('password_reset_tokens');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
  });
});

test('the row holds the HASH — the raw token is nowhere in the database', async () => {
  await withRuntime(async (rt) => {
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    const row = rt.store.rows('password_reset_tokens')[0];
    assert.notEqual(row.token_hash, raw);
    assert.equal(row.token_hash, await sha256Hex(raw));
    // The whole table, as a string. A dump of it must be worthless.
    assert.ok(!JSON.stringify(rt.store.rows('password_reset_tokens')).includes(raw),
      'the raw token must not appear anywhere in the stored row');
  });
});

test('the token expires 30 minutes out, which is what the email says', async () => {
  await withRuntime(async (rt) => {
    const user = rt.store.addUser({ email: 'noura@example.com' });
    await mintToken(rt, user);

    const row = rt.store.rows('password_reset_tokens')[0];
    const life = Date.parse(row.expires_at) - Date.parse(row.created_at);
    // A second of slack for the two timestamps being taken separately.
    assert.ok(Math.abs(life - RESET_TTL_MS) < 1000, `token life was ${life}ms`);
    // And the copy says the same number the row enforces — both read
    // RESET_TTL_MS, and a link that outlives its promise (or dies before it) is
    // a support ticket. Latin numerals in both locales, per the product rule.
    assert.match(rt.sent[0].html, new RegExp(`\\b${RESET_TTL_MS / 60_000}\\b`));
  });
});

// ===========================================================================
// No user enumeration — the reason this endpoint has exactly one response
// ===========================================================================

test('an unknown address is answered exactly like a known one', async () => {
  const known = await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'real@example.com' });
    const res = await request(post({ email: 'real@example.com' }));
    return { status: res.status, json: await body(res) };
  });

  const unknown = await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    const res = await request(post({ email: 'nobody@example.com' }));
    // And nothing happened behind it.
    assert.equal(rt.sent.length, 0, 'no mail for an address with no account');
    assert.equal(rt.store.rows('password_reset_tokens').length, 0, 'and no token row');
    return { status: res.status, json: await body(res) };
  });

  assert.deepEqual(unknown, known);
});

test('a malformed address, a missing one, and broken JSON all answer the same', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    for (const req of [
      post({ email: 'not-an-address' }),
      post({ email: '' }),
      post({}),
      post({ email: { $ne: null } }),
      postRaw('{ this is not json'),
    ]) {
      const res = await request(req);
      assert.equal(res.status, 200);
      assert.deepEqual(await body(res), { ok: true });
    }
    assert.equal(rt.sent.length, 0);
  });
});

test('a Resend outage is still answered with success', async () => {
  // Reporting the failure would say "this address exists" — the one fact the
  // endpoint withholds. The token is still minted, so a retry works.
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com' });

    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('service unavailable', { status: 503 });
    const res = await request(post({ email: 'noura@example.com' }));
    globalThis.fetch = realFetch;

    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), { ok: true });
  });
});

test('a database failure is still answered with success', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com' });
    rt.store.failNext('password_reset_tokens', 'insert', 'relation does not exist');

    const res = await request(post({ email: 'noura@example.com' }));
    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), { ok: true });
    assert.equal(rt.sent.length, 0, 'and no link is mailed for a token that was never stored');
  });
});

// ===========================================================================
// Rate limiting and invalidating the previous link
// ===========================================================================

test('asking again kills the previous link', async () => {
  await withRuntime(async (rt) => {
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const complete = await loadEdgeFunction(COMPLETE);

    const first = await mintToken(rt, user);
    const second = await mintToken(rt, user);
    assert.notEqual(first, second);

    // The old link — still well inside its 30 minutes — is dead.
    const stale = await complete(post({ token: first, password: 'BrandNew123' }));
    assert.equal(stale.status, 400);
    assert.equal((await body(stale)).error, 'invalid_or_expired_token');

    // The newest one works.
    const ok = await complete(post({ token: second, password: 'BrandNew123' }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await body(ok), { ok: true });
  });
});

test('a fourth request in the window sends nothing', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com' });

    for (let i = 0; i < 3; i++) {
      await request(post({ email: 'noura@example.com' }));
    }
    assert.equal(rt.sent.length, 3);

    const res = await request(post({ email: 'noura@example.com' }));
    assert.equal(res.status, 200, 'and being limited is not observable');
    assert.deepEqual(await body(res), { ok: true });
    assert.equal(rt.sent.length, 3, 'the fourth request sends no mail');
    assert.equal(rt.store.rows('password_reset_tokens').length, 3, 'and mints no token');
  });
});

test('an old request outside the window does not count against the limit', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    const user = rt.store.addUser({ email: 'noura@example.com' });

    // Three from an hour ago. Someone who tried this morning must not be locked
    // out this afternoon.
    const anHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    for (let i = 0; i < 3; i++) {
      rt.store.rows('password_reset_tokens').push({
        id: rt.store.uuid(), user_id: user.id, token_hash: `old-${i}`,
        created_at: anHourAgo, expires_at: anHourAgo, used_at: anHourAgo,
      });
    }

    await request(post({ email: 'noura@example.com' }));
    assert.equal(rt.sent.length, 1);
  });
});

test("one account's requests do not limit another's", async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com' });
    rt.store.addUser({ email: 'omar@example.com' });

    for (let i = 0; i < 4; i++) await request(post({ email: 'noura@example.com' }));
    await request(post({ email: 'omar@example.com' }));

    assert.equal(rt.sent.filter((m) => m.to[0] === 'omar@example.com').length, 1);
  });
});

// ===========================================================================
// Spending the token
// ===========================================================================

test('the password actually changes', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com', password: 'the-old-one' });
    const raw = await mintToken(rt, user);

    const res = await complete(post({ token: raw, password: 'BrandNew123' }));

    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), { ok: true });
    assert.equal(user.password, 'BrandNew123');
  });
});

test('the temp-password gate comes down, and nothing else in the metadata is lost', async () => {
  // HANDOFF §9: user_metadata is REPLACED by GoTrue, not merged. A reset that
  // forgets to read the existing object first silently drops admin_lang — and
  // the next email to this person goes out in the wrong language.
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({
      email: 'noura@example.com',
      user_metadata: { must_set_password: true, admin_lang: 'en', pending_slug: 'noura' },
    });
    const raw = await mintToken(rt, user);

    await complete(post({ token: raw, password: 'BrandNew123' }));

    assert.equal(user.user_metadata.must_set_password, false);
    assert.equal(user.user_metadata.admin_lang, 'en', 'admin_lang must survive the reset');
    assert.equal(user.user_metadata.pending_slug, 'noura');
  });
});

test('a used token is rejected the second time', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    const first = await complete(post({ token: raw, password: 'BrandNew123' }));
    assert.equal(first.status, 200);

    // The case that actually happens: the link is still in their inbox, and
    // they press it again a minute later.
    const second = await complete(post({ token: raw, password: 'Different456' }));
    assert.equal(second.status, 400);
    assert.equal((await body(second)).error, 'invalid_or_expired_token');
    assert.equal(user.password, 'BrandNew123', 'the second attempt must not have taken effect');
  });
});

test('two simultaneous submissions of the same link: exactly one wins', async () => {
  // The claim is a single conditional UPDATE precisely so this cannot end with
  // both requests setting a password.
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    const results = await Promise.all([
      complete(post({ token: raw, password: 'FirstOne123' })),
      complete(post({ token: raw, password: 'SecondOne1' })),
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 400]);
    assert.equal(rt.store.rows('password_reset_tokens')[0].used_at != null, true);
  });
});

test('an expired token is rejected', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com', password: 'the-old-one' });
    const raw = await mintToken(rt, user);

    // Push it into the past — the same state a link opened 31 minutes later is in.
    rt.store.rows('password_reset_tokens')[0].expires_at =
      new Date(Date.now() - 60_000).toISOString();

    const res = await complete(post({ token: raw, password: 'BrandNew123' }));
    assert.equal(res.status, 400);
    assert.equal((await body(res)).error, 'invalid_or_expired_token');
    assert.equal(user.password, 'the-old-one');
  });
});

test('a token that was never issued is rejected, and says nothing more', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    rt.store.addUser({ email: 'noura@example.com' });

    const res = await complete(post({ token: 'f'.repeat(64), password: 'BrandNew123' }));
    assert.equal(res.status, 400);
    // Identical to expired and to used. Three states, one answer — otherwise
    // this is a way to test whether a token is real.
    assert.deepEqual(await body(res), { error: 'invalid_or_expired_token' });
  });
});

test('junk in the token field never reaches the database', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    for (const token of ['', 'undefined', 'null', 'x'.repeat(64), 'f'.repeat(63),
      'f'.repeat(65), '../../etc/passwd', { $gt: '' }, null]) {
      const res = await complete(post({ token, password: 'BrandNew123' }));
      assert.equal(res.status, 400, `token=${JSON.stringify(token)}`);
      assert.equal((await body(res)).error, 'invalid_or_expired_token');
    }
  });
});

test('a password that breaks policy is refused BEFORE the token is spent', async () => {
  // Otherwise a typo burns the link and strands someone who did nothing wrong.
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    const short = await complete(post({ token: raw, password: 'abc' }));
    assert.equal(short.status, 400);
    assert.equal((await body(short)).error, 'password_too_short');
    assert.equal(rt.store.rows('password_reset_tokens')[0].used_at ?? null, null,
      'the token must still be spendable after a rejected password');

    // And it still works on the second, valid attempt.
    const ok = await complete(post({ token: raw, password: 'BrandNew123' }));
    assert.equal(ok.status, 200);
  });
});

test('the bcrypt byte cap is enforced here too', async () => {
  // 20 emoji is 20 characters and 80 bytes. Past byte 72 bcrypt ignores the
  // rest, so a longer password is silently truncated and a DIFFERENT long
  // string unlocks the same account.
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    const res = await complete(post({ token: raw, password: '😀'.repeat(20) }));
    assert.equal((await body(res)).error, 'password_too_long');
  });
});

// ===========================================================================
// Language
// ===========================================================================

test('an explicit admin_lang choice wins over everything', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    const user = rt.store.addUser({
      email: 'noura@example.com',
      user_metadata: { admin_lang: 'en', lang: 'ar' },
    });
    rt.store.rows('tenant_admins').push({ user_id: user.id, tenant_id: 't1' });
    rt.store.rows('tenants').push({ id: 't1', default_lang: 'ar' });

    await request(post({ email: 'noura@example.com', lang: 'ar' }));

    assert.match(rt.sent[0].subject, /Reset your Designakum password/);
    assert.match(rt.sent[0].html, /dir="ltr"/);
  });
});

test('the signup language is used when they have never pressed the toggle', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com', user_metadata: { lang: 'en' } });

    await request(post({ email: 'noura@example.com' }));
    assert.match(rt.sent[0].html, /lang="en"/);
  });
});

test("the workspace default carries an invited client who never chose", async () => {
  // The 44-of-50 case: clients invited before `lang` was seeded at creation
  // have no preference of their own at all.
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    const user = rt.store.addUser({ email: 'noura@example.com', user_metadata: {} });
    rt.store.rows('tenant_admins').push({ user_id: user.id, tenant_id: 't1' });
    rt.store.rows('tenants').push({ id: 't1', default_lang: 'en' });

    await request(post({ email: 'noura@example.com' }));
    assert.match(rt.sent[0].html, /lang="en"/);
  });
});

test('Arabic when nothing knows — the product is Arabic-first', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com', user_metadata: {} });

    await request(post({ email: 'noura@example.com' }));
    assert.match(rt.sent[0].html, /dir="rtl"/);
    assert.match(rt.sent[0].html, /lang="ar"/);
    assert.match(rt.sent[0].subject, /[؀-ۿ]/, 'the subject is what shows in the inbox');
    assert.doesNotMatch(rt.sent[0].html, /Reset your password/);
  });
});

test('junk in the metadata never becomes a language', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({
      email: 'noura@example.com',
      user_metadata: { admin_lang: 'EN', lang: 'english' },
    });

    await request(post({ email: 'noura@example.com' }));
    assert.match(rt.sent[0].html, /lang="ar"/);
  });
});

test('the browser language is the last resort, below the account', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'known@example.com', user_metadata: { lang: 'ar' } });
    rt.store.addUser({ email: 'blank@example.com', user_metadata: {} });

    // The account has an opinion — the browser's is ignored.
    await request(post({ email: 'known@example.com', lang: 'en' }));
    assert.match(rt.sent[0].html, /lang="ar"/);

    // The account has none — the screen they pressed the button on decides,
    // instead of defaulting an English reader into Arabic.
    await request(post({ email: 'blank@example.com', lang: 'en' }));
    assert.match(rt.sent[1].html, /lang="en"/);
  });
});

test('the link in the mail carries the language, for a phone that has never seen the site', async () => {
  await withRuntime(async (rt) => {
    const request = await loadEdgeFunction(REQUEST);
    rt.store.addUser({ email: 'noura@example.com', user_metadata: { lang: 'en' } });

    await request(post({ email: 'noura@example.com' }));
    // `&amp;` because this is the href inside HTML, which is where it belongs.
    assert.match(
      rt.sent[0].html,
      /https:\/\/designakum\.site\/reset-password\?token=[0-9a-f]{64}&amp;lang=en/,
    );
  });
});

// ===========================================================================
// What must never be written down
// ===========================================================================

test('no raw token and no password is ever logged', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);
    await complete(post({ token: raw, password: 'SuperSecret1' }));

    // Both endpoints, every branch they took, including the success lines.
    const all = rt.logs.join('\n');
    assert.ok(!all.includes(raw), 'a log line contains the raw token');
    assert.ok(!all.includes('SuperSecret1'), 'a log line contains the password');
    assert.ok(rt.logs.length > 0, 'and this test would pass vacuously with no logs at all');
  });
});

test('the failure paths do not start logging them either', async () => {
  await withRuntime(async (rt) => {
    const complete = await loadEdgeFunction(COMPLETE);
    const user = rt.store.addUser({ email: 'noura@example.com' });
    const raw = await mintToken(rt, user);

    rt.store.failNext('auth', 'updateUserById', 'gotrue is down');
    const res = await complete(post({ token: raw, password: 'SuperSecret1' }));
    assert.equal(res.status, 500);
    assert.equal((await body(res)).error, 'reset_failed');

    const all = rt.logs.join('\n');
    assert.ok(!all.includes(raw));
    assert.ok(!all.includes('SuperSecret1'));
    // And the token stays spent — see the note in the function on why it is not
    // put back. This asserts the documented trade rather than assuming it.
    assert.notEqual(rt.store.rows('password_reset_tokens')[0].used_at ?? null, null);
  });
});

// ===========================================================================
// The one thing the browser must not do
// ===========================================================================

test('/reset-password spends nothing on load', () => {
  // HANDOFF §9: mail scanners pre-fetch links. Single-use is only safe here
  // because a GET renders a form and calls no function — if this page ever
  // gains a validate-on-mount call, every scanned link dies before its owner
  // opens it, and the failure looks exactly like the Supabase bug we left.
  const src = readFileSync(new URL('../pages/reset-password.js', import.meta.url), 'utf8');
  const mountEffect = src.slice(src.indexOf('useEffect(() => {'), src.indexOf('}, []);'));
  assert.ok(!mountEffect.includes('functions.invoke'),
    'nothing may be invoked from the mount effect');

  // The single invoke() in the file, wherever it is, must sit inside the submit
  // handler. Matched on the call rather than on the function name, which also
  // appears in this file's header comment.
  const calls = [...src.matchAll(/functions\.invoke\(/g)].map((m) => m.index);
  assert.equal(calls.length, 1, 'exactly one Edge Function call on this page');
  assert.ok(calls[0] > src.indexOf('async function handleSubmit'),
    'the only call must live in the submit handler');
});

test('the old Supabase mailer is gone from the sign-in screen', () => {
  const admin = readFileSync(new URL('../pages/admin.js', import.meta.url), 'utf8');
  // Comments stripped first: the name survives in the note that explains why
  // the CALL does not, and this test is about the call.
  const code = admin.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!code.includes('resetPasswordForEmail'),
    'resetPasswordForEmail must not be called — it sends through the mailer that never delivers');
  assert.match(code, /invoke\('request-password-reset'/);
});
