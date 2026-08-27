// /console — the internal client-management area.
//
// It is not a separate product. Designakum's client management already lives in
// /admin: signing in as a platform owner puts "Sites" and "Subscribers" at the
// top of the sidebar, and those two screens are the back office — every client,
// their email, their subscription, reset password, change the login email,
// grant free access, open their portfolio, open their editor.
//
// This route used to be an empty shell promising a second product that would
// one day replace /admin. It never did, and maintaining two half-answers to
// "where do I manage clients" was worse than having one that works. So the URL
// stays — it is the one a person types when they want the back office — and it
// sends them to the thing that actually exists.
//
// Client-side redirect rather than a Next.js config rewrite, because every page
// here is statically exported and the route must resolve in the browser.
import { useEffect } from 'react';
import Head from 'next/head';

export default function ConsoleRedirect() {
  useEffect(() => { window.location.replace('/admin'); }, []);
  return (
    <Head>
      <title>Designakum</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );
}
