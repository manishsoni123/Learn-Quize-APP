-- Learn-Quize · 007 · Seed taxonomy and achievements
--
-- Tracks and categories are reference data, not user content, so they live in
-- a migration rather than a seed script — a fresh environment should come up
-- with the same catalogue every time.
--
-- The full catalogue is ~28 categories. Only 12 are is_active at launch: a
-- category with 30 questions in it reads as abandoned, so the rest stay dark
-- until their banks are filled. Flip is_active as each one reaches ~500.

insert into public.tracks (slug, name, description, accent_hex, sort_order) values
  ('developer', 'Developer',
   'Languages, frameworks, tooling and system design.', '#146B57', 1),
  ('ai-ml', 'AI & Machine Learning',
   'From gradient descent to production LLM systems.',  '#3E5FC4', 2),
  ('trading', 'Trading & Quant',
   'Markets, derivatives, risk and algorithmic trading.', '#C8611A', 3);

-- ============================================================ categories

insert into public.categories (track_id, slug, name, description, sort_order, is_active)
select t.id, c.slug, c.name, c.description, c.sort_order, c.is_active
from public.tracks t
join (values
  -- ---- Developer -------------------------------------------------------
  ('developer', 'javascript',      'JavaScript',                  'Closures, async, prototypes, the event loop.',        1,  true),
  ('developer', 'typescript',      'TypeScript',                  'Types, generics, narrowing, config.',                 2,  true),
  ('developer', 'react',           'React',                       'Hooks, rendering, state, performance.',               3,  true),
  ('developer', 'nodejs',          'Node.js',                     'Runtime, streams, modules, the ecosystem.',           4,  true),
  ('developer', 'python',          'Python',                      'Data model, comprehensions, stdlib, gotchas.',        5,  true),
  ('developer', 'sql',             'SQL & Databases',             'Joins, indexes, transactions, query plans.',          6,  true),
  ('developer', 'dsa',             'Data Structures & Algorithms','Complexity, trees, graphs, dynamic programming.',      7,  false),
  ('developer', 'git',             'Git & Version Control',       'Branching, rebase, merge conflicts, recovery.',        8,  false),
  ('developer', 'system-design',   'System Design',               'Scaling, caching, queues, consistency.',              9,  false),
  ('developer', 'docker-k8s',      'Docker & Kubernetes',         'Images, containers, pods, deployments.',             10,  false),
  ('developer', 'web-security',    'Web Security',                'XSS, CSRF, auth, the OWASP Top 10.',                 11,  false),
  ('developer', 'react-native',    'React Native & Expo',         'Native modules, navigation, builds, performance.',   12,  false),

  -- ---- AI & Machine Learning ------------------------------------------
  ('ai-ml', 'ml-fundamentals',  'ML Fundamentals',        'Bias-variance, regularisation, evaluation.',           1,  true),
  ('ai-ml', 'deep-learning',    'Deep Learning',          'Backprop, architectures, training dynamics.',          2,  true),
  ('ai-ml', 'llms-prompting',   'LLMs & Prompting',       'Transformers, context, tokens, agents, RAG.',          3,  true),
  ('ai-ml', 'pandas-numpy',     'Pandas & NumPy',         'Vectorisation, indexing, reshaping, joins.',           4,  false),
  ('ai-ml', 'nlp',              'Natural Language Processing', 'Embeddings, tokenisation, sequence models.',      5,  false),
  ('ai-ml', 'computer-vision',  'Computer Vision',        'Convolutions, detection, segmentation.',               6,  false),
  ('ai-ml', 'statistics',       'Statistics & Probability','Distributions, inference, hypothesis testing.',       7,  false),
  ('ai-ml', 'mlops',            'MLOps',                  'Serving, monitoring, drift, reproducibility.',         8,  false),

  -- ---- Trading & Quant -------------------------------------------------
  ('trading', 'market-basics',        'Market Basics',         'Instruments, order types, settlement, microstructure.', 1, true),
  ('trading', 'technical-analysis',   'Technical Analysis',    'Trend, momentum, volume, chart structure.',             2, true),
  ('trading', 'risk-management',      'Risk Management',       'Position sizing, drawdown, stops, exposure.',           3, true),
  ('trading', 'derivatives',          'Derivatives (F&O)',     'Futures, options, greeks, payoff structures.',          4, false),
  ('trading', 'fundamental-analysis', 'Fundamental Analysis',  'Statements, ratios, valuation, earnings.',              5, false),
  ('trading', 'algo-trading',         'Algo Trading',          'Backtesting, execution, slippage, overfitting.',        6, false),
  ('trading', 'quant-methods',        'Quant Methods',         'Time series, factor models, portfolio maths.',          7, false),
  ('trading', 'crypto',               'Crypto & DeFi',         'Chains, custody, AMMs, tokenomics.',                    8, false)
) as c(track_slug, slug, name, description, sort_order, is_active)
  on c.track_slug = t.slug;

-- ============================================================ achievements

insert into public.achievements
  (slug, name, description, icon, xp_reward, rule_kind, rule_threshold, sort_order)
values
  ('first-steps',   'First Steps',    'Finish your first quiz.',                    '🌱',   0, 'sessions_completed',    1,  1),
  ('getting-going', 'Getting Going',  'Finish 10 quizzes.',                         '🚀',  50, 'sessions_completed',   10,  2),
  ('centurion',     'Centurion',      'Answer 100 questions.',                      '💯',  50, 'questions_answered',  100,  3),
  ('thousand-club', 'Thousand Club',  'Answer 1,000 questions.',                    '🏛️', 250, 'questions_answered', 1000,  4),
  ('week-one',      'Week One',       'Keep a 7-day streak.',                       '🔥', 100, 'streak_days',           7,  5),
  ('unbroken',      'Unbroken',       'Keep a 30-day streak.',                      '⛰️', 500, 'streak_days',          30,  6),
  ('hundred-days',  'Hundred Days',   'Keep a 100-day streak.',                     '💎',2000, 'streak_days',         100,  7),
  ('level-five',    'Level 5',        'Reach level 5.',                             '⭐',   0, 'level_reached',         5,  8),
  ('level-ten',     'Level 10',       'Reach level 10.',                            '🌟', 200, 'level_reached',        10,  9),
  ('level-twenty',  'Level 20',       'Reach level 20.',                            '👑', 750, 'level_reached',        20, 10),
  ('ten-thousand',  'Ten Thousand',   'Earn 10,000 XP.',                            '🏆', 500, 'total_xp',          10000, 11);
