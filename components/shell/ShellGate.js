// ShellGate — resolves who is asking, and nothing else.
//
// IT DOES NOT AUTHENTICATE. There is exactly one sign-in form in this product
// and it lives in pages/admin.js. A second one would be a second place where
// credentials are handled, a second recovery-link path, and a second thing to
// keep in step with `must_set_password` — for no gain, since the shells are
// empty until features migrate into them. So a signed-out visitor is sent to
// the existing form rather than offered a new one.
//
// IT DOES NOT AUTHORISE EITHER. `is_platform_owner()` decides which product a
// person is shown; it never decides what they may do. RLS is the authority and
// stays the authority — this only avoids rendering an operator's navigation to
// a client, which is a UX decision. Reaching /console as a client shows a
// notice, not a leak: every query behind it would be refused anyway.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
// Button renders a <button> and has no `as` prop — navigating is an onClick,
// not an href, and inventing one here would mean changing a shared component
// for a notice screen.
import Button from '../ui/Button';

// 'owner'  — /console. Operators only.
// 'client' — /studio. Anyone signed in; an owner may look at it.
export default function ShellGate({ require: required = 'client', lang = 'ar', children }) {
  const ar = lang === 'ar';
  const [session, setSession] = useState(undefined); // undefined = still asking
  const [isOwner, setIsOwner] = useState(null);      // null = unknown

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession()
      .then(({ data }) => { if (!cancelled) setSession(data?.session ?? null); })
      .catch((err) => {
        // Same reasoning as admin.js: a rejection must not strand the shell on
        // "Loading…" forever. Fall through to the signed-out state, which
        // offers a way forward.
        console.error('[shell] getSession failed:', err);
        if (!cancelled) setSession(null);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!cancelled) setSession(s ?? null);
    });
    return () => { cancelled = true; listener?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!session) { setIsOwner(session === null ? false : null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('is_platform_owner');
        if (!cancelled) setIsOwner(data === true);
      } catch (_) { if (!cancelled) setIsOwner(false); }
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined || (session && isOwner === null)) {
    return <Notice title={ar ? 'جارٍ التحميل…' : 'Loading…'} lang={lang} />;
  }

  if (!session) {
    return (
      <Notice
        title={ar ? 'تحتاج إلى تسجيل الدخول' : 'You need to sign in'}
        body={ar ? 'سجّل الدخول من لوحة التحكم، ثم عد إلى هنا.' : 'Sign in from the dashboard, then come back here.'}
        lang={lang}
        action={<Button onClick={() => window.location.assign('/admin')}>{ar ? 'تسجيل الدخول' : 'Sign in'}</Button>}
      />
    );
  }

  if (required === 'owner' && isOwner !== true) {
    return (
      <Notice
        title={ar ? 'هذه الصفحة لفريق ديزاينكم' : 'This area is for the Designakum team'}
        body={ar ? 'مساحتك أنت في الاستوديو.' : 'Your own workspace is in the studio.'}
        lang={lang}
        action={<Button onClick={() => window.location.assign('/studio')}>{ar ? 'افتح الاستوديو' : 'Open the studio'}</Button>}
      />
    );
  }

  return children({ session, isOwner });
}

function Notice({ title, body, action, lang }) {
  return (
    <div className="notice" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="inner">
        <h1>{title}</h1>
        {body && <p>{body}</p>}
        {action}
      </div>
      <style jsx>{`
        .notice {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: var(--space-5);
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        .inner { text-align: center; max-inline-size: 420px; display: grid; gap: var(--space-3); justify-items: center; }
        h1 { font-size: var(--text-lg); font-weight: 700; margin: 0; }
        p { color: var(--text-secondary); margin: 0; font-size: var(--text-sm); }
      `}</style>
    </div>
  );
}
