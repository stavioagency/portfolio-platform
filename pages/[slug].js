import { useRouter } from 'next/router';
import Home from './index';

// Slug fallback route for public portfolios: /f9designer, /designakum, /demo-client, etc.
// It reuses the exact same public rendering as `/` (the Home component) and just passes
// the slug so the tenant resolver can look it up.
//
// - Static routes (/, /admin, /privacy, /terms) take priority over this dynamic route,
//   so they are never shadowed.
// - Until the tenants tables exist, any slug resolves to "not found" (handled inside Home),
//   while `/` keeps working through the singleton fallback.
// - After the migration, a matching slug renders that tenant's portfolio.
export default function SlugPortfolio() {
  const router = useRouter();
  // Wait for the router to populate query.slug (avoids a flash of default content).
  if (!router.isReady) return null;
  const slug = typeof router.query.slug === 'string' ? router.query.slug : null;
  return <Home slug={slug} />;
}
