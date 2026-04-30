-- Credentials table for storing API keys and tokens
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

CREATE TABLE credentials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name text NOT NULL,
    key_name text NOT NULL,
    key_value text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(service_name, key_name)
);

-- Enable Row Level Security — blocks all public access
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- No policies = no public access. Only the service role key can read/write.
-- This means the publishable (anon) key used in the frontend CANNOT see this table.
