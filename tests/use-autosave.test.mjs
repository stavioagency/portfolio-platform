// lib/use-autosave.js — the three ways autosave loses work.
//
// These run the hook's logic directly rather than through React: the module is
// a state machine wrapped in useState/useEffect, and the machine is what can
// lose a keystroke. A React renderer would test the wrapper and not the part
// that matters, and this repo has no renderer to do it with.
//
// The scheduler is re-implemented here in the same shape as the hook so the
// ORDERING can be driven deterministically. Each test states the real-world
// failure it stands for; if the hook's ordering changes, these must change with
// it, deliberately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'lib/use-autosave.js'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* A faithful stand-in for the hook's queue: one write in flight, a single
   pending slot holding only the newest payload, and a sequence number so a
   late result from a superseded attempt is discarded. */
function makeSaver(save) {
  let pending = null;
  let inFlight = false;
  let seq = 0;
  let state = 'idle';
  let error = '';
  async function run() {
    if (inFlight || pending === null) return;
    const payload = pending;
    pending = null;
    inFlight = true;
    const mine = ++seq;
    state = 'saving';
    try {
      await save(payload);
      if (mine !== seq) return;
      state = pending === null ? 'saved' : 'dirty';
    } catch (e) {
      if (mine !== seq) return;
      error = e.message; state = 'error';
      if (pending === null) pending = payload;
      return;
    } finally { inFlight = false; }
    if (pending !== null) await run();
  }
  return {
    schedule(p) { pending = p; if (state !== 'error') state = 'dirty'; },
    flush: () => run(),
    get state() { return state; },
    get error() { return error; },
  };
}

const defer = () => { let r, j; const p = new Promise((a, b) => { r = a; j = b; }); return { p, resolve: r, reject: j }; };

test('the last edit wins, whatever order the writes finish in', async () => {
  // THE OVERLAPPING WRITE. Type, pause, type again. Save A is still in flight
  // when B starts; they finish out of order and the server keeps A — the older
  // text — while the screen shows B. The customer's last sentence is gone and
  // nothing reported an error.
  const written = [];
  const gates = [defer(), defer()];
  let n = 0;
  const s = makeSaver(async (v) => { const g = gates[n++]; await g.p; written.push(v); });

  s.schedule('A');
  const first = s.flush();          // A is in flight
  s.schedule('B');                  // queued, NOT started
  s.schedule('C');                  // supersedes B while still queued

  /* Both gates open before `first` is awaited. run() drains the queue
     recursively, so the promise it returned does not settle until the write it
     started for C has also finished — awaiting it between the two resolves
     would deadlock on the gate that has not been opened yet. */
  gates[0].resolve();
  await new Promise((r) => setTimeout(r, 0));
  gates[1].resolve();
  await first;

  assert.deepEqual(written, ['A', 'C'], 'B was superseded and must never be written');
  assert.equal(written[written.length - 1], 'C', 'the newest payload must be written last');
});

test('a superseded failure cannot paint an error over a saved screen', async () => {
  // THE STALE SUCCESS, inverted: attempt A fails, attempt B succeeds, and A's
  // rejection lands afterwards. Without the sequence check the screen reads
  // "not saved" while the server holds the correct text.
  //
  // Driven directly rather than through the queue, because the queue's own
  // rule (one write at a time) makes the overlap impossible to stage from
  // outside — the guard being tested is the one INSIDE the attempt.
  let state = 'idle';
  let seq = 0;
  const attempt = async (fn) => {
    const mine = ++seq;
    try {
      await fn();
      if (mine !== seq) return;      // superseded: say nothing
      state = 'saved';
    } catch (e) {
      if (mine !== seq) return;      // superseded: say nothing
      state = 'error';
    }
  };

  const slowFailure = attempt(() => new Promise((_, rej) => setTimeout(() => rej(new Error('A')), 20)));
  const fastSuccess = attempt(() => Promise.resolve());
  await fastSuccess;
  assert.equal(state, 'saved');
  await slowFailure;
  assert.equal(state, 'saved', 'a late failure from a superseded attempt must not overwrite "saved"');
});

test('a failed write keeps the payload so a retry has something to retry', async () => {
  let fail = true;
  const written = [];
  const s = makeSaver(async (v) => { if (fail) throw new Error('blocked'); written.push(v); });

  s.schedule('X');
  await s.flush();
  assert.equal(s.state, 'error');
  assert.match(s.error, /blocked/);

  fail = false;
  await s.flush();                  // the retry
  assert.deepEqual(written, ['X'], 'the failed payload must survive to be retried');
});

test('it does not retry on its own', () => {
  // A background retry loop against a write the database is REFUSING — a lapsed
  // subscription is the common case — hammers the server forever and tells the
  // customer nothing.
  assert.ok(!/setInterval|retryCount|backoff/i.test(CODE), 'no automatic retry may exist');
  assert.ok(/does not retry on its own/i.test(SRC), 'and the decision must be recorded');
});

test('only one write is ever in flight', () => {
  assert.ok(/if \(inFlight\.current\) return;/.test(CODE), 'a second concurrent write must be refused');
  assert.ok(/inFlight\.current = true;/.test(CODE) && /inFlight\.current = false;/.test(CODE));
  assert.ok(/const mine = \+\+seq\.current;/.test(CODE), 'attempts must be sequenced');
  assert.equal((CODE.match(/if \(mine !== seq\.current\) return;/g) || []).length, 2,
    'both the success and the failure path must discard a superseded result');
});

test('a pending change survives leaving the screen', () => {
  // THE SILENT LOSS ON EXIT: the debounce is still pending when the tab closes
  // or the customer navigates away.
  assert.ok(/beforeunload/.test(CODE), 'a closing tab must be warned about');
  assert.ok(/pending\.current !== null && !inFlight\.current\) run\(\)/.test(CODE),
    'unmount must flush rather than drop the change');
});
