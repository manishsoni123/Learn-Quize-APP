/**
 * Learn-Quize · CSV question importer.
 *
 *   node scripts/import-questions.mjs content/questions.csv
 *   node scripts/import-questions.mjs content/questions.csv --out my-batch.sql
 *
 * Reads the content/question-template.csv format, validates every row, and
 * writes a SQL file that inserts the questions as `in_review` — the approval
 * gate stays intact: a staff member approves them afterwards (the approval
 * trigger then enforces >= 2 options with exactly 1 correct).
 *
 * Apply the output with psql:
 *   local : docker exec -i supabase_db_Learn-Quize psql -U postgres -d postgres \
 *             -v ON_ERROR_STOP=1 -f - < <out.sql>
 *   hosted: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f <out.sql>
 *
 * Duplicate-safe: a row whose (category, body) already exists is skipped by
 * the SQL itself, so re-running an amended batch only adds what is new.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const outFlag = args.indexOf('--out');
if (!csvPath) {
  console.error('usage: node scripts/import-questions.mjs <csv-file> [--out <sql-file>]');
  process.exit(2);
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const KINDS = new Set(['single_choice', 'true_false', 'code_output']);
const HEADER = [
  'category_slug', 'difficulty', 'kind', 'body', 'code_snippet', 'code_language',
  'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation',
  'tags', 'source', 'source_url', 'source_licence',
];

/* ------------------------------------------------------------- CSV parsing */

/** RFC-4180 state machine: quoted fields, doubled quotes, embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/* -------------------------------------------------------------- validation */

const raw = readFileSync(join(ROOT, csvPath), 'utf8');
const rows = parseCsv(raw);
const header = rows.shift()?.map((h) => h.trim());

if (!header || HEADER.some((h, i) => header[i] !== h)) {
  console.error('Header does not match content/question-template.csv:');
  console.error(`  expected: ${HEADER.join(',')}`);
  console.error(`  got:      ${(header ?? []).join(',')}`);
  process.exit(1);
}

const errors = [];
const questions = [];

rows.forEach((cols, index) => {
  const line = index + 2; // 1-based, after the header
  const r = Object.fromEntries(HEADER.map((h, i) => [h, (cols[i] ?? '').trim()]));

  const fail = (why) => errors.push(`  line ${line}: ${why}`);

  if (!r.category_slug) return fail('missing category_slug');
  if (!DIFFICULTIES.has(r.difficulty)) return fail(`difficulty "${r.difficulty}" is not easy|medium|hard`);
  if (!KINDS.has(r.kind)) return fail(`kind "${r.kind}" is not a known question kind`);
  if (!r.body) return fail('missing body');
  if (!r.explanation) return fail('missing explanation — every question must teach');
  if (!r.source) return fail('missing source (manual | ai | import:<name>)');
  if (r.source.startsWith('import:') && !r.source_licence) {
    return fail('imported content must record source_licence — licensing questions are unanswerable later without it');
  }

  const options = [r.option_a, r.option_b, r.option_c, r.option_d]
    .map((body, i) => ({ body, key: 'abcd'[i], ord: i + 1 }))
    .filter((o) => o.body !== '');
  if (options.length < 2) return fail('needs at least 2 non-empty options');

  const correct = options.find((o) => o.key === r.correct.toLowerCase());
  if (!correct) return fail(`correct="${r.correct}" does not point at a non-empty option`);

  questions.push({ ...r, options, correctKey: correct.key });
});

if (errors.length) {
  console.error(`${errors.length} problem${errors.length === 1 ? '' : 's'} — nothing written:\n`);
  console.error(errors.join('\n'));
  process.exit(1);
}
if (questions.length === 0) {
  console.error('No data rows found.');
  process.exit(1);
}

/* ------------------------------------------------------------ SQL emission */

/** Dollar-quote with a tag that provably does not appear in the content. */
function lit(text) {
  let tag = '$imp$';
  while (text.includes(tag)) tag = `$imp${Math.random().toString(36).slice(2, 6)}$`;
  return `${tag}${text}${tag}`;
}
const opt = (text) => (text === '' ? 'null' : lit(text));

const slugs = [...new Set(questions.map((q) => q.category_slug))];

const chunks = [];
chunks.push(`-- Generated by scripts/import-questions.mjs from ${basename(csvPath)}`);
chunks.push(`-- ${questions.length} questions, categories: ${slugs.join(', ')}`);
chunks.push('begin;');
chunks.push(`
-- Fail loudly on a typo'd category rather than silently importing nothing.
do $$
declare missing text;
begin
  select string_agg(s.slug, ', ') into missing
  from unnest(array[${slugs.map((s) => lit(s)).join(', ')}]) as s(slug)
  where not exists (select 1 from public.categories c where c.slug = s.slug);
  if missing is not null then
    raise exception 'unknown category slugs: %', missing;
  end if;
end $$;`);

for (const q of questions) {
  const tags = q.tags
    ? `array[${q.tags.split(';').map((t) => lit(t.trim())).filter((t) => t !== lit('')).join(', ')}]::text[]`
    : `'{}'::text[]`;
  const values = q.options
    .map((o) => `(${lit(o.body)}, ${o.key === q.correctKey}, ${o.ord})`)
    .join(',\n        ');

  chunks.push(`
with c as (
  select id from public.categories where slug = ${lit(q.category_slug)}
), q as (
  insert into public.questions
    (category_id, kind, difficulty, status, body, code_snippet, code_language,
     explanation, tags, source, source_url, source_licence)
  select c.id, ${lit(q.kind)}, ${lit(q.difficulty)}, 'in_review', ${lit(q.body)},
         ${opt(q.code_snippet)}, ${opt(q.code_language)}, ${lit(q.explanation)},
         ${tags}, ${lit(q.source)}, ${opt(q.source_url)}, ${opt(q.source_licence)}
  from c
  where not exists (
    select 1 from public.questions x
    where x.category_id = c.id and x.body = ${lit(q.body)}
  )
  returning id
)
insert into public.options (question_id, body, is_correct, sort_order)
select q.id, v.body, v.is_correct, v.ord
from q, (values ${values}) as v(body, is_correct, ord);`);
}

chunks.push(`
do $$
declare n integer;
begin
  select count(*) into n from public.questions where status = 'in_review';
  raise notice '% questions now awaiting review.', n;
  raise notice 'Approve them as staff, e.g.:';
  raise notice '  update public.questions set status = ''approved'', approved_by = auth.uid(), approved_at = now() where status = ''in_review'';';
end $$;`);
chunks.push('commit;');

const outPath =
  outFlag !== -1 && args[outFlag + 1]
    ? args[outFlag + 1]
    : join('supabase', 'imports', `${basename(csvPath).replace(/\.csv$/i, '')}-${new Date().toISOString().slice(0, 10)}.sql`);
const outAbs = isAbsolute(outPath) ? outPath : join(ROOT, outPath);

mkdirSync(dirname(outAbs), { recursive: true });
writeFileSync(outAbs, chunks.join('\n') + '\n');

console.log(`${questions.length} questions validated → ${outPath}`);
console.log('Apply with psql (see the header of that file).');
