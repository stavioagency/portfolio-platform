// The Studio's data layer and its editing screens.
//
// Three properties carry real risk and none of them is visible in review:
// a write that RLS silently discards, a destructive action with a vague
// question, and an appearance control the renderer does not actually read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { contrastRatio } from '../lib/contrast.js';
import {
  ACCENTS, DEFAULT_ACCENT, INK_ON_ACCENT, accentById, accentPatch, currentAccent,
} from '../lib/studio-appearance.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DATA = read('lib/studio-data.js');
const DATA_CODE = strip(DATA);
const WORK = read('components/studio/work.js');
const SECTIONS = read('components/studio/sections.js');

// ── The write that looks like a save and is not ──────────────────────────

test('every write checks that a row was actually affected', () => {
  // THE FAILURE THIS PREVENTS: PostgREST reports success for an update RLS
  // filtered out — zero rows changed, no error. Saving into a workspace you
  // cannot write to therefore looked exactly like a real save, and the work was
  // gone on reload. Every write must end in .select() and treat empty as failure.
  const writes = [...DATA_CODE.matchAll(/export async function (saveProfile|saveProject|deleteProject|createProject)[\s\S]*?\n\}/g)];
  assert.equal(writes.length, 4, 'a write function was added or removed — check it too');
  for (const [body] of writes) {
    const name = /function (\w+)/.exec(body)[1];
    assert.ok(/\.select\(/.test(body), `${name} does not select, so a blocked write is invisible`);
    if (name !== 'createProject') {
      assert.ok(/data\.length === 0/.test(body) && /throw new Error\(BLOCKED_WRITE\)/.test(body),
        `${name} does not treat "zero rows changed" as a failure`);
    }
  }
});

test('the blocked-write message names the likely cause', () => {
  // "Save failed" sends someone to check their connection. The actual cause is
  // almost always a lapsed subscription, because can_edit_tenant() requires one.
  assert.match(DATA, /BLOCKED_WRITE = /);
  assert.match(DATA, /lapsed subscription/);
  assert.match(DATA, /nothing was changed/);
});

test('the data layer is not a security boundary and does not pretend to be', () => {
  /* Checked against the CODE, not the prose: the file's comments explain the
     RLS policies by name, and a guard that fires on its own documentation is a
     guard the next person deletes. */
  for (const bad of ['is_platform_owner', 'SERVICE_ROLE', 'service_role', 'auth.uid()']) {
    assert.ok(!DATA_CODE.includes(bad), `${bad} has no business in the Studio's data layer`);
  }
  // Tenant scoping is RLS's job; these .eq() calls are addressing, not authorization.
  assert.ok(/RLS decides|RLS does the filtering/.test(DATA), 'the reasoning must be stated where it can be violated');
});

test('media is validated before it is uploaded, not after', () => {
  // Waiting for a transfer that was always going to be rejected is the worst
  // possible ordering on a phone connection.
  assert.ok(/describeRejection\(file/.test(DATA_CODE), 'uploadImage must reject before compressing');
  const upload = /export async function uploadImage[\s\S]*?\n\}/.exec(DATA_CODE)[0];
  assert.ok(upload.indexOf('describeRejection') < upload.indexOf('compressImage'),
    'validation must come before the work');
  assert.ok(!DATA_CODE.includes("'image/gif'"), 'GIF is deliberately not accepted');
  assert.ok(/MAX_UPLOAD_BYTES = 8 \* 1024 \* 1024/.test(DATA_CODE));
});

test('storage paths are tenant-isolated', () => {
  // A flat path drops one client's file beside every other client's images.
  assert.ok(/return `t-\$\{tenantId\}\/\$\{name\}`/.test(DATA_CODE));
  assert.ok(/if \(!tenantId\) return null/.test(DATA_CODE), 'no tenant must yield no path, never a bare filename');
});

// ── Destroying a customer's work ─────────────────────────────────────────

test('deleting a project names the project and what goes with it', () => {
  // "Are you sure?" is not a question anybody can answer. The customer deleting
  // a placeholder and the customer deleting three years of work press the same
  // button, and only one of them can afford a vague dialog.
  assert.ok(/function ConfirmDelete/.test(WORK));
  assert.ok(/\$\{name\}/.test(WORK), 'the dialog must name the project');
  assert.ok(/imageCount > 0/.test(WORK), 'and say how many images go with it');
  assert.ok(/لا يمكن التراجع عن هذا|cannot be undone/.test(WORK));
  // Nothing is deleted without passing through it.
  const code = strip(WORK);
  assert.ok(!/onClick=\{\(\) => doDelete\(/.test(code), 'delete must never be wired straight to a click');
  assert.ok(/setConfirming\(p\)/.test(code), 'the list opens the confirmation, not the deletion');
});

test('a failed reorder puts the list back', () => {
  // A list showing an order the database refused is a lie the customer only
  // discovers after publishing.
  const code = strip(WORK);
  assert.ok(/onProjects\(projects\);/.test(code), 'the previous order must be restored on failure');
  assert.ok(/setError\(e\?\.message/.test(code), 'and the failure must be said out loud');
});

test('limits are enforced where they are also explained', () => {
  assert.ok(/MAX_PROJECTS = 12/.test(WORK) && /MAX_GALLERY = 6/.test(WORK));
  assert.ok(/projects\.length >= MAX_PROJECTS/.test(strip(WORK)), 'the cap must actually stop the action');
  assert.ok(/MAX_LINKS = 8/.test(SECTIONS) && /rows\.length < MAX_LINKS/.test(strip(SECTIONS)));
});

// ── Appearance: only what the renderer reads ─────────────────────────────

test('every offered accent is readable against the ink that lands on it', () => {
  // --accent-fg resolves to --brand-ink: white in the dark theme, navy in the
  // light one. An accent must clear AA under at least the one it will meet.
  const bad = [];
  for (const a of ACCENTS) {
    const best = Math.max(
      contrastRatio(INK_ON_ACCENT.dark, a.hex),
      contrastRatio(INK_ON_ACCENT.light, a.hex),
    );
    if (best < 4.5) bad.push(`${a.id} ${a.hex} = ${best.toFixed(2)}`);
  }
  assert.deepEqual(bad, [], 'an accent nobody can read text on is not a choice, it is a trap');
});

test('the accent list is a closed set with no free colour field', () => {
  // A free hex field is what put an unreadable accent on a live customer site.
  assert.ok(ACCENTS.length >= 6, 'a short list still has to offer a real choice');
  assert.equal(new Set(ACCENTS.map((a) => a.id)).size, ACCENTS.length, 'duplicate accent id');
  assert.equal(new Set(ACCENTS.map((a) => a.hex)).size, ACCENTS.length, 'two names for one colour');
  for (const a of ACCENTS) {
    assert.match(a.hex, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(a.label.ar && a.label.en, `${a.id} needs both labels`);
  }
  assert.ok(accentById(DEFAULT_ACCENT), 'the default must be a real accent');
  assert.ok(!/type="color"|input type=.color/.test(SECTIONS), 'no raw colour picker');
});

test('setting an accent preserves everything else in the appearance object', () => {
  // appearance also holds a theme preset and whatever else past editors wrote.
  // None of it is ours to discard while changing one colour.
  const before = { tokens: { accent: '#000000', bg: '#111111' }, key: 'midnight', extra: 1 };
  const after = accentPatch(before, 'royal');
  assert.equal(after.tokens.accent, accentById('royal').hex);
  assert.equal(after.tokens.bg, '#111111', 'an unrelated token was dropped');
  assert.equal(after.key, 'midnight');
  assert.equal(after.extra, 1);
  // Both fields are written, because the public page prefers tokens.accent and
  // falls back to accent_color — leaving them disagreeing is a latent bug.
  assert.equal(after.accent_color, after.tokens.accent);
  assert.equal(accentPatch(before, 'not-a-colour'), null, 'an unknown id must write nothing');
});

test('a colour saved before the list existed is reported, not silently reassigned', () => {
  assert.deepEqual(currentAccent({ tokens: { accent: '#9FA7FF' } }),
    { id: null, hex: '#9fa7ff', known: false, unset: false });
  assert.equal(currentAccent({}).unset, true);
  assert.equal(currentAccent(null).unset, true);
  assert.equal(currentAccent({ accent_color: accentById('teal').hex }).id, 'teal',
    'the older flat field must still be understood');
});

// ── The bilingual choice ─────────────────────────────────────────────────

test('content language follows the portfolio, not the interface', () => {
  // section-v: five of seven portfolios were being charged a decision they never
  // made. Someone reading the tool in English still writes an Arabic-only
  // portfolio in Arabic.
  assert.ok(/draft\.bilingual \? uiLang : draft\.default_lang/.test(strip(SECTIONS)),
    'Profile must edit in the portfolio’s own language when not bilingual');
  assert.ok(/profile\?\.bilingual \? uiLang : \(profile\?\.default_lang/.test(strip(WORK)),
    'Work must follow the same rule');
});

test('turning bilingual off hides the second language and says it deletes nothing', () => {
  // "Will this delete my Arabic?" is the first thing anyone sensibly asks.
  const code = strip(SECTIONS);
  assert.ok(/bilingual: false, default_lang: opt\.id/.test(code), 'the switch only changes the flag');
  assert.ok(!/name: \{ ar: '', en: '' \}[\s\S]{0,200}patch/.test(code), 'no field is cleared by the switch');
  assert.ok(/لا يحذف أي نص|deletes nothing you have written/.test(SECTIONS),
    'and the screen must say so where it is decided');
});

test('no screen writes a default the customer did not type', () => {
  // A portfolio that silently acquired content nobody wrote is worse than a
  // blank one, and impossible to explain afterwards.
  assert.ok(/It does not invent|no defaults are written/i.test(DATA));
  const create = /export async function createProject[\s\S]*?\n\}/.exec(DATA_CODE)[0];
  assert.ok(/title: \{ ar: '', en: '' \}/.test(create), 'a new project starts empty, not "New Project"');
});
