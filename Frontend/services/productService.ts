// Product Service for Brand CRUD operations
//
// API base URL resolution:
//  - Web (browser on the dev machine): http://localhost:8000/api
//  - Physical device (Expo Go): auto-detect the dev machine's LAN IP so the
//    phone can reach the backend (localhost on a phone means the phone itself,
//    which is why "Network request failed" happened before).
//  - Override anytime with EXPO_PUBLIC_API_URL in the Frontend/.env file.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveApiBaseUrl(): string {
  // 1. Explicit override wins.
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');

  // 2. On a physical device, point at the dev machine's LAN IP.
  if (Platform.OS !== 'web') {
    const hostUri =
      (Constants.expoConfig as any)?.hostUri ||
      (Constants.manifest as any)?.debuggerHost ||
      '';
    const host = (hostUri || '').split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8000/api`;
    }
  }

  // 3. Web / fallback.
  return 'http://localhost:8000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  try {
    const response = await globalThis.fetch(input, { ...init, headers });
    return response;
  } catch (error) {
    console.error('[apiFetch] error', input, error);
    throw error;
  }
};

export interface ProductImage {
  id: number;
  image_base64: string;
  image_type: string;
  order: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  sale_price?: number;
  category?: string;
  subcategory?: string;
  image?: string;
  stock: number;
  is_active: boolean;
  is_on_sale: boolean;
  brand_name: string;
  created_at: string;
  updated_at: string;
  images?: ProductImage[];
  average_rating?: number;
  total_ratings?: number;
}

export interface ProductCreateData {
  name: string;
  description?: string;
  price: number;
  sale_price?: number;
  category?: string;
  subcategory?: string;
  image?: string;
  stock: number;
  is_active?: boolean;
  images?: { data: string; type: string }[];
}

// Get all products (for customers) or brand's products (for brands)
export const getProducts = async (accessToken?: string): Promise<Product[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  const response = await apiFetch(`${API_BASE_URL}/auth/products/`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }

  return await response.json();
};

// Get single product
export const getProduct = async (productId: number): Promise<Product> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/products/${productId}/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch product');
  }

  return await response.json();
};

// Create product (brand only)
export const createProduct = async (accessToken: string, data: ProductCreateData): Promise<Product> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/products/create/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create product');
  }

  return await response.json();
};

// Update product (brand only)
export const updateProduct = async (
  accessToken: string, 
  productId: number, 
  data: Partial<ProductCreateData>
): Promise<Product> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/products/${productId}/update/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update product');
  }

  return await response.json();
};

// Delete product (brand only)
export const deleteProduct = async (accessToken: string, productId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/products/${productId}/delete/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete product');
  }
};

// Get brand's products (public) — returns { brand, products }
export interface BrandProductsResponse {
  brand: Record<string, unknown>;
  products: Product[];
}

export const getBrandProducts = async (brandId: number, accessToken?: string): Promise<BrandProductsResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await apiFetch(`${API_BASE_URL}/auth/brands/${brandId}/products/`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch brand products');
  }

  return await response.json();
};

// Wishlist operations
export const getWishlist = async (accessToken: string): Promise<WishlistItem[]> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/wishlist/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch wishlist');
  }

  return await response.json();
};

export const addToWishlist = async (accessToken: string, productId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/wishlist/add/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ product_id: productId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to add to wishlist');
  }
};

export const removeFromWishlist = async (accessToken: string, productId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/wishlist/remove/${productId}/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to remove from wishlist');
  }
};

// Cart operations
export const getCart = async (accessToken: string): Promise<CartItem[]> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch cart');
  }

  return await response.json();
};

export const addToCartAPI = async (
  accessToken: string, 
  productId: number, 
  quantity: number = 1, 
  size: string = 'M', 
  color: string = 'Black'
): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/add/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ product_id: productId, quantity, selected_size: size, selected_color: color }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to add to cart');
  }
};

export const updateCartItem = async (accessToken: string, itemId: number, quantity: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/update/${itemId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ quantity }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update cart');
  }
};

export const removeFromCartAPI = async (accessToken: string, itemId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/remove/${itemId}/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to remove from cart');
  }
};

export const clearCartAPI = async (accessToken: string): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/clear/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to clear cart');
  }
};

// Review operations
export const getProductReviews = async (productId: number, accessToken?: string): Promise<ReviewsResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await apiFetch(`${API_BASE_URL}/auth/products/${productId}/reviews/`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reviews');
  }

  return await response.json() as ReviewsResponse;
};

export interface ReviewsResponse {
  reviews: Review[];
  average_rating: number;
  total_reviews: number;
  total_ratings: number;
  user_rating: number | null;
}

export const createReview = async (
  accessToken: string,
  data: { product_id: number; rating: number; comment?: string }
): Promise<Review> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/reviews/create/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create review');
  }

  return await response.json();
};

export const deleteReview = async (accessToken: string, reviewId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/reviews/${reviewId}/delete/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete review');
  }
};

export const getMyReviews = async (accessToken: string): Promise<Review[]> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/reviews/my/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch my reviews');
  }

  return await response.json();
};

// Helper interfaces
export interface WishlistItem {
  id: number;
  product: Product;
  created_at: string;
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  selected_size: string;
  selected_color: string;
  created_at: string;
}

export interface Review {
  id: number;
  product: number;
  user_id: number;
  username: string;
  rating: number;
  title?: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}
