/*
  # Create match history table

  1. New Tables
    - `match_history`
      - `id` (uuid, primary key)
      - `user_id` (text, not null)
      - `matched_with` (text, not null)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `match_history` table
    - Add policies for authenticated users to read their own matches
    - Add policy for system to insert matches
*/

CREATE TABLE IF NOT EXISTS match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  matched_with text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own match history
CREATE POLICY "Users can read own match history"
  ON match_history
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Allow system to insert match history
CREATE POLICY "System can insert match history"
  ON match_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_matched_with ON match_history(matched_with);

-- Create match statistics table
CREATE TABLE IF NOT EXISTS match_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  total_matches integer DEFAULT 0,
  successful_matches integer DEFAULT 0,
  average_wait_time integer DEFAULT 0,
  last_match_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE match_statistics ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own statistics
CREATE POLICY "Users can read own statistics"
  ON match_statistics
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Allow system to update statistics
CREATE POLICY "System can update statistics"
  ON match_statistics
  FOR ALL
  TO authenticated
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_match_statistics_user_id ON match_statistics(user_id);

-- Create function to update match statistics
CREATE OR REPLACE FUNCTION update_match_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO match_statistics (user_id, total_matches, successful_matches, last_match_at)
  VALUES (NEW.user_id, 1, 1, NEW.created_at)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    total_matches = match_statistics.total_matches + 1,
    successful_matches = match_statistics.successful_matches + 1,
    last_match_at = NEW.created_at,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for match statistics
CREATE TRIGGER on_match_created
  AFTER INSERT ON match_history
  FOR EACH ROW
  EXECUTE FUNCTION update_match_statistics();