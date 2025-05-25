import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  isLoading: boolean;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  isLoading: true,
});

export const useSupabase = () => useContext(SupabaseContext);

interface SupabaseProviderProps {
  children: React.ReactNode;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real implementation, these would come from environment variables
    // For now, we're just setting up the structure without actual credentials
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || '';

    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      setSupabase(client);
    }
    
    setIsLoading(false);
  }, []);

  return (
    <SupabaseContext.Provider value={{ supabase, isLoading }}>
      {children}
    </SupabaseContext.Provider>
  );
};