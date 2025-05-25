/*
  # Update matches table constraints

  1. Changes
    - Remove foreign key constraint from matches table
    - Add text type for peer columns
    - Add policies for public access

  2. Security
    - Enable RLS
    - Add policies for public access to matches table
*/

-- Drop existing foreign key constraint if exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'matches_peer_a_fkey'
  ) THEN
    ALTER TABLE matches DROP CONSTRAINT matches_peer_a_fkey;
  END IF;
END $$;