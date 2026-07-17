// lib/store.ts
import { create } from 'zustand';
import { User } from '@/types';
import { getToken, getUser, setToken, setUser, clearAuth } from './auth';

interface AuthState {
  token: string | null;
  user: User | null;
  isHydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrated: false,
  login: (token, user) => {
    setToken(token);
    setUser(user);
    set({ token, user });
  },
  logout: () => {
    clearAuth();
    set({ token: null, user: null });
  },
  hydrate: () => {
    set({ token: getToken(), user: getUser(), isHydrated: true });
  },
}));
