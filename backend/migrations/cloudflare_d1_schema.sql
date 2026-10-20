-- TwinCover Cloudflare D1 Migration Schema
-- Compatible with Cloudflare D1 (SQLite serverless) & local SQLite

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    agency_name TEXT NOT NULL DEFAULT 'TwinCover Commercial Advisors',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Clients Table (Broker Tenant Scoped)
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    primary_contact TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_account_number ON clients(account_number);

-- 3. Policies Table
CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policies_client_id ON policies(client_id);

-- 4. Extracted Policy Schedule Fields Table
CREATE TABLE IF NOT EXISTS extracted_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER NOT NULL UNIQUE REFERENCES policies(id) ON DELETE CASCADE,
    insured_name TEXT,
    policy_number TEXT,
    insurer TEXT,
    effective_date TEXT,
    expiry_date TEXT,
    cgl_limit TEXT,
    property_limit TEXT,
    cyber_limit TEXT,
    cyber_deductible TEXT,
    total_premium TEXT,
    raw_json TEXT,
    verified BOOLEAN NOT NULL DEFAULT 0,
    verified_at TIMESTAMP,
    verified_by_user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_extracted_fields_policy_id ON extracted_fields(policy_id);

-- 5. Letter Templates Table
CREATE TABLE IF NOT EXISTS letter_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Renewal',
    content TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_letter_templates_user_id ON letter_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_letter_templates_category ON letter_templates(category);

-- 6. Generated Letters Table
CREATE TABLE IF NOT EXISTS generated_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    policy_id INTEGER REFERENCES policies(id) ON DELETE SET NULL,
    template_id INTEGER REFERENCES letter_templates(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_generated_letters_client_id ON generated_letters(client_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_policy_id ON generated_letters(policy_id);
