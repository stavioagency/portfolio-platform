// Deleting a workspace must give its email back.
//
// THE BUG THESE PIN
// -----------------
// `tenants` cascades into nine tables; none of them is `auth.users`. Deleting a
// workspace therefore left an account holding an address that
// `users_email_partial_key` (UNIQUE on auth.users.email) would never reissue —
// abc123@gmail.com was gone for good, and six accounts including the owner's own
// were stuck that way when this was audited.
//
// The fix reuses `release_account`, which already existed for exactly this and
// was only ever reachable by hand afterwards. Nothing was deleted before and
// nothing is deleted now: the address is parked on an unroutable .invalid domain
// and the original is kept in `released_email`.
//
// Two halves, tested two ways. The decision (whose address may be freed) is a
// pure function and is executed here. The wiring in pages/admin.js and the
// server-side guard in the Edge Function are read as source — a React page and a
// Deno function, neither of which Node can import. Same approach as
// tests/admin-comp-kind-wiring.test.mjs and tests/billing-subscription-guards.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strandedByDeleting, releaseReport, releaseMessage } from '../lib/account-release.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(join(ROOT, 'pages/admin.js'), 'utf8');
const RECOVERY = readFileSync(join(ROOT, 'supabase/functions/client-recovery/index.ts'), 'utf8');

/** deleteWorkspace(), from its declaration to the start of the next one. */
function deleteWorkspaceSource() {
  const start = ADMIN.indexOf('async function deleteWorkspace()');
  assert.notEqual(start, -1, 'deleteWorkspace must exist');
  const end = ADMIN.indexOf('\n  return (', start);
  assert.notEqual(end, -1, 'could not find the end of deleteWorkspace');
  return ADMIN.slice(start, end);
}

/** The body of the `release_account` branch in the Edge Function. */
function releaseBranch() {
  const start = RECOVERY.indexOf('if (action === "release_account")');
  assert.notEqual(start, -1, 'the release_account branch must exist');
  const open = RECOVERY.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < RECOVERY.length; i++) {
    if (RECOVERY[i] === '{') depth++;
    else if (RECOVERY[i] === '}' && --depth === 0) return RECOVERY.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading the release_account branch');
}

const DOOMED = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEIGHBOUR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// --- 1. A DELETED ACCOUNT'S EMAIL CAN BE USED AGAIN ---------------------------

test('the sole member of a deleted workspace is released', () => {
  // The whole point: junk@gmail.com signs up, the owner deletes the workspace,
  // and junk@gmail.com can sign up again.
  const members = [{ tenant_id: DOOMED, user_id: CLIENT, email: 'junk@gmail.com' }];
  assert.deepEqual(strandedByDeleting(members, DOOMED), [CLIENT]);
});

test('release parks the address instead of deleting the account', () => {
  // Reuse must not cost the record that the person existed. The parked domain is
  // RFC 2606 .invalid, which can never route or collide with a real address, and
  // it carries the user id so two releases cannot collide with each other.
  const branch = releaseBranch();
  assert.ok(/@released\.invalid/.test(branch), 'the address must be parked on .invalid');
  assert.ok(/user_id\.replace\(\/-\/g, ""\)\.slice\(0, 12\)/.test(branch), 'and be unique per account');
  assert.ok(!/deleteUser/.test(branch), 'release must never delete the auth user');
});

test('the original email and username survive in metadata', () => {
  // released_email is what makes this reversible, and it is the only copy left
  // once auth.users has been overwritten.
  const branch = releaseBranch();
  assert.ok(/released_email: previous_email/.test(branch), 'the original address must be kept');
  assert.ok(/released_username: username \|\| null/.test(branch), 'and the original username');
  assert.ok(/released_at: new Date\(\)\.toISOString\(\)/.test(branch), 'with when it happened');
  // HANDOFF §9: a replace here drops must_set_password and silently removes the
  // password gate from an account that owes one.
  assert.ok(
    /user_metadata: \{\s*\.\.\.\(found\.user\.user_metadata \?\? \{\}\)/.test(branch),
    'user_metadata must be spread, never replaced',
  );
});

test('the username row is dropped, since that is what blocks name reuse', () => {
  const branch = releaseBranch();
  assert.ok(
    /from\("admin_usernames"\)\.delete\(\)\.eq\("user_id", user_id\)/.test(branch),
    'the admin_usernames mapping must be released too',
  );
});

test('auth uniqueness is left to the database — nothing here relaxes it', () => {
  // The reuse comes from vacating the address, NOT from weakening the unique
  // index. No migration, no schema touch, no second email column.
  const branch = releaseBranch();
  assert.ok(!/drop\s+index|alter\s+table|create\s+unique/i.test(branch), 'no schema changes');
  assert.ok(!/drop\s+index|alter\s+table/i.test(deleteWorkspaceSource()), 'and none from the admin either');
});

// --- 2. ACTIVE USERS CANNOT BE OVERWRITTEN ------------------------------------

test('a client who belongs to another workspace is never released', () => {
  // Parking their address would lock a paying client out of a site they are
  // using. They keep somewhere to sign in, so they keep their email.
  const members = [
    { tenant_id: DOOMED, user_id: CLIENT },
    { tenant_id: OTHER, user_id: CLIENT },
  ];
  assert.deepEqual(strandedByDeleting(members, DOOMED), []);
});

test('other workspaces\' clients are untouched by an unrelated delete', () => {
  const members = [
    { tenant_id: DOOMED, user_id: CLIENT },
    { tenant_id: OTHER, user_id: NEIGHBOUR },
  ];
  assert.deepEqual(strandedByDeleting(members, DOOMED), [CLIENT]);
});

test('a missing or empty tenant id releases nobody', () => {
  // A bad id must not be read as "matches nothing, so everyone is stranded".
  const members = [{ tenant_id: DOOMED, user_id: CLIENT }];
  assert.deepEqual(strandedByDeleting(members, ''), []);
  assert.deepEqual(strandedByDeleting(members, null), []);
  assert.deepEqual(strandedByDeleting(members, undefined), []);
  assert.deepEqual(strandedByDeleting(null, DOOMED), []);
});

test('the server refuses a release for an account that still has a workspace', () => {
  // The client-side filter above is the first half; this is the half that holds
  // when the list is stale, and it must come before anything is written.
  const branch = releaseBranch();
  assert.ok(/if \(membership\) return json\(\{ error: "still_has_workspace" \}, 409\)/.test(branch));
  assert.ok(
    branch.indexOf('still_has_workspace') < branch.indexOf('updateUserById'),
    'the refusal must precede the write',
  );
});

test('a platform owner can never be released', () => {
  // The guard sits above the action dispatch, so it covers release_account with
  // the other write actions. Co-owners are peers.
  const guard = RECOVERY.indexOf('cannot_modify_platform_owner');
  assert.notEqual(guard, -1, 'the platform-owner guard must exist');
  assert.ok(guard < RECOVERY.indexOf('if (action === "release_account")'), 'and must run first');
  // list_workspace_members never returns platform owners either, so an owner
  // account is not even offered up by the admin.
});

test('a refusal is reported as kept, not as a failure', () => {
  const report = releaseReport([
    { user_id: CLIENT, ok: false, code: 'still_has_workspace' },
    { user_id: NEIGHBOUR, ok: true },
  ]);
  assert.deepEqual(report.kept, [CLIENT]);
  assert.deepEqual(report.freed, [NEIGHBOUR]);
  assert.deepEqual(report.failed, []);
});

// --- 3. WORKSPACE DELETION LEAVES NO EMAIL LOCKED -----------------------------

test('deleteWorkspace reads the members BEFORE deleting the tenant', () => {
  // tenant_admins cascades with the tenant and list_workspace_members JOINs it.
  // Reading after the delete returns nothing, and nothing would ever be freed.
  const src = deleteWorkspaceSource();
  const read = src.indexOf("supabase.rpc('list_workspace_members')");
  const del = src.indexOf("from('tenants').delete()");
  assert.notEqual(read, -1, 'the members must be read');
  assert.notEqual(del, -1, 'the tenant must be deleted');
  assert.ok(read < del, 'the read must come first');
});

test('deleteWorkspace releases the stranded logins after the delete succeeds', () => {
  // And only after: release_account refuses an account whose membership still
  // exists, which it does until the tenant row is gone.
  const src = deleteWorkspaceSource();
  const del = src.indexOf("from('tenants').delete()");
  const release = src.indexOf('releaseAccounts(stranded)');
  assert.notEqual(release, -1, 'the release must be wired in');
  assert.ok(del < release, 'the release must follow the delete');
  assert.ok(/strandedByDeleting\(members \|\| \[\], doomed\.id\)/.test(src), 'and act on the pre-read list');
});

test('the release goes through the owner-gated recovery function', () => {
  // Not a direct auth write from the browser — the service key lives only in the
  // Edge Function, and its membership and platform-owner guards come with it.
  const helper = ADMIN.slice(
    ADMIN.indexOf('async function releaseAccounts('),
    ADMIN.indexOf('async function resolveUserId('),
  );
  assert.ok(/functions\.invoke\('client-recovery'/.test(helper), 'must call client-recovery');
  assert.ok(/action: 'release_account'/.test(helper), 'with the release action');
  assert.ok(!/auth\.admin/.test(helper), 'and never touch the admin auth API from the browser');
});

test('a failed release is surfaced, with the screen that fixes it', () => {
  // The workspace is gone either way; what the owner needs to know is whether
  // the address came back. Silence here recreates the original bug invisibly.
  const failed = releaseMessage({ freed: [], kept: [], failed: [CLIENT] }, false);
  assert.match(failed, /Unattached logins/);
  const failedAr = releaseMessage({ freed: [], kept: [], failed: [CLIENT] }, true);
  assert.match(failedAr, /حسابات بلا مساحة/);
});

test('a successful release says the address is reusable', () => {
  assert.match(releaseMessage({ freed: [CLIENT], kept: [], failed: [] }, false), /free to use again/);
  assert.match(releaseMessage({ freed: [CLIENT], kept: [], failed: [] }, true), /متاحًا من جديد/);
});

test('an empty workspace still reports a plain delete', () => {
  const quiet = releaseMessage({ freed: [], kept: [], failed: [] }, false);
  assert.equal(quiet, 'Workspace deleted');
  assert.equal(releaseMessage({ freed: [], kept: [CLIENT], failed: [] }, false), 'Workspace deleted');
});

test('a failed member read never blocks the delete', () => {
  // The delete is what the owner confirmed. Freeing the address is the follow-up,
  // and its failure leaves them exactly where they were before this change: one
  // click away in Unattached logins.
  const src = deleteWorkspaceSource();
  const guard = src.indexOf('could not read members before delete');
  assert.notEqual(guard, -1, 'the read must be wrapped in its own catch');
  assert.ok(guard < src.indexOf("from('tenants').delete()"), 'which is resolved before the delete runs');
  assert.ok(/let stranded = \[\];/.test(src), 'and it must fall back to releasing nobody');
});

test('the confirm dialog tells the truth about the login', () => {
  // It used to promise the login was left alone, full stop. It is still not
  // deleted — but its address no longer stays with it, and a destructive
  // confirmation that misdescribes what it does is worse than no text.
  const src = deleteWorkspaceSource();
  assert.ok(/its email is released for reuse/.test(src), 'the English copy must say so');
  assert.ok(/يُحرَّر بريده/.test(src), 'and the Arabic copy too');
  assert.ok(
    !/The client's LOGIN is not deleted — they may belong to other workspaces\./.test(src),
    'the old promise must be gone',
  );
});

// --- the signup flow is untouched ---------------------------------------------

test('nothing here changes how signup checks an address', () => {
  // Reuse works because auth.users no longer holds the address, so signup-start
  // sees a genuinely new email and its anti-enumeration branching is unaffected.
  const signupStart = readFileSync(join(ROOT, 'supabase/functions/signup-start/index.ts'), 'utf8');
  assert.ok(!/released/.test(signupStart), 'signup-start must know nothing about releases');
  assert.ok(!/released/.test(readFileSync(join(ROOT, 'pages/signup.js'), 'utf8')), 'nor the signup page');
});
