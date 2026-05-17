// Helpers for reading/writing bilingual JSONB fields shaped as { en, ar }.
// Tolerates legacy plain-string values from before the migration.

export function pick(field, lang) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.en || field.ar || '';
}

export function setLangValue(field, lang, value) {
  const base = (field && typeof field === 'object') ? field : { en: '', ar: '' };
  return { ...base, [lang]: value };
}

export function emptyBilingual() {
  return { en: '', ar: '' };
}
