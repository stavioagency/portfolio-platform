// The supabase-js stand-in the Edge Functions get when they run under
// `node --test`. Substituted for the real `jsr:@supabase/supabase-js@2` by
// tests/helpers/edge-loader.mjs.
//
// It is a small in-memory Postgres-shaped store, not a mock with canned
// answers. That distinction is the point: a mock asserts that the function
// CALLED something, which is worth very little for a flow whose whole guarantee
// is what the database does under a conditional UPDATE. This one actually
// applies the filters, actually mutates the rows, and actually returns nothing
// when the WHERE clause matches nothing — so "an expired token is rejected" is
// tested by expiring a token and watching the real code path refuse it.
//
// It implements exactly the surface the reset functions use and no more. An
// unsupported call throws by name rather than returning undefined, so a future
// query that this cannot model fails loudly instead of silently passing.

export function createClient() {
  const db = globalThis.__EDGE_DB__;
  if (!db) throw new Error('fake-supabase: no store installed — call installEdgeRuntime() first');
  return db.client;
}

/**
 * Filters compare the way Postgres does for the columns in play here.
 * Every timestamp in this flow is an ISO-8601 UTC string, and those sort
 * lexicographically in the same order they sort chronologically — which is what
 * makes a string comparison the correct model of `expires_at > now()` rather
 * than a convenient approximation.
 */
class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.filters = [];
    this.op = null;
    this.payload = null;
    this.single = false;
    this.limitN = null;
    this.count = null;
    this.head = false;
  }

  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  is(col, val) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  gt(col, val) { this.filters.push((r) => String(r[col] ?? '') > String(val)); return this; }
  gte(col, val) { this.filters.push((r) => String(r[col] ?? '') >= String(val)); return this; }
  limit(n) { this.limitN = n; return this; }

  // `.select()` after `.update()` is PostgREST's "return the affected rows",
  // not a second operation — so it must not clobber the op already set.
  select(_cols, opts = {}) {
    if (!this.op) this.op = 'select';
    if (opts.count) this.count = opts.count;
    if (opts.head) this.head = true;
    return this;
  }

  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }

  maybeSingle() { this.single = true; return this.run(); }

  // Thenable, because supabase-js queries are awaited directly as often as they
  // are terminated with maybeSingle().
  then(onOk, onErr) { return this.run().then(onOk, onErr); }

  async run() {
    const failure = this.store.takeFailure(this.table, this.op);
    if (failure) return { data: null, error: { message: failure }, count: null };

    const rows = this.store.rows(this.table);

    if (this.op === 'insert') {
      const row = { id: this.store.uuid(), created_at: new Date().toISOString(), ...this.payload };
      rows.push(row);
      return { data: this.single ? row : [row], error: null, count: null };
    }

    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.limitN != null) matched = matched.slice(0, this.limitN);

    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.payload);
    }

    if (this.head) return { data: null, error: null, count: matched.length };
    if (this.single) {
      // maybeSingle() errors on more than one row, exactly as PostgREST does.
      if (matched.length > 1) {
        return { data: null, error: { message: 'multiple rows returned' }, count: null };
      }
      return { data: matched[0] ?? null, error: null, count: null };
    }
    return { data: matched, error: null, count: this.count ? matched.length : null };
  }
}

export class EdgeStore {
  constructor() {
    this.tables = { password_reset_tokens: [], tenant_admins: [], tenants: [] };
    this.users = [];
    this.failures = [];
    this.seq = 0;
    const store = this;

    this.client = {
      from(table) {
        if (!(table in store.tables)) throw new Error(`fake-supabase: unmodelled table ${table}`);
        return new Query(store, table);
      },
      auth: {
        admin: {
          // GoTrue applies the `email` filter server-side; the function still
          // re-checks the address it gets back, and this reproduces both halves.
          async listUsers({ email } = {}) {
            const fail = store.takeFailure('auth', 'listUsers');
            if (fail) return { data: null, error: { message: fail } };
            const users = email
              ? store.users.filter((u) => (u.email ?? '').toLowerCase() === String(email).toLowerCase())
              : store.users.slice();
            return { data: { users }, error: null };
          },
          async getUserById(id) {
            const fail = store.takeFailure('auth', 'getUserById');
            if (fail) return { data: null, error: { message: fail } };
            const user = store.users.find((u) => u.id === id);
            return user
              ? { data: { user }, error: null }
              : { data: null, error: { message: 'User not found' } };
          },
          async updateUserById(id, attrs) {
            const fail = store.takeFailure('auth', 'updateUserById');
            if (fail) return { data: null, error: { message: fail } };
            const user = store.users.find((u) => u.id === id);
            if (!user) return { data: null, error: { message: 'User not found' } };
            // user_metadata is REPLACED by GoTrue, not merged — modelled
            // faithfully, because that is precisely the trap HANDOFF §9 warns
            // about and a merging fake would hide it.
            if ('password' in attrs) user.password = attrs.password;
            if ('user_metadata' in attrs) user.user_metadata = attrs.user_metadata;
            if (attrs.email_confirm) user.email_confirmed_at = new Date().toISOString();
            return { data: { user }, error: null };
          },
        },
      },
    };
  }

  rows(table) { return this.tables[table]; }
  uuid() { return `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`; }

  /** Make the NEXT matching call fail, the way a real outage would. */
  failNext(table, op, message = 'injected failure') {
    this.failures.push({ table, op, message });
  }

  takeFailure(table, op) {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op);
    if (i === -1) return null;
    return this.failures.splice(i, 1)[0].message;
  }

  addUser(user) {
    const row = {
      id: this.uuid(),
      email: 'someone@example.com',
      user_metadata: {},
      email_confirmed_at: new Date().toISOString(),
      password: 'the-old-one',
      ...user,
    };
    this.users.push(row);
    return row;
  }
}
