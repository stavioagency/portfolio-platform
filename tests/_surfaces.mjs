// The screens a rule should be enforced across.
//
// Every test that used to read pages/admin.js read ONE file, because for a long
// time one file was the whole product. Deleting it broke seventeen test files
// at once -- not because the rules stopped mattering, but because each rule had
// been written against a location rather than against the product.
//
// This is that list, written once. A new screen is added here and every rule
// starts covering it, which is the opposite of the old arrangement, where a new
// screen was covered by nothing until someone remembered.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = [
  'pages/signin.js',
  'pages/signup.js',
  'pages/signup/verify.js',
  'pages/reset-password.js',
  'pages/subscribe.js',
  'pages/studio/index.js',
  'pages/console/index.js',
  'pages/client/index.js',
];

const COMPONENT_DIRS = ['components/studio', 'components/console', 'components/client', 'components/ui', 'components/billing'];

/** Every editable surface, as { file, src }. */
export function surfaces() {
  const out = [];
  for (const f of PAGES) {
    if (existsSync(f)) out.push({ file: f, src: readFileSync(f, 'utf8') });
  }
  for (const dir of COMPONENT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const file = join(dir, name);
      out.push({ file, src: readFileSync(file, 'utf8') });
    }
  }
  return out;
}

/** Just the sources, joined — for rules that only need to grep the whole tree. */
export function allSource() {
  return surfaces().map((s) => s.src).join('\n');
}
