// lib/use-autosave.js
// -----------------------------------------------------------------------------
// Autosave that cannot lose a keystroke and cannot overwrite newer work.
//
// The requirement is easy to state and easy to get wrong: the customer should
// not have to think about saving, AND autosave must never write stale data over
// fresh data. A naive debounce satisfies the first and fails the second.
//
// ── THE THREE FAILURES THIS IS BUILT AGAINST ─────────────────────────────
//
// 1. THE OVERLAPPING WRITE. Type, pause, type again. Save A is still in flight
//    when save B starts. They finish out of order and the server ends up
//    holding A — the older text — with the screen showing B. The customer's
//    last sentence is gone and nothing reported an error.
//    → Only ONE save is ever in flight. A change during a save is queued, not
//      started, and the queue holds only the LATEST payload because every
//      earlier one is already superseded.
//
// 2. THE STALE SUCCESS. Save A fails, save B succeeds, A's rejection lands
//    afterwards and paints an error over a screen that is actually saved.
//    → Every attempt carries a sequence number and a late result from a
//      superseded attempt is discarded entirely.
//
// 3. THE SILENT LOSS ON EXIT. The debounce is still pending when the tab
//    closes. The customer saw "saving…" and lost the last edit.
//    → A pending change is flushed on unmount, and beforeunload warns while
//      anything is unsaved.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
// It does not retry on its own. A failed save leaves the state dirty and the
// error visible with a manual retry, because a background retry loop against a
// write the database is REFUSING — a lapsed subscription being the common case —
// hammers the server forever and tells the customer nothing.

import { useCallback, useEffect, useRef, useState } from 'react';

export const AUTOSAVE_DELAY = 1200;

/* save(payload) must return a promise. It is called with the newest payload
   passed to schedule(), never with an older one. */
export function useAutosave(save, { delay = AUTOSAVE_DELAY } = {}) {
  const [state, setState] = useState('idle');   // idle | dirty | saving | saved | error
  const [error, setError] = useState('');

  const timer = useRef(null);
  const pending = useRef(null);     // the newest payload not yet written
  const inFlight = useRef(false);
  const seq = useRef(0);            // attempt number, to discard late results
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);

  const run = useCallback(async () => {
    if (inFlight.current) return;              // failure 1: never two at once
    if (pending.current === null) return;

    const payload = pending.current;
    pending.current = null;
    inFlight.current = true;
    const mine = ++seq.current;
    setState('saving');
    setError('');

    try {
      await saveRef.current(payload);
      // failure 2: a superseded attempt may not paint anything.
      if (mine !== seq.current) return;
      setState(pending.current === null ? 'saved' : 'dirty');
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e?.message || String(e));
      setState('error');
      /* The payload goes BACK on the queue so a manual retry has something to
         retry, and so an unmount flush does not write an empty change. */
      if (pending.current === null) pending.current = payload;
      return;
    } finally {
      inFlight.current = false;
    }

    // Something changed while that was in flight: write the newest, once.
    if (pending.current !== null) run();
  }, []);

  const schedule = useCallback((payload) => {
    pending.current = payload;
    setState((s) => (s === 'error' ? 'error' : 'dirty'));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; run(); }, delay);
  }, [delay, run]);

  /* Write now — for an action the customer expects to take effect immediately
     (pressing Save, leaving a screen) rather than in a second and a bit. */
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return run();
  }, [run]);

  const unsaved = state === 'dirty' || state === 'saving' || state === 'error';

  /* failure 3: the tab closing on a pending change. The browser shows its own
     wording; the only thing a page can do is ask for the prompt. */
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // And a navigation inside the app: flush rather than warn, because there is
  // no reason to interrupt someone when the write can simply be sent.
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null && !inFlight.current) run();
  }, [run]);

  return { state, error, unsaved, schedule, flush, retry: flush };
}

export default useAutosave;
