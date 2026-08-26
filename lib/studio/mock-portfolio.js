// Mock portfolio data for the Studio frontend slice.
//
// SECTION 1 ONLY. There is no backend in this section by design: the point is
// to prove the interaction model, not the data path. Delete this file when the
// Studio reads real rows — nothing outside the Studio may import it, and it
// must never be reachable from the public site.
//
// Shape follows the content model in blueprint §9 so that swapping the source
// changes where the data comes from and nothing else.

const bi = (en, ar) => ({ en, ar });

// Flat tones stand in for photographs. Deliberately not gradients: the brand
// is flat, and a placeholder that is prettier than the real thing teaches the
// wrong lesson about how the layout behaves.
const TONES = ['#C8CEDC', '#B6BFD2', '#D3D8E4', '#AEB8CE', '#C0C8D8'];

export const MOCK_ADDRESS = 'designakum.site/noura';

export function mockDraft() {
  return {
    name: bi('Noura Al-Harbi', 'نورة الحربي'),
    title: bi('Photographer, Riyadh', 'مصوّرة، الرياض'),
    bio: bi(
      'I photograph people the way they actually are — unhurried, in their own light.',
      'أصوّر الناس كما هم — دون استعجال، وفي ضوئهم الخاص.',
    ),
    // The AI wrote the bio and the client has not accepted or rewritten it.
    // This is what puts the offer in the queue, and what the publish
    // confirmation counts as unreviewed.
    shortLine: bi('Photographing since 2014, mostly editorial', 'التصوير منذ 2014، غالبًا تحريري'),
    bioIsSuggestion: true,
    appearance: { accent: 'royal', font: 'manrope', density: 'roomy' },
    links: [
      { id: 'instagram', label: 'Instagram', url: 'https://instagram.com/noura' },
      { id: 'email', label: 'Email', url: 'noura@example.com' },
    ],
    // The next step: a destination and nothing else.
    action: { destination: 'noura@example.com' },
    pieces: [
      { id: 1, name: bi('', ''), tone: TONES[0] },
      { id: 2, name: bi('', ''), tone: TONES[1] },
      { id: 3, name: bi('', ''), tone: TONES[2] },
      { id: 4, name: bi('Layla, at home', 'ليلى، في البيت'), tone: TONES[3] },
      { id: 5, name: bi('Souq mornings', 'صباحات السوق'), tone: TONES[4] },
    ],
  };
}

// What visitors currently see: an older, shorter portfolio. Deliberately
// behind the draft so that "your latest changes aren't live yet" is a real
// computed state rather than a hardcoded string.
export function mockPublished() {
  const p = mockDraft();
  return {
    ...p,
    bio: bi('Photographer based in Riyadh.', 'مصوّرة مقيمة في الرياض.'),
    bioIsSuggestion: false,
    pieces: p.pieces.slice(0, 3).map((piece) => ({ ...piece })),
  };
}

// A portfolio with nothing in it — the first thing every new client sees, and
// the state most likely to be got wrong.
export function mockEmpty() {
  return {
    name: bi('Noura Al-Harbi', 'نورة الحربي'),
    title: bi('', ''),
    bio: bi('', ''),
    bioIsSuggestion: false,
    appearance: { accent: 'royal', font: 'manrope', density: 'roomy' },
    links: [],
    action: { destination: '' },
    pieces: [],
  };
}

// The three creative directions offered at first run, and again only when the
// client deliberately asks to change direction.
//
// A direction carries PRESENTATION ONLY. There is no content here, and
// applyDirection reads nothing but `appearance` — so a reset can never
// overwrite a word the client wrote.
export const DIRECTIONS = [
  {
    id: 'quiet',
    label: { en: 'Quiet', ar: 'هادئ' },
    why: { en: 'Lets the work speak', ar: 'يترك العمل يتحدث' },
    appearance: { accent: 'ink', font: 'manrope', density: 'roomy' },
  },
  {
    id: 'bold',
    label: { en: 'Bold', ar: 'جريء' },
    why: { en: 'Big covers, short words', ar: 'أغلفة كبيرة وكلمات قليلة' },
    appearance: { accent: 'royal', font: 'manrope', density: 'tight' },
  },
  {
    id: 'editorial',
    label: { en: 'Editorial', ar: 'تحريري' },
    why: { en: 'Reads like a magazine', ar: 'يُقرأ كمجلة' },
    appearance: { accent: 'sand', font: 'reem', density: 'roomy' },
  },
];

// ── Persona fixtures ────────────────────────────────────────────────────
// The layout rule is "the work keeps its natural ratio; hierarchy comes from
// position and scale". A rule like that can only be judged against work whose
// proportions actually differ, so these four exist to test it — not to ship.
//
// Ratios are the ones each discipline really produces. If the layout looks
// like a photography gallery for the UI designer, the rule has failed.
const PERSONA_TONES = ['#C8CEDC', '#B6BFD2', '#D3D8E4', '#AEB8CE', '#C0C8D8', '#CDD4E0'];

function persona(name, title, shapes) {
  return {
    name: bi(name.en, name.ar),
    title: bi(title.en, title.ar),
    bio: bi('A short introduction, in the client’s own words.', 'نبذة قصيرة بكلمات صاحب العمل.'),
    bioIsSuggestion: false,
    appearance: { accent: 'royal', font: 'manrope', density: 'roomy' },
    links: [{ id: 'instagram', label: 'Instagram', url: 'https://instagram.com/x' }],
    action: { destination: 'hello@example.com' },
    pieces: shapes.map((shape, i) => ({
      id: i + 1,
      name: bi(shape.label, shape.label),
      // No cover image in the fixtures, so the declared ratio stands in for
      // what an <img> would report as its natural proportions.
      ratio: shape.ratio,
      tone: PERSONA_TONES[i % PERSONA_TONES.length],
    })),
  };
}

export const PERSONAS = {
  // Mixed landscape and portrait frames — the classic hard case.
  photographer: persona(
    { en: 'Noura Al-Harbi', ar: 'نورة الحربي' },
    { en: 'Photographer, Riyadh', ar: 'مصوّرة، الرياض' },
    [
      { label: '3:2', ratio: 3 / 2 },
      { label: '2:3', ratio: 2 / 3 },
      { label: '3:2', ratio: 3 / 2 },
      { label: '1:1', ratio: 1 },
      { label: '2:3', ratio: 2 / 3 },
    ],
  ),
  // Wide desktop mockups next to very tall phone screens — the case that
  // breaks any width-driven grid.
  uiDesigner: persona(
    { en: 'Omar Haddad', ar: 'عمر حدّاد' },
    { en: 'Product designer', ar: 'مصمّم منتجات' },
    [
      { label: '16:10', ratio: 16 / 10 },
      { label: '9:16', ratio: 9 / 16 },
      { label: '16:9', ratio: 16 / 9 },
      { label: '9:16', ratio: 9 / 16 },
      { label: '4:3', ratio: 4 / 3 },
    ],
  ),
  // Squares and tall frames, almost no landscape.
  illustrator: persona(
    { en: 'Lina Saeed', ar: 'لينا سعيد' },
    { en: 'Illustrator', ar: 'رسّامة' },
    [
      { label: '1:1', ratio: 1 },
      { label: '4:5', ratio: 4 / 5 },
      { label: '1:1', ratio: 1 },
      { label: '4:5', ratio: 4 / 5 },
      { label: '1:1', ratio: 1 },
    ],
  ),
  // Presentation boards and logo grids — consistently landscape.
  branding: persona(
    { en: 'Studio Mesh', ar: 'استوديو مِش' },
    { en: 'Brand design', ar: 'تصميم هوية' },
    [
      { label: '4:3', ratio: 4 / 3 },
      { label: '16:9', ratio: 16 / 9 },
      { label: '4:3', ratio: 4 / 3 },
      { label: '1:1', ratio: 1 },
      { label: '16:9', ratio: 16 / 9 },
    ],
  ),
};
