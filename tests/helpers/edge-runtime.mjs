// Enough of Deno to run one of this project's Edge Functions inside `node --test`.
//
// WHY THIS EXISTS RATHER THAN "test the pure bits and hope"
// --------------------------------------------------------
// tests/client-email-lang.test.mjs lifts pure functions out of Edge Function
// source by brace-matching, because there was no way to run the files
// themselves. That works for a template. It cannot reach the things this
// feature actually promises — that an unknown address is answered identically
// to a known one, that an expired token is refused, that a spent token cannot
// be spent again — because all of those live in the request handler and in the
// shape of a query.
//
// Node can now run those files directly. It strips TypeScript annotations
// natively (22.6+), so the only two obstacles are the `jsr:` imports, which
// edge-loader.mjs maps onto local stand-ins, and the `Deno` global, which is
// installed here. The handler under test is the deployed source, unmodified.
//
// WHAT IS REAL AND WHAT IS NOT
//   real: the whole handler, the shared modules it imports, WebCrypto, Request
//         and Response, and the filtering/mutation semantics of every query.
//   not:  Postgres itself (see fake-supabase.mjs for how closely it is modelled),
//         GoTrue, and Resend — whose HTTP call is captured rather than sent.
import { register } from 'node:module';
import { EdgeStore } from './fake-supabase.mjs';

register('./edge-loader.mjs', import.meta.url);

const DEFAULT_ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RESEND_API_KEY: 'resend-key',
  MAIL_FROM: 'Designakum <noreply@designakum.site>',
  SIGNUP_SITE_URL: 'https://designakum.site',
};

/**
 * Install the runtime, then import an Edge Function and hand back its handler.
 *
 * The `Deno` global must exist BEFORE the module is evaluated — these files read
 * Deno.env at module scope and call Deno.serve at the top level — so the import
 * is dynamic and happens after the global is in place.
 *
 * Each function is imported once per process by Node's module cache, so the
 * store and the captured mail are swapped underneath it between tests rather
 * than the module being re-evaluated. That is why they hang off globalThis.
 */
const handlers = new Map();

export async function loadEdgeFunction(name, { env = {} } = {}) {
  // Memoised because Node's module cache is: a second import of the same file
  // does not re-evaluate it, so Deno.serve is never called again and the
  // handler would come back null. A consequence worth knowing — `env` only has
  // an effect on the FIRST load of a given function in a process, since these
  // files read Deno.env at module scope, exactly as they do in production.
  if (handlers.has(name)) return handlers.get(name);

  const vars = { ...DEFAULT_ENV, ...env };
  let handler = null;

  globalThis.Deno = {
    env: { get: (key) => vars[key] },
    serve: (fn) => { handler = fn; },
  };

  await import(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url).href);
  if (!handler) throw new Error(`${name} did not call Deno.serve`);
  handlers.set(name, handler);
  return handler;
}

/**
 * A fresh database and a fresh outbox for one test.
 *
 * Returns the store, the captured Resend sends, and the console lines — the
 * last of those because "no raw token is ever logged" is a real requirement of
 * this feature and the only way to check it is to look at what was logged.
 */
export function installEdgeRuntime() {
  const store = new EdgeStore();
  globalThis.__EDGE_DB__ = store;

  const sent = [];
  const logs = [];

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'test-message-id' }), { status: 200 });
    }
    return realFetch(url, init);
  };

  const realConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ['log', 'warn', 'error']) {
    console[level] = (...args) => { logs.push(args.map(String).join(' ')); };
  }

  const restore = () => {
    globalThis.fetch = realFetch;
    Object.assign(console, realConsole);
    delete globalThis.__EDGE_DB__;
  };

  return { store, sent, logs, restore };
}

/** A POST the way supabase.functions.invoke() sends one. */
export function post(body) {
  return new Request('https://test.functions.supabase.co/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A raw POST body, for the malformed-JSON case. */
export function postRaw(raw) {
  return new Request('https://test.functions.supabase.co/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}
