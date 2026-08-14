// The information architecture for the two Phase 1 shells, DERIVED from the one
// that already exists.
//
// WHY THIS IS NOT A SECOND IA. pages/admin.js renders one navigation whose
// visibility rules branch on `isOwner`, and lib/admin-nav.js is that IA as pure
// data. The Phase 1 split — /console for the operator, /studio for the client —
// is the same split navGroups() already encodes, so this module filters that
// output rather than restating it. Restating it would create two lists that
// drift, and the drift would show up as a tab that exists in one product and
// not the other for no reason anybody could name.
//
// So: change lib/admin-nav.js and both shells follow. There is one IA.
import { navGroups } from './admin-nav.js';

// Groups that belong to the OPERATOR's product. `website` is deliberately not
// here: editing a portfolio is the client's product, and an owner who needs to
// do it opens that client's studio rather than carrying a second copy of every
// editor around in the console. That is the whole point of the split — today
// both live in one file and the tabs change meaning depending on which
// workspace happens to be selected.
const CONSOLE_GROUPS = ['platform', 'insights', 'settings'];

/**
 * The operator/console IA.
 *
 * Built from navGroups({ isOwner: true }) so the owner-only visibility rules —
 * and the reasoning recorded beside them — stay in one place.
 */
export function consoleNav({ ar, t }) {
  return navGroups({ isOwner: true, ar, t })
    .filter((g) => CONSOLE_GROUPS.includes(g.id))
    .filter((g) => g.items.length > 0);
}

/**
 * The client/studio IA.
 *
 * This is exactly navGroups({ isOwner: false }) — the client's navigation is
 * already the client's product, so there is nothing to filter. Kept as a named
 * function anyway so the two shells read symmetrically and so studio has a seam
 * of its own the day it needs one.
 */
export function studioNav({ ar, t }) {
  return navGroups({ isOwner: false, ar, t }).filter((g) => g.items.length > 0);
}

/**
 * Flat list of every reachable item id in a set of groups.
 *
 * The shells use it to validate a requested tab before rendering, so a stale
 * link or a hand-typed hash cannot land someone on a blank panel.
 */
export function navItemIds(groups) {
  return groups.flatMap((g) => g.items.map((i) => i.id));
}

/**
 * The first item a shell should land on when nothing else is specified.
 *
 * Derived rather than hardcoded: a constant would be one more thing to keep in
 * step with the IA, and it would be wrong the first time a group is reordered.
 */
export function defaultItemId(groups) {
  const ids = navItemIds(groups);
  return ids.length > 0 ? ids[0] : null;
}
