import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import { adminEmails } from '../utils/admins';

type Gender = 'male' | 'female' | 'both';
type Region = 'TR' | 'US' | 'global';

type AuthContextType = {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  preferences: {
    gender: Gender;
    region: Region;
  };
  setPreferences: (prefs: { gender: Gender; region: Region }) => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isLoading: true,
  setUser: () => {},
  preferences: {
    gender: 'both',
    region: 'global',
  },
  setPreferences: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState({
    gender: 'both' as Gender,
    region: 'global' as Region,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = adminEmails.includes(user?.email ?? '');

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading, setUser, preferences, setPreferences }}>
      {children}
    </AuthContext.Provider>
  );
};