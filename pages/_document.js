import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ar" dir="rtl">
      <Head>
        <meta name="theme-color" content="#0a0a0c" />
        <link rel="icon" href="/favicon.png" type="image/png" />

        {/* Fonts. These were four @import rules at the top of globals.css,
            which meant the browser learned about them only after downloading
            and parsing that file — a round trip late, on the render-blocking
            path, across two origins it had never opened.

            preconnect starts the DNS and TLS work for both origins now, in
            parallel with everything else, instead of when the CSS finally
            names them. crossOrigin is required on the gstatic hint: font
            files are fetched anonymously, and a hint whose CORS mode does not
            match the request it is warming opens a second, useless connection.

            One request for all five families. The css2 API wants them in
            alphabetical order. Weights and display:swap are unchanged from
            the four separate URLs — 77 @font-face rules either way — so
            nothing about how any page looks changes.

            TAJAWAL was added on 2026-08-28 for the public portfolio, which is
            the only surface that uses it. It costs no extra REQUEST — the
            families share one stylesheet — and no extra FONT FILE anywhere it
            is not used, because a face is only fetched when something on the
            page is actually set in it. The admin pages pay for the @font-face
            rules and nothing else. Three weights, matching the original the
            portfolio is being returned to: 400 / 500 / 700. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap"
        />
      </Head>
      <body>
        {/* THEME, BEFORE FIRST PAINT.

            Five pages read `admin_theme` out of localStorage and set
            `data-admin-theme` on <html> — but they do it in an effect, which
            runs after hydration. Until then the page paints with :root, which
            is the DARK palette, so every light-theme user saw a dark page flash
            to light on every single load. It is visible in a screenshot taken
            right after navigation: the dark theme's brand blue (#598CD9) sits
            on the button before the light one (#2A6BCE) replaces it.

            `body { background: var(--bg-primary) }`, so setting the attribute
            here is the whole fix — no inline background styles needed, and
            nothing to keep in step with the token layer.

            SCOPED TO THE PAGES THAT OPT IN, and that is the load-bearing part.
            The public portfolio (`/` and `/{slug}`) and the legal pages are
            deliberately dark-only: they never set this attribute. Applying it
            globally would hand a visitor's saved *admin* preference to a
            customer's public site and paint it white. `/signup/verify` is
            listed explicitly because it IS themed while sitting under
            `/signup` — a prefix match would have been wrong in the other
            direction had it not been.

            Client-side navigation does not re-run this, and does not need to:
            the effects still set and clear the attribute exactly as before.
            This only fixes the first paint, which is the only thing that was
            broken. Behaviour, storage key and 'dark' default are unchanged.

            In <body> rather than <Head>: Next.js reorders and dedupes head
            children, and this must run in document order, before the body
            paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{' +
                'var p=location.pathname.replace(/\\/+$/,"")||"/";' +
                'if(p==="/admin"||p==="/console"||p==="/signup"||p==="/signup/verify"||p==="/subscribe"||p==="/reset-password"){' +
                  'document.documentElement.setAttribute("data-admin-theme",localStorage.getItem("admin_theme")||"dark");' +
                '}' +
              '}catch(e){}})();',
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
