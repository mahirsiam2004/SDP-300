import { API_BASE_URL } from './productService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Address {
  id: number;
  label: 'home' | 'work' | 'other';
  full_name: string;
  phone?: string;
  address_line1: string;
  city: string;
  postal_code?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AddressInput = Omit<Address, 'id' | 'created_at' | 'updated_at'>;

export interface UserReview {
  id: number;
  user_id: number;
  username: string;
  product: number;
  rating: number;
  title?: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface BrandAnalytics {
  total_products: number;
  active_products: number;
  wishlist_saves: number;
  cart_adds: number;
  total_reviews: number;
  average_rating: number;
  total_sales: number;
  total_orders: number;
  units_sold: number;
  avg_order_value: number;
  top_products: { id: number; name: string; price: string; saves: number }[];
  top_selling_products: { id: number | null; name: string; units_sold: number; revenue: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).detail ||
        Object.values(err as Record<string, string[]>)
          .flat()
          .join(', ') ||
        'Request failed'
    );
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile – Customer
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfile = async (
  token: string,
  data: Partial<{ username: string; first_name: string; last_name: string; phone_number: string; bio: string }>
) => {
  const res = await fetch(`${API_BASE_URL}/auth/profile/update/`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const changePassword = async (
  token: string,
  old_password: string,
  new_password: string,
  new_password2: string
) => {
  const res = await fetch(`${API_BASE_URL}/auth/profile/change-password/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ old_password, new_password, new_password2 }),
  });
  return handleResponse(res);
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile – Brand
// ─────────────────────────────────────────────────────────────────────────────

export const updateBrandProfile = async (
  token: string,
  data: Partial<{
    username: string;
    email: string;
    phone_number: string;
    brand_description: string;
    brand_website: string;
    brand_address: string;
  }>
) => {
  const res = await fetch(`${API_BASE_URL}/auth/brand/profile/update/`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const changeBrandPassword = async (
  token: string,
  old_password: string,
  new_password: string,
  new_password2: string
) => {
  const res = await fetch(`${API_BASE_URL}/auth/brand/change-password/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ old_password, new_password, new_password2 }),
  });
  return handleResponse(res);
};

// ─────────────────────────────────────────────────────────────────────────────
// Addresses
// ─────────────────────────────────────────────────────────────────────────────

export const getAddresses = async (token: string): Promise<Address[]> => {
  const res = await fetch(`${API_BASE_URL}/auth/addresses/`, {
    headers: authHeaders(token),
  });
  return handleResponse<Address[]>(res);
};

export const createAddress = async (
  token: string,
  data: AddressInput
): Promise<Address> => {
  const res = await fetch(`${API_BASE_URL}/auth/addresses/create/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<Address>(res);
};

export const updateAddress = async (
  token: string,
  id: number,
  data: Partial<AddressInput>
): Promise<Address> => {
  const res = await fetch(`${API_BASE_URL}/auth/addresses/${id}/`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<Address>(res);
};

export const deleteAddress = async (token: string, id: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/auth/addresses/${id}/`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to delete address');
};

// ─────────────────────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────────────────────

export const getMyReviews = async (token: string): Promise<UserReview[]> => {
  const res = await fetch(`${API_BASE_URL}/auth/reviews/my/`, {
    headers: authHeaders(token),
  });
  return handleResponse<UserReview[]>(res);
};

export const deleteReview = async (token: string, reviewId: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/auth/reviews/${reviewId}/delete/`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to delete review');
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Analytics
// ─────────────────────────────────────────────────────────────────────────────

export const getBrandAnalytics = async (token: string): Promise<BrandAnalytics> => {
  const res = await fetch(`${API_BASE_URL}/auth/brand/analytics/`, {
    headers: authHeaders(token),
  });
  return handleResponse<BrandAnalytics>(res);
};
