// API configuration and service functions
// For testing on physical device, replace 'localhost' with your machine's local IP (e.g., 192.168.x.x)
//const API_BASE_URL = 'http://192.168.0.98:8000/api';  // Change this to your actual machine IP if needed
// API configuration and service functions
//const API_BASE_URL = 'https://shopflare-api-di4o.onrender.com/api';
//export const API_BASE_URL = 'http://10.165.178.202:8000/api'; 
//export const API_BASE_URL = 'http://192.168.68.62:8000/api';
import { API_BASE_URL } from './productService';

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
  // Brand-specific fields (username is the brand name for brands)
  brand_description?: string;
  brand_logo?: string;
  brand_website?: string;
  brand_address?: string;
  is_brand_verified?: boolean;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface VerificationRequirement {
  requires_verification: boolean;
  email: string;
  user_type: UserType;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export interface RegisterData {
  username: string;  // For brands, this is the brand name
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
  user_type?: UserType;
  // Brand-specific fields
  brand_description?: string;
  brand_website?: string;
  brand_address?: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface ChangePasswordData {
  old_password: string;
  new_password: string;
  new_password2: string;
}

export interface VerifyEmailData {
  email: string;
  user_type: UserType;
  code: string;
}

export interface ForgotPasswordRequestData {
  email: string;
}

export interface ForgotPasswordConfirmData {
  email: string;
  code: string;
  new_password: string;
  new_password2: string;
}

// Register new user or brand
export const register = async (data: RegisterData): Promise<VerificationRequirement> => {
  // Use different endpoint for brand registration
  const endpoint = data.user_type === 'brand' 
    ? `${API_BASE_URL}/auth/register/brand/`
    : `${API_BASE_URL}/auth/register/`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(error.detail || Object.values(error).flat().join(', '), response.status, error.code, error);
  }

  const result = await response.json();
  return result;
};

// Login user
export const login = async (data: LoginData): Promise<{ user: User; tokens: AuthTokens }> => {
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const responseText = await response.text();

  if (!response.ok) {
    try {
      const error = JSON.parse(responseText);
      throw new ApiError(error.detail || error.message || 'Login failed', response.status, error.code, error);
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      throw new ApiError(`Login failed with status ${response.status}`, response.status);
    }
  }

  try {
    const result = JSON.parse(responseText);
    return {
      user: result.user,
      tokens: { access: result.access, refresh: result.refresh },
    };
  } catch (parseError) {
    throw new Error('Invalid JSON response from server');
  }
};

export const verifyEmailCode = async (data: VerifyEmailData): Promise<{ message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/verify-email/confirm/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new ApiError(result.detail || 'Verification failed', response.status, result.code, result);
  }

  return result;
};

export const resendVerificationCode = async (
  email: string,
  userType: UserType,
): Promise<{ message: string; retry_after?: number }> => {
  const response = await fetch(`${API_BASE_URL}/auth/verify-email/resend/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, user_type: userType }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new ApiError(result.detail || 'Could not resend code', response.status, result.code, result);
  }

  return result;
};

export const requestPasswordResetCode = async (
  data: ForgotPasswordRequestData,
): Promise<{ message: string; retry_after?: number }> => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password/request/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new ApiError(result.detail || 'Could not send reset code', response.status, result.code, result);
  }

  return result;
};

export const confirmPasswordReset = async (
  data: ForgotPasswordConfirmData,
): Promise<{ message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password/confirm/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new ApiError(result.detail || 'Could not reset password', response.status, result.code, result);
  }

  return result;
};

// Get current user info
export const getCurrentUser = async (accessToken: string): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/me/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return await response.json();
};

// Update user profile
export const updateProfile = async (
  accessToken: string,
  data: Partial<User>,
): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/profile/update/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(Object.values(error).flat().join(', '));
  }

  return await response.json();
};

// Update brand profile
export const updateBrandProfile = async (
  accessToken: string,
  data: Partial<User>,
): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/brand/profile/update/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(Object.values(error).flat().join(', '));
  }

  return await response.json();
};

// Change password
export const changePassword = async (
  accessToken: string,
  data: ChangePasswordData,
): Promise<{ message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/profile/change-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to change password');
  }

  return await response.json();
};

// Logout (just clear tokens on client side)
export const logout = async (accessToken: string): Promise<void> => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    // Logout is optional on server, client-side token removal is enough
    console.error('Logout request failed:', error);
  }
};
