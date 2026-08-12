import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as authService from '../services/authService';
import * as tokenStorage from '../services/tokenStorage';

export type UserType = 'user' | 'brand';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  bio?: string;
  is_email_verified?: boolean;
  user_type: UserType;
  // Brand-specific fields
  brand_name?: string;
  brand_description?: string;
  brand_logo?: string;
  brand_website?: string;
  brand_address?: string;
  is_brand_verified?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isSignedIn: boolean;
  isBrand: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  register: (data: authService.RegisterData) => Promise<authService.VerificationRequirement>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  updateBrandProfile: (data: Partial<User>) => Promise<void>;
  setUserData: (data: Partial<User>) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string, newPassword2: string) => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // Check authentication status on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsInitialLoading(true);
      const token = await tokenStorage.getAccessToken();
      const refresh = await tokenStorage.getRefreshToken();
      const storedUser = await tokenStorage.getUser();

      if (token && storedUser) {
        setAccessToken(token);
        setRefreshToken(refresh);
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
    } finally {
      setIsInitialLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const { user: userData, tokens } = await authService.login({
        username,
        password,
      });
      
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
      setUser(userData);

      await tokenStorage.saveTokens(tokens.access, tokens.refresh);
      await tokenStorage.saveUser(userData);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: authService.RegisterData) => {
    setIsLoading(true);
    try {
      return await authService.register(data);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (accessToken) {
        await authService.logout(accessToken);
      }
    } catch (error) {
      // Logout errors are non-critical
    } finally {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      await tokenStorage.clearTokens();
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!accessToken) throw new Error('Not authenticated');

    try {
      const updatedUser = await authService.updateProfile(accessToken, data);
      setUser(updatedUser);
      await tokenStorage.saveUser(updatedUser);
    } catch (error) {
      throw error;
    }
  };

  const updateBrandProfile = async (data: Partial<User>) => {
    if (!accessToken) throw new Error('Not authenticated');

    try {
      const updatedUser = await authService.updateBrandProfile(accessToken, data);
      const merged = { ...user, ...updatedUser } as User;
      setUser(merged);
      await tokenStorage.saveUser(merged);
    } catch (error) {
      throw error;
    }
  };

  const setUserData = async (data: Partial<User>) => {
    const merged = { ...user, ...data } as User;
    setUser(merged);
    await tokenStorage.saveUser(merged);
  };

  const changePassword = async (oldPassword: string, newPassword: string, newPassword2: string) => {
    if (!accessToken) throw new Error('Not authenticated');

    try {
      await authService.changePassword(accessToken, {
        old_password: oldPassword,
        new_password: newPassword,
        new_password2: newPassword2,
      });
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isInitialLoading,
    isSignedIn: !!user,
    isBrand: user?.user_type === 'brand',
    accessToken,
    refreshToken,
    login,
    register,
    logout,
    updateProfile,
    updateBrandProfile,
    setUserData,
    changePassword,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
