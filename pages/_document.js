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

            One request for all four families. The css2 API wants them in
            alphabetical order. Weights and display:swap are unchanged from
            the four separate URLs — 77 @font-face rules either way — so
            nothing about how any page looks changes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400;500;600;700&display=swap"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
