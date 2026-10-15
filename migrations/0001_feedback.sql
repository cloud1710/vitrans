-- D1 database vitrans-feedback (binding FEEDBACK): term-pair feedback to the author (spec Amendment G).
-- Term pairs only: no sentence, no document text, no file name, no IP. Applied with
--   npx wrangler@4.150.0 d1 migrations apply vitrans-feedback --local | --remote

-- One row per (English term, the user's Vietnamese, pack, kind), ignoring case and spacing; key = sha256 hex of the
-- normalised tuple (functions/_lib/feedback.js feedbackKey). en / vi_user keep the first spelling sent, vi_used the
-- latest Vietnamese the translation had used; status is the author's review (admin page).
CREATE TABLE feedback (
  key TEXT PRIMARY KEY,
  en TEXT NOT NULL,
  vi_used TEXT NOT NULL,
  vi_user TEXT NOT NULL,
  pack TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'fixed')),
  count INTEGER NOT NULL DEFAULT 1,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected'))
);

CREATE INDEX feedback_by_status ON feedback (status, count DESC);

-- Rows sent per client per UTC day, for the rate limit only: iph is the session's keyed hash of the client IP
-- (functions/_lib/session.js), never the IP; counts older than yesterday are removed as new rows come in.
CREATE TABLE feedback_rate (
  day TEXT NOT NULL,
  iph TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, iph)
);
