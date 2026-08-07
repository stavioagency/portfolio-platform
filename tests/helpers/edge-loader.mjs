// A Node module-resolution hook that lets the Edge Functions be imported.
//
// They are Deno files: they import from `jsr:` specifiers that Node has never
// heard of. Everything ELSE about them is ordinary JavaScript with type
// annotations, which Node 22.6+ strips natively — so the only thing standing
// between `node --test` and running the real handler is these two specifiers.
//
// This maps them at resolve time onto local stand-ins. Nothing about the
// function under test is rewritten, mocked out or re-implemented: the code that
// runs in the test is the code that gets deployed, byte for byte.
//
// Registered by tests/helpers/edge-runtime.mjs — not used directly.
const FAKE_SUPABASE = new URL('./fake-supabase.mjs', import.meta.url).href;
const EMPTY = new URL('./empty.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  // The edge runtime's ambient type declarations. Pure types in Deno; nothing
  // at all at runtime.
  if (specifier.startsWith('jsr:@supabase/functions-js')) {
    return { url: EMPTY, shortCircuit: true };
  }
  // Both spellings appear across the functions in this repo.
  if (specifier.startsWith('jsr:@supabase/supabase-js')
    || specifier.startsWith('https://esm.sh/@supabase/supabase-js')) {
    return { url: FAKE_SUPABASE, shortCircuit: true };
  }
  return next(specifier, context);
}
