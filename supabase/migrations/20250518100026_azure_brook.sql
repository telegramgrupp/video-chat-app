/*
  # Create users table for anonymous and authenticated users

  1. New Tables
    - `users`
      - `id` (text, primary key) - UUID for both anonymous and authenticated users
      - `is_anonymous` (boolean) - Whether this is an anonymous user
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `users` table
    - Add policies for public access to insert and select
    - Explicitly allow insertion of id and is_anonymous columns
*/

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  is_anonymous boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow insert for all users" ON users;
DROP POLICY IF EXISTS "Allow select for all users" ON users;

-- Create new policies with explicit column permissions
CREATE POLICY "Allow insert for all users"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (
    id IS NOT NULL 
    AND is_anonymous IS NOT NULL
  );

CREATE POLICY "Allow select for all users"
  ON users
  FOR SELECT
  TO public
  USING (true);