-- Learn-Quize · seed question bank
--
-- Ten questions for each of the twelve launch categories. This is a working
-- fixture, not a launchable bank — ten questions is about ninety seconds of
-- play. It exists so the whole engine can be built and tested against real
-- content, and so the team can see the exact shape they are filling in.
--
--   supabase db reset          (runs migrations, then this file)
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Questions land as 'in_review', never 'approved'. The approval gate is the
-- product's whole quality story, and seeding around it would be the first
-- crack in it. The block at the bottom auto-approves only if a staff profile
-- already exists; otherwise it prints the one command you need.

begin;

create function pg_temp.seed_q(
  p_category   text,
  p_difficulty public.difficulty_level,
  p_body       text,
  p_explanation text,
  p_correct    text,
  p_options    text[],
  p_tags       text[] default '{}',
  p_code       text default null,
  p_lang       text default null
) returns void
language plpgsql
as $fn$
declare
  v_cat uuid;
  v_qid uuid;
  i     integer;
begin
  select id into v_cat from public.categories where slug = p_category;
  if v_cat is null then
    raise exception 'seed: unknown category %', p_category;
  end if;

  if not (p_correct = any(p_options)) then
    raise exception 'seed: correct answer is not one of the options for "%"', p_body;
  end if;

  insert into public.questions (
    category_id, difficulty, kind, status, body,
    code_snippet, code_language, explanation, tags, source
  )
  values (
    v_cat, p_difficulty,
    -- CASE resolves its own result type before the column's, so the enum cast
    -- has to be explicit here.
    (case when p_code is null then 'single_choice' else 'code_output' end)::public.question_kind,
    'in_review', p_body, p_code, p_lang, p_explanation, p_tags, 'seed'
  )
  returning id into v_qid;

  for i in 1 .. array_length(p_options, 1) loop
    insert into public.options (question_id, body, is_correct, sort_order)
    values (v_qid, p_options[i], p_options[i] = p_correct, i);
  end loop;
end
$fn$;

-- ============================================================ JavaScript

select pg_temp.seed_q('javascript', 'easy',
  'What does `typeof null` return?',
  'A bug from the first version of JavaScript. Null was represented with a type tag of 0 — the same tag used for objects — and changing it now would break too much existing code. Use `value === null` to test for null.',
  '"object"', array['"object"', '"null"', '"undefined"', '"number"'],
  array['types', 'quirks']);

select pg_temp.seed_q('javascript', 'medium',
  'What does this print?',
  'The `+` operator has no array overload, so both operands are converted to primitives first. Array.prototype.toString joins with commas, giving "1,2,3" and "4,5,6", which are then concatenated as strings.',
  '"1,2,34,5,6"',
  array['"1,2,34,5,6"', '[1,2,3,4,5,6]', '"123456"', 'TypeError'],
  array['operators', 'coercion'],
  'console.log([1, 2, 3] + [4, 5, 6]);', 'javascript');

select pg_temp.seed_q('javascript', 'easy',
  'What is the difference between `==` and `===`?',
  '`===` compares type and value with no conversion. `==` converts operands to a common type first, which produces surprises like `"" == 0` and `null == undefined` both being true. Default to `===`; reach for `==` only in the specific `x == null` idiom that catches both null and undefined.',
  '`==` converts types before comparing, `===` does not',
  array['`==` converts types before comparing, `===` does not',
        '`===` is faster but otherwise identical',
        '`==` only works on primitives',
        'They are identical — `===` is a style preference'],
  array['operators', 'coercion']);

select pg_temp.seed_q('javascript', 'medium',
  'What does this print?',
  'Each call to `counter()` creates a new scope, and the returned function closes over that scope''s `n`. The two counters are independent, so the first one prints 1 then 2.',
  '1 2 1',
  array['1 2 1', '1 2 3', '1 1 1', '0 1 0'],
  array['closures', 'scope'],
  'function counter() {
  let n = 0;
  return () => ++n;
}
const a = counter(), b = counter();
console.log(a(), a(), b());', 'javascript');

select pg_temp.seed_q('javascript', 'medium',
  'Why does accessing a `let` variable before its declaration throw, while `var` gives undefined?',
  'Both are hoisted, but `let` and `const` sit in the temporal dead zone from the start of the block until the declaration runs. Reading them there is a ReferenceError. `var` is initialised to undefined at hoist time, which hides bugs rather than surfacing them.',
  '`let` is in the temporal dead zone until its declaration executes',
  array['`let` is in the temporal dead zone until its declaration executes',
        '`let` is not hoisted at all',
        '`var` is function-scoped so it is always defined',
        '`let` declarations are evaluated lazily'],
  array['hoisting', 'scope']);

select pg_temp.seed_q('javascript', 'hard',
  'What does this print?',
  'Array.prototype.sort converts elements to strings and sorts lexicographically unless you pass a comparator. "10" sorts before "9" because "1" < "9". Always pass `(a, b) => a - b` for numbers.',
  '[1, 10, 9]',
  array['[1, 10, 9]', '[1, 9, 10]', '[10, 9, 1]', '[9, 10, 1]'],
  array['arrays', 'sorting'],
  'console.log([10, 1, 9].sort());', 'javascript');

select pg_temp.seed_q('javascript', 'medium',
  'How does `this` behave inside an arrow function?',
  'Arrow functions have no `this` binding of their own — they inherit it lexically from the enclosing scope at definition time. That is why they work well as callbacks but are wrong for object methods that need the receiver.',
  'It is inherited from the enclosing scope and cannot be rebound',
  array['It is inherited from the enclosing scope and cannot be rebound',
        'It refers to the arrow function itself',
        'It is always the global object',
        'It is set by whoever calls the function'],
  array['this', 'functions']);

select pg_temp.seed_q('javascript', 'medium',
  'How do `Promise.all` and `Promise.allSettled` differ?',
  '`Promise.all` rejects as soon as any input promise rejects, discarding the other results. `Promise.allSettled` always fulfils with one entry per promise, each tagged `status: "fulfilled"` or `"rejected"`. Use allSettled when partial success is still useful.',
  '`all` rejects on the first failure; `allSettled` always resolves with every outcome',
  array['`all` rejects on the first failure; `allSettled` always resolves with every outcome',
        '`allSettled` runs promises sequentially',
        '`all` waits for every promise, `allSettled` returns the first to finish',
        'They are the same; `allSettled` is the newer name'],
  array['promises', 'async']);

select pg_temp.seed_q('javascript', 'hard',
  'What order do these log in?',
  'Microtasks (promise callbacks) drain completely before the event loop moves on to macrotasks (timers). So the synchronous logs run first, then the resolved promise, then the zero-delay timeout.',
  'start end promise timeout',
  array['start end promise timeout', 'start end timeout promise',
        'start promise end timeout', 'start timeout promise end'],
  array['event-loop', 'async'],
  'console.log("start");
setTimeout(() => console.log("timeout"), 0);
Promise.resolve().then(() => console.log("promise"));
console.log("end");', 'javascript');

select pg_temp.seed_q('javascript', 'medium',
  'What does the object spread operator copy?',
  'Spread performs a shallow copy: top-level properties are copied, but nested objects are still shared references. Mutating `copy.nested.x` also changes `original.nested.x`. Use structuredClone() for a deep copy.',
  'Only the top level — nested objects stay shared by reference',
  array['Only the top level — nested objects stay shared by reference',
        'Everything, recursively',
        'Only enumerable string keys, deeply',
        'Nothing — it creates a proxy'],
  array['objects', 'immutability']);

-- ============================================================ TypeScript

select pg_temp.seed_q('typescript', 'easy',
  'How does `unknown` differ from `any`?',
  'Both accept any value, but `unknown` is not assignable to anything else until you narrow it with a type guard. `any` disables checking entirely and spreads silently through your code. Prefer `unknown` at boundaries like JSON.parse and fetch responses.',
  '`unknown` must be narrowed before use; `any` disables all checking',
  array['`unknown` must be narrowed before use; `any` disables all checking',
        '`unknown` only accepts primitives',
        'They are identical aliases',
        '`unknown` is a runtime value, `any` is compile-time only'],
  array['types', 'safety']);

select pg_temp.seed_q('typescript', 'medium',
  'What does `as const` do to an object literal?',
  'It makes every property readonly and narrows literal values to their exact type instead of widening them. `{ mode: "dark" }` becomes `{ readonly mode: "dark" }` rather than `{ mode: string }` — which is what makes it useful for building union types from data.',
  'Makes properties readonly and narrows values to literal types',
  array['Makes properties readonly and narrows values to literal types',
        'Freezes the object at runtime',
        'Converts it to an enum',
        'Marks it for constant folding by the compiler'],
  array['literals', 'inference']);

select pg_temp.seed_q('typescript', 'medium',
  'What is a discriminated union?',
  'A union where every member shares a literal-typed property — the discriminant — that identifies which member it is. Checking that property narrows the type in each branch, so the compiler knows exactly which fields exist.',
  'A union whose members share a literal property the compiler can narrow on',
  array['A union whose members share a literal property the compiler can narrow on',
        'A union of only primitive types',
        'A union where every member is a class',
        'A union that has been marked with the `discriminate` keyword'],
  array['unions', 'narrowing']);

select pg_temp.seed_q('typescript', 'medium',
  'What does `keyof typeof obj` produce?',
  '`typeof obj` gets the object''s type; `keyof` extracts its keys as a union of string literals. For `{ a: 1, b: 2 }` the result is `"a" | "b"` — the standard way to type a lookup key against a real object.',
  'A union of the object''s key names as string literals',
  array['A union of the object''s key names as string literals',
        'An array of the object''s keys at runtime',
        'The type of the object''s values',
        'A generic constraint on the object'],
  array['operators', 'generics']);

select pg_temp.seed_q('typescript', 'easy',
  'What does `Partial<T>` do?',
  'It maps over every property of T and marks it optional. `Required<T>` is its inverse. Both are built-in mapped types — useful for update payloads where any subset of fields may be present.',
  'Makes every property of T optional',
  array['Makes every property of T optional',
        'Makes every property of T readonly',
        'Picks the first half of T''s properties',
        'Allows T to be partially constructed at runtime'],
  array['utility-types']);

select pg_temp.seed_q('typescript', 'hard',
  'When does a function''s return type become `never`?',
  '`never` is the type of a value that cannot exist. A function returns `never` when it can never return normally — it always throws, or it loops forever. It is different from `void`, which means the function returns but produces no useful value.',
  'When the function never returns normally — it always throws or loops forever',
  array['When the function never returns normally — it always throws or loops forever',
        'When the function returns undefined',
        'When the function has no return statement',
        'When the function is async and never resolves'],
  array['types', 'never']);

select pg_temp.seed_q('typescript', 'medium',
  'What does `extends` mean in `function f<T extends { id: string }>(x: T)`?',
  'It constrains the generic: T can be any type as long as it has a string `id`. Inside the function you can safely read `x.id`, and the caller keeps the full precision of whatever they passed in — unlike declaring the parameter as `{ id: string }`, which would widen it.',
  'It constrains T to types that have a string `id` property',
  array['It constrains T to types that have a string `id` property',
        'It makes T inherit from a class',
        'It makes T optional',
        'It converts T to the given type'],
  array['generics', 'constraints']);

select pg_temp.seed_q('typescript', 'medium',
  'Why does assigning an object literal with an extra property fail, when assigning the same value through a variable succeeds?',
  'TypeScript uses structural typing, so extra properties are normally fine. But object literals get an excess property check on direct assignment, which catches typos like `colour` for `color`. Going through a variable skips that check.',
  'Object literals get an excess property check that variables do not',
  array['Object literals get an excess property check that variables do not',
        'Variables are nominally typed but literals are structurally typed',
        'The literal is evaluated at compile time',
        'Extra properties are always an error in both cases'],
  array['structural-typing', 'inference']);

select pg_temp.seed_q('typescript', 'hard',
  'What does the `satisfies` operator do that a type annotation does not?',
  '`satisfies` checks the value against a type without widening it. With `const c: Record<string, string> = {...}` you lose the specific keys; with `const c = {...} satisfies Record<string, string>` you get both the validation and the precise inferred type.',
  'Validates against a type while keeping the narrower inferred type',
  array['Validates against a type while keeping the narrower inferred type',
        'Asserts the type at runtime',
        'Is an alias for `as`',
        'Marks the value as readonly'],
  array['inference', 'operators']);

select pg_temp.seed_q('typescript', 'easy',
  'What is the practical difference between `interface` and `type`?',
  'They overlap heavily. `interface` supports declaration merging and is idiomatic for object shapes that others may extend. `type` can express unions, intersections, tuples, mapped and conditional types, which interfaces cannot. Pick either for a plain object; use `type` when you need more.',
  '`interface` merges across declarations; `type` can express unions and mapped types',
  array['`interface` merges across declarations; `type` can express unions and mapped types',
        '`interface` exists at runtime, `type` does not',
        '`type` is faster to compile',
        'There is no difference'],
  array['types', 'interfaces']);

-- ============================================================ React

select pg_temp.seed_q('react', 'easy',
  'What is the `key` prop for when rendering a list?',
  'It gives React a stable identity for each element across renders so it can match old children to new ones instead of re-creating them. Using the array index as a key breaks when the list reorders or items are inserted — component state ends up attached to the wrong row.',
  'It gives each item a stable identity so React can match elements across renders',
  array['It gives each item a stable identity so React can match elements across renders',
        'It sets the sort order of the list',
        'It is required for accessibility',
        'It caches the rendered output'],
  array['lists', 'reconciliation']);

select pg_temp.seed_q('react', 'medium',
  'What does the function returned from `useEffect` do?',
  'It is the cleanup. React runs it before the effect fires again and when the component unmounts. Subscriptions, timers and listeners belong there — without it, each re-run stacks another one on top.',
  'Cleans up before the next run and on unmount',
  array['Cleans up before the next run and on unmount',
        'Runs after the effect completes successfully',
        'Cancels the render if it returns false',
        'Provides the effect''s dependency list'],
  array['hooks', 'effects']);

select pg_temp.seed_q('react', 'medium',
  'What does this log when the button is clicked once?',
  'Both updates are computed from the same `count` captured in this render, so both evaluate to 1. Use the updater form — `setCount(c => c + 1)` — when the next value depends on the previous one.',
  '1',
  array['1', '2', '0', 'It throws'],
  array['state', 'batching'],
  'const [count, setCount] = useState(0);
function onClick() {
  setCount(count + 1);
  setCount(count + 1);
}
// after one click, what is count?', 'javascript');

select pg_temp.seed_q('react', 'medium',
  'When is `useMemo` actually worth adding?',
  'When the computation is genuinely expensive, or when the value is a dependency of another hook or a memoised child and must keep a stable reference. Wrapping cheap expressions costs more than it saves — the comparison and the extra memory are not free.',
  'When the computation is expensive or the reference must stay stable for a dependency',
  array['When the computation is expensive or the reference must stay stable for a dependency',
        'On every derived value, as a default',
        'Only inside class components',
        'Whenever the component re-renders more than once'],
  array['hooks', 'performance']);

select pg_temp.seed_q('react', 'hard',
  'A `setInterval` started in `useEffect` with `[]` deps always logs the initial state. Why?',
  'The effect ran once, so the callback closed over the state value from the first render and never sees a newer one. Fix it with the updater form of the setter, or with a ref that the effect reads at call time.',
  'The callback closed over state from the first render',
  array['The callback closed over state from the first render',
        'setInterval cannot read React state',
        'The effect is running on the server',
        'State updates are asynchronous so the log runs too early'],
  array['hooks', 'closures']);

select pg_temp.seed_q('react', 'medium',
  'When a Context value changes, which components re-render?',
  'Every consumer of that context, regardless of whether it uses the part of the value that changed. That is why passing a fresh object literal as the value re-renders everything on each parent render — memoise it, or split into several contexts.',
  'All consumers of that context',
  array['All consumers of that context',
        'Only the direct children of the Provider',
        'Only consumers that read the changed property',
        'Only components wrapped in React.memo'],
  array['context', 'performance']);

select pg_temp.seed_q('react', 'easy',
  'What makes an input "controlled"?',
  'Its displayed value comes from React state and every keystroke goes through an onChange handler. An uncontrolled input keeps its own value in the DOM and you read it via a ref. Controlled inputs are easier to validate and reset.',
  'Its value comes from state and changes flow through onChange',
  array['Its value comes from state and changes flow through onChange',
        'It has the `controlled` attribute set',
        'It is wrapped in a form element',
        'It uses a ref instead of state'],
  array['forms', 'state']);

select pg_temp.seed_q('react', 'medium',
  'Why does StrictMode call your component function twice in development?',
  'To surface side effects that do not belong in render. A correct component is a pure function of its props and state, so running it twice changes nothing. If double-invoking breaks something, that something was a bug. It does not happen in production builds.',
  'To surface impure render logic — it does not happen in production',
  array['To surface impure render logic — it does not happen in production',
        'To measure render performance',
        'Because effects always run twice',
        'To warm the component cache'],
  array['strict-mode', 'purity']);

select pg_temp.seed_q('react', 'easy',
  'What happens when you assign to `ref.current`?',
  'Nothing re-renders. Refs are a mutable box that survives renders without participating in them — right for timer ids, DOM nodes and previous values, wrong for anything the UI displays.',
  'The value changes but no re-render is triggered',
  array['The value changes but no re-render is triggered',
        'The component re-renders like with useState',
        'It throws in StrictMode',
        'The change is discarded on the next render'],
  array['refs', 'hooks']);

select pg_temp.seed_q('react', 'medium',
  'What is the difference between `useState(expensiveInit())` and `useState(expensiveInit)`?',
  'The first calls the function on every render and throws the result away after the first. The second passes the function itself — React calls it once, on mount. That is the lazy initialiser form.',
  'The second runs the initialiser only on mount; the first runs it every render',
  array['The second runs the initialiser only on mount; the first runs it every render',
        'They are identical',
        'The second never runs the function',
        'The first is required for objects'],
  array['hooks', 'performance']);

-- ============================================================ Node.js

select pg_temp.seed_q('nodejs', 'medium',
  'What is `__dirname` in an ES module?',
  'Undefined — it does not exist in ESM, and referencing it throws a ReferenceError. Derive it instead: `path.dirname(fileURLToPath(import.meta.url))`. This bites most often when converting a CommonJS file to ESM.',
  'It does not exist — referencing it throws',
  array['It does not exist — referencing it throws',
        'The project root directory',
        'The same as process.cwd()',
        'An empty string'],
  array['esm', 'modules']);

select pg_temp.seed_q('nodejs', 'medium',
  'Which runs first: `process.nextTick` or `setImmediate`?',
  'nextTick. Its queue is drained after the current operation completes and before the event loop continues, so it runs ahead of every phase including setImmediate''s check phase. Overusing nextTick can starve the loop entirely.',
  '`process.nextTick`',
  array['`process.nextTick`', '`setImmediate`',
        'Whichever was scheduled first', 'They run in parallel'],
  array['event-loop']);

select pg_temp.seed_q('nodejs', 'medium',
  'What problem does stream backpressure solve?',
  'It stops a fast producer from overwhelming a slow consumer. `writable.write()` returning false means the internal buffer is full; you should pause until the drain event. `pipe` and `pipeline` handle this for you, which is the main reason to prefer them over manual wiring.',
  'A fast producer overwhelming a slow consumer and exhausting memory',
  array['A fast producer overwhelming a slow consumer and exhausting memory',
        'Streams being read out of order',
        'Data corruption during transfer',
        'Blocking the event loop during writes'],
  array['streams', 'performance']);

select pg_temp.seed_q('nodejs', 'easy',
  'What does `"type": "module"` in package.json change?',
  'It makes Node treat `.js` files in that package as ES modules: `import`/`export` work, and `require`, `__dirname` and `__filename` do not. Files that still need CommonJS can use the `.cjs` extension.',
  '`.js` files are treated as ES modules instead of CommonJS',
  array['`.js` files are treated as ES modules instead of CommonJS',
        'It enables TypeScript support',
        'It marks the package as publishable',
        'It enables tree shaking in Node'],
  array['esm', 'packaging']);

select pg_temp.seed_q('nodejs', 'hard',
  'Why does CPU-bound work block a Node server?',
  'JavaScript runs on a single thread. A long synchronous computation occupies it, so no other request can be handled until it finishes — async I/O does not help, because the bottleneck is CPU, not waiting. Move it to a worker thread or a separate process.',
  'JavaScript executes on one thread, so long computations block all other requests',
  array['JavaScript executes on one thread, so long computations block all other requests',
        'Node queues CPU work behind I/O by design',
        'The garbage collector pauses during computation',
        'It does not — Node runs handlers in parallel'],
  array['concurrency', 'performance']);

select pg_temp.seed_q('nodejs', 'medium',
  'What is the error-first callback convention?',
  'Callbacks take `(err, result)`, with err null on success. It predates promises and is still all over the standard library. `util.promisify` converts such a function into one that returns a promise.',
  'The callback receives `(err, result)`, with err null on success',
  array['The callback receives `(err, result)`, with err null on success',
        'The callback receives `(result, err)`',
        'Errors are thrown rather than passed',
        'The callback is only called on error'],
  array['callbacks', 'conventions']);

select pg_temp.seed_q('nodejs', 'medium',
  'What is a `Buffer` used for?',
  'Holding raw binary data outside the V8 heap — file contents, network packets, crypto output. Strings in JavaScript are UTF-16, so treating binary data as a string corrupts it. Always specify an encoding when converting between the two.',
  'Holding raw binary data outside the V8 heap',
  array['Holding raw binary data outside the V8 heap',
        'Buffering console output',
        'Caching HTTP responses',
        'Queuing event loop callbacks'],
  array['buffers', 'binary']);

select pg_temp.seed_q('nodejs', 'medium',
  'What happens with a circular `require` in CommonJS?',
  'Node returns the partially populated exports object rather than looping forever. Whatever had not been assigned yet is undefined at that moment, which produces confusing "x is not a function" errors. Restructure the modules rather than working around it.',
  'You get a partially populated exports object',
  array['You get a partially populated exports object',
        'Node throws a circular dependency error',
        'The process hangs',
        'The second require is silently skipped and returns null'],
  array['modules', 'commonjs']);

select pg_temp.seed_q('nodejs', 'easy',
  'What does `worker_threads` give you that `cluster` does not?',
  'Threads inside one process that can share memory through SharedArrayBuffer, which suits CPU-bound work. `cluster` forks whole processes that share a server port, which suits scaling I/O-bound request handling across cores.',
  'Threads in one process that can share memory — good for CPU-bound work',
  array['Threads in one process that can share memory — good for CPU-bound work',
        'Automatic load balancing across cores',
        'Zero-downtime restarts',
        'Isolated memory per request'],
  array['concurrency', 'scaling']);

select pg_temp.seed_q('nodejs', 'hard',
  'What does an unhandled promise rejection do in modern Node?',
  'It terminates the process. Node changed the default from a warning to a fatal error, on the grounds that an application in an unknown state should not keep serving traffic. Attach a handler, or set an explicit `unhandledRejection` listener.',
  'It crashes the process by default',
  array['It crashes the process by default',
        'It logs a warning and continues',
        'It is silently ignored',
        'It retries the promise once'],
  array['async', 'errors']);

-- ============================================================ Python

select pg_temp.seed_q('python', 'medium',
  'What does this print?',
  'Default arguments are evaluated once, when the function is defined — not on each call. The same list is reused and keeps growing. The fix is `def add(x, items=None)` and creating the list inside.',
  '[1] [1, 2]',
  array['[1] [1, 2]', '[1] [2]', '[1, 2] [1, 2]', 'It raises TypeError'],
  array['functions', 'gotchas'],
  'def add(x, items=[]):
    items.append(x)
    return items

print(add(1), add(2))', 'python');

select pg_temp.seed_q('python', 'easy',
  'What is the difference between `is` and `==`?',
  '`==` compares values via `__eq__`; `is` compares identity — whether both names point at the same object. Small ints and short strings are interned, so `is` sometimes appears to work on them by accident. Use `is` only for None, True and False.',
  '`==` compares values, `is` compares object identity',
  array['`==` compares values, `is` compares object identity',
        'They are the same for all built-in types',
        '`is` is a faster `==`',
        '`is` works only on numbers'],
  array['operators', 'identity']);

select pg_temp.seed_q('python', 'medium',
  'What does the GIL prevent?',
  'The Global Interpreter Lock allows only one thread to execute Python bytecode at a time, so threads give no speedup for CPU-bound work. I/O-bound work still benefits, because the lock is released while waiting. For CPU parallelism use multiprocessing.',
  'Two threads executing Python bytecode simultaneously',
  array['Two threads executing Python bytecode simultaneously',
        'Any use of threads at all',
        'Memory being shared between processes',
        'Recursive function calls beyond a depth limit'],
  array['concurrency', 'gil']);

select pg_temp.seed_q('python', 'easy',
  'What is the practical difference between a list and a tuple?',
  'Lists are mutable, tuples are not. Immutability makes tuples hashable, so they can be dictionary keys or set members, and it signals that the contents are a fixed record rather than a growable collection.',
  'Lists are mutable; tuples are immutable and therefore hashable',
  array['Lists are mutable; tuples are immutable and therefore hashable',
        'Tuples can only hold one type',
        'Lists are faster for every operation',
        'Tuples cannot be iterated'],
  array['data-structures']);

select pg_temp.seed_q('python', 'medium',
  'What does a generator give you over a list?',
  'It produces values one at a time instead of building the whole sequence in memory, so it works on data larger than RAM and starts yielding immediately. The trade-off is that you can only iterate it once and cannot index it.',
  'Values produced lazily, so memory stays constant regardless of length',
  array['Values produced lazily, so memory stays constant regardless of length',
        'Faster random access by index',
        'Automatic parallel execution',
        'Type checking of yielded values'],
  array['generators', 'memory']);

select pg_temp.seed_q('python', 'medium',
  'What is the difference between a shallow and a deep copy?',
  '`copy.copy` duplicates the outer container but shares the nested objects, so mutating a nested item shows through both. `copy.deepcopy` recursively duplicates everything. Slicing a list — `lst[:]` — is a shallow copy.',
  'Shallow copies the container but shares nested objects; deep copies recursively',
  array['Shallow copies the container but shares nested objects; deep copies recursively',
        'Shallow copies only the first element',
        'Deep copy is the same but faster',
        'Shallow copy returns a read-only view'],
  array['copying', 'mutability']);

select pg_temp.seed_q('python', 'easy',
  'What does `**kwargs` collect in a function signature?',
  'Any keyword arguments not matched by a named parameter, as a dict. `*args` does the same for extra positional arguments, as a tuple. The names are convention — the `*` and `**` are what matter.',
  'Extra keyword arguments, as a dict',
  array['Extra keyword arguments, as a dict',
        'Extra positional arguments, as a tuple',
        'All arguments, as a list',
        'Default values for missing parameters'],
  array['functions', 'arguments']);

select pg_temp.seed_q('python', 'medium',
  'Are regular dictionaries ordered?',
  'Yes — insertion order has been guaranteed since Python 3.7. `collections.OrderedDict` still exists for its extra methods like move_to_end and its order-sensitive equality, but you no longer need it just to preserve order.',
  'Yes, insertion order is guaranteed since Python 3.7',
  array['Yes, insertion order is guaranteed since Python 3.7',
        'No, dictionaries are always unordered',
        'Only if you use OrderedDict',
        'Only for string keys'],
  array['dicts', 'ordering']);

select pg_temp.seed_q('python', 'hard',
  'What does this print?',
  'The lambdas all close over the same variable `i`, not its value at creation time. By the time they run, the loop has finished and `i` is 2. Bind it with a default argument — `lambda i=i: i` — to capture per iteration.',
  '[2, 2, 2]',
  array['[2, 2, 2]', '[0, 1, 2]', '[0, 0, 0]', '[3, 3, 3]'],
  array['closures', 'gotchas'],
  'fns = [lambda: i for i in range(3)]
print([f() for f in fns])', 'python');

select pg_temp.seed_q('python', 'easy',
  'What does a list comprehension give you over an equivalent for loop?',
  'It is an expression, so it evaluates to a list you can pass or assign directly, and the interpreter can run it faster than repeated `.append` calls. Readability drops sharply once you nest more than one loop or add several conditions.',
  'A single expression that builds the list, usually faster than repeated append',
  array['A single expression that builds the list, usually faster than repeated append',
        'Automatic deduplication of results',
        'Lazy evaluation like a generator',
        'Parallel execution across cores'],
  array['comprehensions', 'idioms']);

-- ============================================================ SQL

select pg_temp.seed_q('sql', 'easy',
  'What does a LEFT JOIN return that an INNER JOIN does not?',
  'Rows from the left table that have no match on the right, with the right side''s columns filled with NULL. An INNER JOIN drops them entirely. Filtering a LEFT JOIN''s right-hand columns in the WHERE clause silently turns it back into an inner join — put those conditions in the ON clause instead.',
  'Unmatched left-hand rows, with NULLs for the right-hand columns',
  array['Unmatched left-hand rows, with NULLs for the right-hand columns',
        'Duplicate rows removed',
        'Rows sorted by the join key',
        'Only the columns from the left table'],
  array['joins']);

select pg_temp.seed_q('sql', 'medium',
  'A query filtering on `WHERE lower(email) = ''a@b.com''` ignores the index on `email`. Why?',
  'A B-tree index stores the column exactly as written. Wrapping the column in a function means the indexed values no longer match what is being compared, so the planner falls back to a sequential scan. Create an expression index — `CREATE INDEX ON users (lower(email))` — or store the value already normalised.',
  'The index stores the raw column value, not `lower(email)`',
  array['The index stores the raw column value, not `lower(email)`',
        'LOWER() is not allowed in a WHERE clause',
        'The planner never uses an index when any function appears in the query',
        'String comparison always forces a sequential scan'],
  array['indexes', 'query-planning']);

select pg_temp.seed_q('sql', 'medium',
  'What is the difference between WHERE and HAVING?',
  'WHERE filters rows before grouping; HAVING filters groups afterwards, so it can reference aggregates like COUNT(*). Putting a non-aggregate condition in HAVING usually works but forces the database to group rows it could have discarded earlier.',
  'WHERE filters rows before grouping, HAVING filters groups after aggregation',
  array['WHERE filters rows before grouping, HAVING filters groups after aggregation',
        'HAVING is the older syntax for WHERE',
        'WHERE works on joins, HAVING works on single tables',
        'HAVING runs before WHERE'],
  array['aggregation']);

select pg_temp.seed_q('sql', 'medium',
  'What does `WHERE status = NULL` match?',
  'Nothing. NULL means unknown, and any comparison with it yields unknown rather than true — so no row passes the filter. Use `IS NULL` and `IS NOT NULL`. The same trap catches `NOT IN` against a list containing NULL, which returns no rows at all.',
  'Nothing — comparisons with NULL are never true',
  array['Nothing — comparisons with NULL are never true',
        'Every row where status is null',
        'Every row in the table',
        'It raises a syntax error'],
  array['null', 'gotchas']);

select pg_temp.seed_q('sql', 'easy',
  'How do COUNT(*) and COUNT(column) differ?',
  'COUNT(*) counts rows. COUNT(column) counts rows where that column is not NULL. On a column with no nulls they agree, which is why the difference tends to be discovered by a wrong number in a report.',
  'COUNT(column) skips rows where the column is NULL',
  array['COUNT(column) skips rows where the column is NULL',
        'They are identical',
        'COUNT(*) is an error without GROUP BY',
        'COUNT(column) counts distinct values'],
  array['aggregation', 'null']);

select pg_temp.seed_q('sql', 'medium',
  'What does UNION do that UNION ALL does not?',
  'UNION removes duplicate rows, which requires sorting or hashing the whole result. UNION ALL just concatenates. If you know the inputs are disjoint, UNION ALL is meaningfully faster.',
  'It removes duplicate rows, at the cost of a sort or hash',
  array['It removes duplicate rows, at the cost of a sort or hash',
        'It sorts the result',
        'It combines columns rather than rows',
        'It allows different column counts in each branch'],
  array['set-operations', 'performance']);

select pg_temp.seed_q('sql', 'hard',
  'What is an N+1 query problem?',
  'One query fetches N rows, then the code runs another query per row — N+1 round trips where a single join or a batched `WHERE id = ANY(...)` would do. It is invisible in development with ten rows and fatal in production with ten thousand.',
  'Fetching N rows, then issuing one more query per row instead of joining',
  array['Fetching N rows, then issuing one more query per row instead of joining',
        'A query that returns one row too many',
        'A join that produces N+1 duplicate rows',
        'An index that has to be rebuilt after N inserts'],
  array['performance', 'orm']);

select pg_temp.seed_q('sql', 'medium',
  'What does a transaction''s isolation level control?',
  'What one transaction can see of another''s uncommitted or concurrent work — dirty reads, non-repeatable reads and phantoms. Higher isolation means fewer anomalies and more blocking or serialisation failures.',
  'Which concurrency anomalies a transaction can observe',
  array['Which concurrency anomalies a transaction can observe',
        'How long a transaction may run before timing out',
        'Whether the transaction can be rolled back',
        'How many rows a transaction may lock'],
  array['transactions', 'concurrency']);

select pg_temp.seed_q('sql', 'easy',
  'How does a PRIMARY KEY differ from a UNIQUE constraint?',
  'A primary key is unique and NOT NULL, and there is at most one per table — it is the row''s identity. A unique constraint enforces uniqueness but generally permits nulls, and a table can have several.',
  'A primary key is also NOT NULL and there is only one per table',
  array['A primary key is also NOT NULL and there is only one per table',
        'A unique constraint does not create an index',
        'A primary key must be an integer',
        'They are identical in every respect'],
  array['constraints', 'schema']);

select pg_temp.seed_q('sql', 'medium',
  'Why can''t you select a non-aggregated column that is not in the GROUP BY?',
  'Each output row represents a group of input rows, and the database has no way to choose which of the grouped values to show. Aggregate it, add it to the GROUP BY, or use a window function if you wanted the detail rows kept.',
  'The group covers several rows, so there is no single value to return',
  array['The group covers several rows, so there is no single value to return',
        'GROUP BY only supports numeric columns',
        'The column has to be indexed first',
        'It is allowed — only ORDER BY has that restriction'],
  array['aggregation', 'grouping']);

-- ============================================================ ML Fundamentals

select pg_temp.seed_q('ml-fundamentals', 'easy',
  'A model scores 99% on training data and 62% on held-out data. What is happening?',
  'A large gap between training and validation performance is the definition of overfitting: the model has memorised patterns specific to the training set rather than ones that generalise. Usual responses are more data, regularisation, or a simpler model.',
  'Overfitting',
  array['Overfitting', 'Underfitting', 'Data leakage', 'Vanishing gradients'],
  array['generalisation', 'evaluation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'What is the bias-variance trade-off?',
  'Bias is error from a model too simple to capture the pattern; variance is error from a model so flexible it fits noise. Reducing one typically raises the other, and total error is minimised somewhere between — which is why "use the most powerful model" is not a strategy.',
  'Simpler models underfit, more flexible models fit noise, and total error is minimised between them',
  array['Simpler models underfit, more flexible models fit noise, and total error is minimised between them',
        'A trade-off between training time and accuracy',
        'A trade-off between precision and recall',
        'A trade-off between model size and inference cost'],
  array['theory', 'generalisation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'When does high recall matter more than high precision?',
  'When missing a positive is far more costly than a false alarm — disease screening, fraud detection, safety alerts. You accept extra false positives to catch nearly every true case, typically with a cheaper second-stage check behind it.',
  'When missing a true positive is much more costly than a false alarm',
  array['When missing a true positive is much more costly than a false alarm',
        'When the dataset is perfectly balanced',
        'When the model is small',
        'When you are optimising for inference speed'],
  array['metrics', 'evaluation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'A fraud model is 99.9% accurate on data where 0.1% of transactions are fraud. Is it good?',
  'Not necessarily — predicting "not fraud" every time scores 99.9% and catches nothing. On imbalanced data accuracy is close to meaningless; look at precision, recall, and the precision-recall curve instead.',
  'No — always predicting the majority class would score the same',
  array['No — always predicting the majority class would score the same',
        'Yes, 99.9% is excellent by any measure',
        'Only if the test set is large',
        'Yes, provided the model is a neural network'],
  array['metrics', 'imbalance']);

select pg_temp.seed_q('ml-fundamentals', 'hard',
  'What is data leakage?',
  'Information available at training time that will not exist at prediction time — a feature derived from the target, or scaling fitted on the full dataset before splitting. It produces excellent validation scores and a model that fails in production.',
  'Training on information that will not be available at prediction time',
  array['Training on information that will not be available at prediction time',
        'Losing rows during preprocessing',
        'Exposing training data through the model API',
        'Memory leaks during a long training run'],
  array['pitfalls', 'evaluation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'How do L1 and L2 regularisation differ in effect?',
  'L1 (lasso) drives some weights exactly to zero, so it performs feature selection and yields sparse models. L2 (ridge) shrinks weights smoothly toward zero without eliminating them, which usually generalises better when most features carry some signal.',
  'L1 can zero out weights entirely; L2 shrinks them smoothly',
  array['L1 can zero out weights entirely; L2 shrinks them smoothly',
        'L1 is for classification, L2 for regression',
        'L2 always produces sparser models',
        'They differ only in computational cost'],
  array['regularisation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'What does k-fold cross-validation buy you over a single train/test split?',
  'Every observation is used for validation exactly once, so the performance estimate depends far less on which rows happened to land in the test set. The cost is k times the training compute.',
  'A performance estimate that is less sensitive to a lucky or unlucky split',
  array['A performance estimate that is less sensitive to a lucky or unlucky split',
        'A model that trains k times faster',
        'Automatic hyperparameter tuning',
        'Immunity to overfitting'],
  array['validation']);

select pg_temp.seed_q('ml-fundamentals', 'easy',
  'Which of these is a hyperparameter rather than a parameter?',
  'Parameters are learned from data during training — weights and biases. Hyperparameters are set before training and control how learning happens: learning rate, tree depth, number of layers, regularisation strength.',
  'Learning rate',
  array['Learning rate', 'Layer weights', 'Bias terms', 'Output logits'],
  array['training', 'terminology']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'Why does feature scaling matter for gradient descent?',
  'Features on wildly different scales produce an elongated loss surface, so the gradient points across the valley rather than along it and convergence crawls. Standardising puts features on comparable footing. Tree-based models do not care, since they split on thresholds.',
  'Unscaled features distort the loss surface and slow convergence',
  array['Unscaled features distort the loss surface and slow convergence',
        'It reduces the number of features needed',
        'It is required for tree-based models',
        'It prevents overfitting directly'],
  array['preprocessing', 'optimisation']);

select pg_temp.seed_q('ml-fundamentals', 'medium',
  'In a confusion matrix, what is a false negative?',
  'A positive case the model called negative — the fraud it let through, the disease it missed. Recall is exactly the fraction of true positives it did not miss.',
  'A positive case predicted as negative',
  array['A positive case predicted as negative',
        'A negative case predicted as positive',
        'A case the model refused to classify',
        'A duplicate row in the test set'],
  array['metrics']);

-- ============================================================ Deep Learning

select pg_temp.seed_q('deep-learning', 'easy',
  'What does backpropagation compute?',
  'The gradient of the loss with respect to every weight, by applying the chain rule backwards through the network. It is not the learning rule itself — an optimiser like SGD or Adam decides what to do with those gradients.',
  'The gradient of the loss with respect to each weight',
  array['The gradient of the loss with respect to each weight',
        'The forward activations of each layer',
        'The optimal learning rate',
        'The final prediction'],
  array['training', 'gradients']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What is the vanishing gradient problem?',
  'Gradients shrink as they propagate back through many layers, so early layers barely update and effectively stop learning. Saturating activations like sigmoid make it worse; ReLU, residual connections and normalisation are the standard mitigations.',
  'Gradients shrink toward zero in early layers, so they stop learning',
  array['Gradients shrink toward zero in early layers, so they stop learning',
        'Gradients grow without bound and produce NaNs',
        'The loss stops being computed',
        'The model runs out of memory during backprop'],
  array['training', 'gradients']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What does dropout do during training?',
  'It randomly zeroes a fraction of activations on each forward pass, so the network cannot rely on any single unit and must learn redundant representations. It is disabled at inference — forgetting to switch to eval mode is a classic source of noisy predictions.',
  'Randomly zeroes activations so the network cannot depend on any one unit',
  array['Randomly zeroes activations so the network cannot depend on any one unit',
        'Removes layers that are not contributing',
        'Drops training examples with high loss',
        'Reduces the learning rate over time'],
  array['regularisation']);

select pg_temp.seed_q('deep-learning', 'medium',
  'The loss oscillates wildly and sometimes becomes NaN. What is the most likely cause?',
  'A learning rate too high. Steps overshoot the minimum and amplify, until values overflow. Lower it, add gradient clipping, or use a warmup schedule before concluding the architecture is wrong.',
  'The learning rate is too high',
  array['The learning rate is too high',
        'The learning rate is too low',
        'The batch size is too large',
        'There is not enough training data'],
  array['training', 'debugging']);

select pg_temp.seed_q('deep-learning', 'easy',
  'What is one epoch?',
  'One full pass over the training set. An iteration is one weight update, on one batch. With 1,000 examples and a batch size of 100, an epoch is 10 iterations.',
  'One complete pass through the entire training set',
  array['One complete pass through the entire training set',
        'One weight update',
        'One forward pass on a single example',
        'One batch of data'],
  array['terminology', 'training']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What does a softmax output layer produce?',
  'A probability distribution over classes — values in (0,1) summing to 1. It is paired with cross-entropy loss for single-label classification. For multi-label problems, where classes are independent, use per-class sigmoids instead.',
  'A probability distribution over classes that sums to 1',
  array['A probability distribution over classes that sums to 1',
        'Independent probabilities per class',
        'Raw unbounded scores',
        'The index of the predicted class'],
  array['architecture', 'classification']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What is the point of a convolutional layer over a fully connected one for images?',
  'It applies the same small filter across the whole image, so it needs far fewer parameters and detects a feature wherever it appears. That weight sharing and translation equivariance is exactly the structure images have and dense layers ignore.',
  'Shared local filters — far fewer parameters and translation equivariance',
  array['Shared local filters — far fewer parameters and translation equivariance',
        'It guarantees the network cannot overfit',
        'It removes the need for an activation function',
        'It processes pixels in parallel, unlike dense layers'],
  array['cnn', 'architecture']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What does batch normalisation do?',
  'Normalises each layer''s inputs using batch statistics, then rescales with learned parameters. It stabilises training, allows higher learning rates, and has a mild regularising effect. At inference it uses running averages rather than batch statistics.',
  'Normalises layer inputs using batch statistics, stabilising training',
  array['Normalises layer inputs using batch statistics, stabilising training',
        'Sorts the batch by loss before the update',
        'Ensures every batch has the same size',
        'Normalises the final output probabilities'],
  array['normalisation', 'training']);

select pg_temp.seed_q('deep-learning', 'easy',
  'Why is ReLU usually preferred over sigmoid for hidden layers?',
  'Sigmoid saturates at both ends, where its gradient is near zero, which stalls learning in deep stacks. ReLU has a constant gradient for positive inputs, is cheap to compute, and produces sparse activations.',
  'It does not saturate for positive inputs, so gradients keep flowing',
  array['It does not saturate for positive inputs, so gradients keep flowing',
        'It outputs probabilities directly',
        'It is differentiable everywhere, unlike sigmoid',
        'It bounds activations, preventing overflow'],
  array['activations']);

select pg_temp.seed_q('deep-learning', 'medium',
  'What is transfer learning?',
  'Starting from a model trained on a large general dataset and adapting it to your task — often by freezing early layers and retraining the head. Early layers learn broadly useful features, so you need far less data and compute than training from scratch.',
  'Reusing a model pretrained on a large dataset and adapting it to a new task',
  array['Reusing a model pretrained on a large dataset and adapting it to a new task',
        'Moving a model between GPUs',
        'Converting a model to a different framework',
        'Training two models simultaneously on shared data'],
  array['training', 'pretraining']);

-- ============================================================ LLMs & Prompting

select pg_temp.seed_q('llms-prompting', 'easy',
  'What is a token?',
  'The unit a model actually reads — usually a subword fragment, not a word or a character. Common words are one token; rare words, code and non-English text split into several. Cost and context limits are measured in tokens, so counting words underestimates both.',
  'A subword fragment — the unit the model actually processes',
  array['A subword fragment — the unit the model actually processes',
        'One word', 'One character', 'One sentence'],
  array['fundamentals', 'cost']);

select pg_temp.seed_q('llms-prompting', 'easy',
  'What does the context window limit?',
  'The total tokens the model can attend to at once — the prompt, the conversation history, retrieved documents, and the response together. Exceeding it means something gets dropped or the request is rejected; it is not a limit on output alone.',
  'The combined size of input and output the model can handle in one request',
  array['The combined size of input and output the model can handle in one request',
        'How many requests you can send per minute',
        'The maximum length of the response only',
        'How long the model retains data after a request'],
  array['fundamentals', 'context']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What is retrieval-augmented generation for?',
  'Fetching relevant documents at query time and putting them in the prompt, so answers are grounded in a source the model did not memorise. It handles private, current or changing data without retraining, and makes citation possible.',
  'Grounding answers in fetched documents rather than parametric memory',
  array['Grounding answers in fetched documents rather than parametric memory',
        'Training the model on your documents',
        'Compressing prompts to fit the context window',
        'Caching previous responses for reuse'],
  array['rag', 'architecture']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What does raising the temperature do?',
  'It flattens the probability distribution over next tokens, so lower-probability choices get picked more often — more varied output, less predictability. Near zero the model becomes close to deterministic. It does not change what the model knows.',
  'Flattens the token distribution, producing more varied and less predictable output',
  array['Flattens the token distribution, producing more varied and less predictable output',
        'Increases how much the model reasons before answering',
        'Raises the maximum output length',
        'Makes the model more accurate'],
  array['sampling', 'parameters']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'Why do models produce confident but wrong answers?',
  'They are trained to produce plausible continuations, not to represent certainty. A fluent wrong answer and a fluent right answer look the same from the inside. Grounding in retrieved sources and asking for citations are the practical mitigations.',
  'They optimise for plausible continuations, which is not the same as being correct',
  array['They optimise for plausible continuations, which is not the same as being correct',
        'Their training data was entirely incorrect',
        'The temperature is always set too high',
        'They run out of context and guess'],
  array['limitations', 'reliability']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What is few-shot prompting?',
  'Including a handful of worked examples in the prompt so the model infers the pattern — format, tone, level of detail — from them. It is often more effective than describing the pattern in prose, especially for output shape.',
  'Putting several worked examples in the prompt to demonstrate the pattern',
  array['Putting several worked examples in the prompt to demonstrate the pattern',
        'Training on a small dataset',
        'Sending several requests and picking the best',
        'Limiting the model to a few output tokens'],
  array['prompting', 'technique']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What is an embedding?',
  'A vector representation of text where semantic similarity corresponds to closeness in the vector space. It is what makes retrieval work: embed the query, find the nearest document vectors, put those documents in the prompt.',
  'A vector where semantically similar text lands close together',
  array['A vector where semantically similar text lands close together',
        'A compressed copy of the original text',
        'The model''s internal weights for a token',
        'A hash used to deduplicate documents'],
  array['embeddings', 'rag']);

select pg_temp.seed_q('llms-prompting', 'hard',
  'When is fine-tuning the right answer rather than better prompting or retrieval?',
  'When you need a consistent behaviour, format or style that examples in the prompt cannot reliably produce, and you have enough labelled examples. Fine-tuning is a poor way to add knowledge — that is what retrieval is for, and it stays current without retraining.',
  'When you need consistent behaviour or format that prompting cannot reliably produce',
  array['When you need consistent behaviour or format that prompting cannot reliably produce',
        'Whenever the model lacks specific facts',
        'Whenever prompts get long',
        'Whenever you want lower latency'],
  array['fine-tuning', 'architecture']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What does the attention mechanism let a transformer do?',
  'Weigh the relevance of every other token when producing a representation for the current one, regardless of distance. That is what removed the sequential bottleneck of recurrent models and made long-range dependencies tractable.',
  'Weigh every other token by relevance, regardless of how far apart they are',
  array['Weigh every other token by relevance, regardless of how far apart they are',
        'Process tokens strictly in order',
        'Compress the input to a fixed-size vector',
        'Select which layers to activate per token'],
  array['transformers', 'architecture']);

select pg_temp.seed_q('llms-prompting', 'medium',
  'What is prompt injection?',
  'Untrusted content — a fetched web page, a user-supplied document, a tool result — containing instructions the model then follows as if they came from you. The defence is treating all retrieved content as data, never as instructions, and constraining what tools can do.',
  'Untrusted content carrying instructions the model then obeys',
  array['Untrusted content carrying instructions the model then obeys',
        'Sending too many tokens in one prompt',
        'Injecting the system prompt into the response',
        'A SQL injection performed by the model'],
  array['security', 'agents']);

-- ============================================================ Market Basics

select pg_temp.seed_q('market-basics', 'easy',
  'You place a market order to buy when the ask is 100.50 and the bid is 100.00. What do you most likely pay?',
  'A market buy crosses the spread and executes against the best available ask. You pay 100.50 and immediately hold something you could only sell for 100.00 — that 0.50 is a real cost on every round trip. A limit order avoids it but risks not filling.',
  'Around 100.50, the ask',
  array['Around 100.50, the ask', 'Around 100.00, the bid',
        'Exactly 100.25, the midpoint', 'The previous closing price'],
  array['order-types', 'spread']);

select pg_temp.seed_q('market-basics', 'easy',
  'What does a limit order guarantee?',
  'Your price, or better — never worse. What it does not guarantee is execution: if the market never reaches your limit, nothing happens. A market order guarantees the opposite, execution at whatever price is available.',
  'The price, but not that it will fill',
  array['The price, but not that it will fill',
        'That it will fill, but not at what price',
        'Both price and execution',
        'Execution at the closing price'],
  array['order-types']);

select pg_temp.seed_q('market-basics', 'medium',
  'What does it mean to be short a stock?',
  'You borrowed shares, sold them, and owe them back. You profit if the price falls and can buy them back cheaper. Losses are theoretically unbounded, because there is no ceiling on how high a price can go — unlike a long position, which can only fall to zero.',
  'You borrowed and sold shares, and profit if the price falls',
  array['You borrowed and sold shares, and profit if the price falls',
        'You own fewer shares than you intended to buy',
        'You hold the position for a short time',
        'You bought with borrowed money'],
  array['positions', 'risk']);

select pg_temp.seed_q('market-basics', 'medium',
  'What does market liquidity describe?',
  'How easily you can trade size without moving the price. A liquid market has tight spreads and deep order books, so a large order fills near the quoted price. In an illiquid one, the same order walks the book and gets a much worse average fill.',
  'How much you can trade without materially moving the price',
  array['How much you can trade without materially moving the price',
        'How much cash a company holds',
        'The total number of shares outstanding',
        'How quickly a broker settles a trade'],
  array['microstructure']);

select pg_temp.seed_q('market-basics', 'medium',
  'What is slippage?',
  'The difference between the price you expected and the price you got. It comes from the spread, from the market moving between decision and execution, and from large orders consuming several levels of the book. Backtests that ignore it overstate returns.',
  'The gap between your expected price and your actual fill',
  array['The gap between your expected price and your actual fill',
        'The broker''s commission',
        'The overnight financing charge',
        'The difference between bid and ask'],
  array['execution', 'costs']);

select pg_temp.seed_q('market-basics', 'easy',
  'What is a company''s market capitalisation?',
  'Share price multiplied by shares outstanding — the market''s valuation of the equity. It says nothing about debt, which is why enterprise value exists, and nothing about whether the price is justified.',
  'Share price times shares outstanding',
  array['Share price times shares outstanding',
        'Total assets minus total liabilities',
        'Annual revenue times a sector multiple',
        'The amount raised at IPO'],
  array['valuation']);

select pg_temp.seed_q('market-basics', 'medium',
  'What typically happens to a share price on the ex-dividend date?',
  'It opens lower by roughly the dividend amount. The cash is leaving the company, so the shares are worth that much less — buying just before the date to "capture" the dividend does not create value by itself.',
  'It drops by approximately the dividend amount',
  array['It drops by approximately the dividend amount',
        'It rises by the dividend amount',
        'It is unaffected',
        'Trading is suspended for the day'],
  array['dividends']);

select pg_temp.seed_q('market-basics', 'medium',
  'What does a stop-loss order do?',
  'It becomes a market order once the price reaches your trigger, closing the position. Because it converts to a market order, the fill can be materially worse than the trigger in a fast or gapping market — it caps intent, not outcome.',
  'Triggers a market order at your stop price, so the fill may be worse',
  array['Triggers a market order at your stop price, so the fill may be worse',
        'Guarantees you exit at exactly the stop price',
        'Prevents the position from ever losing money',
        'Cancels all your other open orders'],
  array['order-types', 'risk']);

select pg_temp.seed_q('market-basics', 'easy',
  'What is the bid-ask spread?',
  'The gap between the highest price a buyer will pay and the lowest a seller will accept. It is the market maker''s compensation and your immediate cost of entry — cross it twice and a round trip starts at a loss.',
  'The gap between the best buy price and the best sell price',
  array['The gap between the best buy price and the best sell price',
        'The difference between today''s open and close',
        'The broker''s commission per trade',
        'The range between the day''s high and low'],
  array['microstructure', 'costs']);

select pg_temp.seed_q('market-basics', 'medium',
  'What does T+1 settlement mean?',
  'The trade legally completes one business day after execution — that is when cash and securities actually change hands. Your position and profit or loss exist from the moment of execution; settlement is the back-office leg behind it.',
  'The trade settles one business day after it is executed',
  array['The trade settles one business day after it is executed',
        'The order must be filled within one day',
        'You may hold the position for one day',
        'Prices update once per day'],
  array['settlement']);

-- ============================================================ Technical Analysis

select pg_temp.seed_q('technical-analysis', 'easy',
  'What is a support level?',
  'A price area where buying has repeatedly been strong enough to stop a decline. It is a zone rather than an exact number, and it stops being support once price closes convincingly below it — at which point it often acts as resistance.',
  'A price area where buying has repeatedly halted declines',
  array['A price area where buying has repeatedly halted declines',
        'The lowest price ever traded',
        'The price at which a company buys back shares',
        'A level set by the exchange to halt trading'],
  array['levels']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'What is the fundamental limitation of any moving average?',
  'It is computed from past prices, so it always lags. It describes the trend that has already happened rather than predicting the next one, which is why moving-average crossovers whipsaw badly in sideways markets.',
  'It lags — it describes past price, not future price',
  array['It lags — it describes past price, not future price',
        'It only works on daily charts',
        'It cannot be used on volatile instruments',
        'It requires at least a year of data'],
  array['indicators', 'trend']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'RSI above 70 is often called "overbought". What does that actually tell you?',
  'That price has risen quickly relative to recent history — nothing more. In a strong trend RSI can sit above 70 for weeks while price keeps climbing. Treating it as an automatic sell signal is one of the most reliable ways to lose money in a bull market.',
  'That momentum has been strong recently — it is not a sell signal on its own',
  array['That momentum has been strong recently — it is not a sell signal on its own',
        'That the price will fall imminently',
        'That the instrument is fundamentally overvalued',
        'That volume has exceeded its average'],
  array['indicators', 'momentum']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'Why does volume matter when a price breaks out of a range?',
  'Volume shows participation. A breakout on heavy volume suggests real demand behind the move; one on thin volume is more easily reversed and more likely to be a false break. Volume confirms, it does not lead.',
  'It indicates how much real participation is behind the move',
  array['It indicates how much real participation is behind the move',
        'It predicts the size of the move',
        'It determines the spread',
        'It sets the stop-loss distance'],
  array['volume', 'breakouts']);

select pg_temp.seed_q('technical-analysis', 'easy',
  'On a candlestick, what does the body represent?',
  'The distance between the open and the close. The wicks show the high and low that were reached but not held. A long body means one side controlled the period; a small body with long wicks means neither did.',
  'The range between the open and the close',
  array['The range between the open and the close',
        'The full high-to-low range',
        'The traded volume',
        'The gap from the previous close'],
  array['candlesticks']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'What defines an uptrend in classical technical analysis?',
  'A sequence of higher highs and higher lows. The definition matters because it gives an objective invalidation point: the trend is broken when price makes a lower low, not when it feels toppy.',
  'A sequence of higher highs and higher lows',
  array['A sequence of higher highs and higher lows',
        'Price above its 200-day moving average',
        'Three consecutive green candles',
        'RSI above 50'],
  array['trend']);

select pg_temp.seed_q('technical-analysis', 'hard',
  'What is bearish divergence?',
  'Price makes a higher high while a momentum indicator makes a lower high — the move is being driven by less force than the previous one. It is a warning about momentum, not a timing signal; divergence can persist for a long time before anything happens.',
  'Price makes a higher high while momentum makes a lower high',
  array['Price makes a higher high while momentum makes a lower high',
        'Two indicators give opposite readings',
        'Price and volume both fall together',
        'The spread widens as price rises'],
  array['divergence', 'momentum']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'What does MACD measure?',
  'The relationship between two moving averages of price — the distance between a fast and a slow EMA, plus a signal line on top of that. It is a trend-following momentum indicator, so it lags at turning points by construction.',
  'The distance between a fast and a slow moving average',
  array['The distance between a fast and a slow moving average',
        'The ratio of up volume to down volume',
        'The number of advancing versus declining stocks',
        'Price relative to its recent high-low range'],
  array['indicators']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'Why do signals on lower timeframes produce more false positives?',
  'Shorter bars carry more noise relative to signal — spreads, order flow and random fluctuation dominate small moves. The same pattern that means something on a daily chart can be meaningless on a one-minute one, while costing you the spread every time.',
  'Noise dominates signal at short horizons, and trading costs are paid more often',
  array['Noise dominates signal at short horizons, and trading costs are paid more often',
        'Exchanges delay lower-timeframe data',
        'Indicators are not defined below the daily timeframe',
        'Lower timeframes have less volume'],
  array['timeframes', 'noise']);

select pg_temp.seed_q('technical-analysis', 'medium',
  'What is a false breakout?',
  'Price moves beyond a level, attracting entries, then reverses back inside the range — trapping those who entered on the break. Waiting for a close beyond the level, or for a retest, filters some of them out at the cost of a worse entry price.',
  'Price breaks a level, then reverses back into the range',
  array['Price breaks a level, then reverses back into the range',
        'A breakout that happens outside market hours',
        'A breakout on a chart with bad data',
        'A breakout that exceeds the daily limit'],
  array['breakouts']);

-- ============================================================ Risk Management

select pg_temp.seed_q('risk-management', 'medium',
  'You risk 2% of a 500,000 account per trade, with a stop 25 away from entry. How many units?',
  '2% of 500,000 is 10,000 of risk. Divided by 25 per unit, that is 400 units. Position size follows from the risk budget and the stop distance — it is an output of the plan, not a number you pick because it feels right.',
  '400 units',
  array['400 units', '200 units', '1,000 units', '40 units'],
  array['position-sizing']);

select pg_temp.seed_q('risk-management', 'medium',
  'A strategy wins 40% of the time with a 3:1 reward-to-risk ratio. Is it profitable?',
  'Yes. Per unit risked, expectancy is 0.4 x 3 minus 0.6 x 1 = 0.6. Win rate alone says nothing — a 90% win rate with a 1:10 ratio loses money. The two numbers only mean something together.',
  'Yes — expectancy is +0.6 per unit risked',
  array['Yes — expectancy is +0.6 per unit risked',
        'No — a win rate under 50% cannot be profitable',
        'Only if the win rate rises above 50%',
        'There is not enough information'],
  array['expectancy']);

select pg_temp.seed_q('risk-management', 'medium',
  'After a 50% drawdown, what return is needed to get back to breakeven?',
  '100%. Losses and the gains needed to recover them are asymmetric, and the gap widens fast: 20% needs 25%, 50% needs 100%, 80% needs 400%. This asymmetry is the whole argument for capping losses early.',
  '100%',
  array['100%', '50%', '75%', '150%'],
  array['drawdown', 'maths']);

select pg_temp.seed_q('risk-management', 'medium',
  'Why does holding ten correlated positions not give you diversification?',
  'Correlated assets fall together. Ten positions in the same sector is one bet expressed ten ways — and correlations tend to rise toward 1 in a crisis, exactly when the diversification was supposed to help.',
  'They move together, so it is one bet held in ten places',
  array['They move together, so it is one bet held in ten places',
        'Ten positions is too few to diversify',
        'Correlation only matters for derivatives',
        'It does diversify — position count is what matters'],
  array['correlation', 'portfolio']);

select pg_temp.seed_q('risk-management', 'medium',
  'What is wrong with placing a stop at a round number just below entry?',
  'It is chosen for convenience rather than from the instrument''s structure or volatility. Clusters of stops at obvious levels are exactly where price tends to reach before reversing. Place stops where the trade thesis is invalidated, then size the position to fit.',
  'It ignores volatility and structure — place the stop where the thesis fails, then size to it',
  array['It ignores volatility and structure — place the stop where the thesis fails, then size to it',
        'Stops should never be used at all',
        'Round numbers are rejected by most brokers',
        'It makes the position too small to be worthwhile'],
  array['stops', 'position-sizing']);

select pg_temp.seed_q('risk-management', 'hard',
  'What is risk of ruin?',
  'The probability of losing enough capital to be unable to continue, given your edge, win rate and position size. It is why a positive-expectancy strategy can still wipe you out: size too large and a normal losing streak ends the account before the edge can show up.',
  'The probability that a losing streak ends the account despite a positive edge',
  array['The probability that a losing streak ends the account despite a positive edge',
        'The maximum loss on a single trade',
        'The chance a broker becomes insolvent',
        'The risk that a stop-loss fails to trigger'],
  array['ruin', 'probability']);

select pg_temp.seed_q('risk-management', 'medium',
  'What does 10x leverage do to a 5% adverse move?',
  'It becomes a 50% loss of your capital. Leverage multiplies both directions equally — the asymmetry is that a 10% adverse move at 10x wipes you out entirely, while no favourable move can double your account twice as fast in compensation.',
  'It becomes a 50% loss of capital',
  array['It becomes a 50% loss of capital', 'It remains a 5% loss',
        'It becomes a 15% loss', 'It depends on the holding period'],
  array['leverage']);

select pg_temp.seed_q('risk-management', 'easy',
  'Why cap risk per trade at a small percentage of the account?',
  'So no single trade can meaningfully damage your ability to keep trading. At 1-2%, a run of ten losses costs 10-20% and is survivable; at 20% per trade, the same run ends the account. Survival is the precondition for any edge to matter.',
  'So no single trade can end your ability to keep trading',
  array['So no single trade can end your ability to keep trading',
        'Because brokers require it',
        'To reduce commission costs',
        'To keep the win rate above 50%'],
  array['position-sizing', 'survival']);

select pg_temp.seed_q('risk-management', 'medium',
  'What does a backtest that ignores costs and slippage typically show?',
  'Returns far better than anything achievable. High-frequency strategies suffer most, because they pay the spread on every one of thousands of trades — many published edges disappear entirely once realistic costs are subtracted.',
  'Returns materially better than reality, especially for high-frequency strategies',
  array['Returns materially better than reality, especially for high-frequency strategies',
        'Returns that are too conservative',
        'Accurate returns, since costs cancel out over time',
        'No difference for strategies holding over a day'],
  array['backtesting', 'costs']);

select pg_temp.seed_q('risk-management', 'medium',
  'What is the practical purpose of a maximum daily loss limit?',
  'To stop a bad day becoming a catastrophic one. It exists because the state you are in after several losses — frustrated, wanting it back — is precisely when position sizing and discipline fail. A hard limit removes that decision from the moment it would be made worst.',
  'To stop tilt turning a bad day into a catastrophic one',
  array['To stop tilt turning a bad day into a catastrophic one',
        'To satisfy a regulatory requirement',
        'To reduce overnight financing charges',
        'To guarantee profitability over a month'],
  array['discipline', 'psychology']);

-- ============================================================ publish

do $$
declare
  v_approver uuid;
  v_count    integer;
begin
  select count(*) into v_count from public.questions where source = 'seed';

  select id into v_approver
  from public.profiles
  where is_staff
  order by created_at
  limit 1;

  if v_approver is null then
    raise notice '';
    raise notice '  % seed questions inserted as in_review.', v_count;
    raise notice '  No staff account exists yet, so nothing was published.';
    raise notice '';
    raise notice '  Sign up in the app, promote your account with';
    raise notice '  supabase/dev/promote_staff.sql, then run:';
    raise notice '    npx supabase db query --local --file supabase/dev/publish_seed.sql';
    raise notice '';
  else
    update public.questions
       set status = 'approved', approved_by = v_approver, approved_at = now()
     where source = 'seed' and status = 'in_review';

    raise notice '% seed questions approved by the first staff account.', v_count;
  end if;
end
$$;

commit;
