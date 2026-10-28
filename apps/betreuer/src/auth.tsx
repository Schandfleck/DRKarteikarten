import { createContext, useContext } from 'react';
import type { User } from './api.ts';

export const AuthContext = createContext<{ user: User; logout: () => void; refresh: () => void } | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von AuthContext');
  return ctx;
}
