# Test fixtures

`f9designer.doc.json` is a **snapshot-shaped document derived from one real
tenant** (`f9designer`, 8 pieces — the largest portfolio in the system), read
2026-08-21.

It is a **shape fixture, not a migration.** Nothing was published, nothing was
written back, and the live rows are untouched. The content is the tenant's own
published public portfolio; the derivation is documented in
`docs/architecture/renderer-contracts.md` §7.

It exists because every quality claim about `PortfolioRenderer` so far rests on
`lib/studio/mock-portfolio.js`, which is invented data with tidy values. This
fixture is what real data looks like, and it disagrees with the mock in seven
ways that matter — all recorded in the contracts document.
