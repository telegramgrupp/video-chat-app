import { createClient } from '@supabase/supabase-js';

// Log Supabase environment variables
console.log('Supabase Environment Variables Check:');
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL ? '✓ Present' : '✗ Missing');
console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Present' : '✗ Missing');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please click the "Connect to Supabase" button in the top right corner.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);