/*
  # Create matches table with anonymous access

  1. New Tables
    - `matches`
      - `id` (uuid, primary key)
      - `peer_a` (text) - initiator's ID
      - `peer_b` (text, nullable) - matched peer's ID
      - `is_fake` (boolean) - whether this is a fake match
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `matches` table
    - Add policy for both authenticated and anonymous users
*/

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_a text NOT NULL,
  peer_b text,
  is_fake boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert for all users"
  ON matches
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow select for all users"
  ON matches
  FOR SELECT
  TO public
  USING (true);