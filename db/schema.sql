DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM (
      'asset',
      'liability',
      'equity',
      'revenue',
      'expense',
      'cogs'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'normal_balance') THEN
    CREATE TYPE normal_balance AS ENUM (
      'debit',
      'credit'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_status') THEN
    CREATE TYPE journal_status AS ENUM (
      'draft',
      'posted',
      'void'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'admin',
      'akuntan',
      'manajemen'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_full_name_not_empty CHECK (trim(full_name) <> ''),
  CONSTRAINT users_email_not_empty CHECK (trim(email) <> '')
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGSERIAL PRIMARY KEY,
  account_code VARCHAR(32) NOT NULL UNIQUE,
  account_name VARCHAR(255) NOT NULL,
  account_type account_type NOT NULL,
  normal_balance normal_balance NOT NULL,
  parent_account_id BIGINT REFERENCES chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT coa_code_not_empty CHECK (trim(account_code) <> ''),
  CONSTRAINT coa_name_not_empty CHECK (trim(account_name) <> '')
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  reference_no VARCHAR(64) UNIQUE,
  description TEXT NOT NULL,
  status journal_status NOT NULL DEFAULT 'posted',
  posted_at TIMESTAMPTZ,
  posted_by BIGINT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT journal_description_not_empty CHECK (trim(description) <> ''),
  CONSTRAINT posted_requires_posted_at CHECK (
    status <> 'posted' OR posted_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES chart_of_accounts(id),
  line_no INTEGER NOT NULL,
  memo TEXT,
  debit NUMERIC(20, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(20, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT journal_line_positive CHECK (
    debit >= 0 AND credit >= 0
  ),
  CONSTRAINT journal_line_one_side_only CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT journal_line_unique_no UNIQUE (journal_entry_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date_status
  ON journal_entries(entry_date, status);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON journal_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON journal_lines(account_id);

CREATE INDEX IF NOT EXISTS idx_coa_type
  ON chart_of_accounts(account_type);
