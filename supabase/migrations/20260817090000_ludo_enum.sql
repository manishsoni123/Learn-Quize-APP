-- Learn-Quize · 012 · Ludo enum value
--
-- Alone in its own file for the same reason as 20260816090000: Postgres will
-- not let a new enum value be used in the transaction that created it, and the
-- seed row two migrations later needs to reference it.

alter type public.quiz_mode add value if not exists 'ludo';
