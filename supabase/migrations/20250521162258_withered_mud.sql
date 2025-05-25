/*
  # Create reported users table

  1. New Tables
    - `reported_users`
      - `id` (uuid, primary key)
      - `user_id` (text, not null) - The reported user
      - `reported_by` (text, not null) - User who made the report
      - `reason` (text) - Optional reason for report
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `reported_users` table
    - Add policies for authenticated users to insert and read
    - Add indexes for efficient lookups
*/

CREATE TABLE IF NOT EXISTS reported_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  reported_by text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reported_users ENABLE ROW LEVEL SECURITY;

-- Allow users to read reports they've made
CREATE POLICY "Users can read reports they made"
  ON reported_users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = reported_by);

-- Allow users to create reports
CREATE POLICY "Users can create reports"
  ON reported_users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = reported_by);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_reported_users_user_id ON reported_users(user_id);
CREATE INDEX IF NOT EXISTS idx_reported_users_reported_by ON reported_users(reported_by);