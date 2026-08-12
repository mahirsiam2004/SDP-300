// Product Service for Brand CRUD operations
//export const API_BASE_URL = 'https://shopflare-api-di4o.onrender.com/api';
//export const API_BASE_URL = 'http://192.168.0.98:8000/api'; 
//export const API_BASE_URL = 'http://10.165.178.202:8000/api'; 
//export const API_BASE_URL = 'http://192.168.68.62:8000/api';
const PROXY_BASE_URL = 'http://localhost:8000/api';
export const API_BASE_URL = PROXY_BASE_URL;

const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set('ngrok-skip-browser-warning', '69420');
  return globalThis.fetch(input, { ...init, headers });
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
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete product');
  }
};

// Get products from a specific brand
export const getBrandProducts = async (brandId: number): Promise<{ brand: any; products: Product[] }> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/brands/${brandId}/products/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch brand products');
  }

  return await response.json();
};


// ==================== WISHLIST API ====================

export interface WishlistItem {
  id: number;
  product: Product;
  created_at: string;
}

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

export const addToWishlist = async (accessToken: string, productId: number): Promise<WishlistItem> => {
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

  return await response.json();
};

export const removeFromWishlist = async (accessToken: string, productId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/wishlist/remove/${productId}/`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to remove from wishlist');
  }
};


// ==================== CART API ====================

export interface CartItemResponse {
  id: number;
  product: Product;
  quantity: number;
  selected_size: string;
  selected_color: string;
  created_at: string;
  updated_at: string;
}

export const getCart = async (accessToken: string): Promise<CartItemResponse[]> => {
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
  quantity: number,
  selectedSize: string,
  selectedColor: string
): Promise<CartItemResponse> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/add/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ 
      product_id: productId, 
      quantity,
      selected_size: selectedSize,
      selected_color: selectedColor 
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to add to cart');
  }

  return await response.json();
};

export const updateCartItem = async (accessToken: string, itemId: number, quantity: number): Promise<CartItemResponse> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/update/${itemId}/`, {
    method: 'PUT',
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

  return await response.json();
};

export const removeFromCartAPI = async (accessToken: string, itemId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/cart/remove/${itemId}/`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
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
    method: 'DELETE',
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

// ============ REVIEW API FUNCTIONS ============

export interface Review {
  id: number;
  user_id: number;
  username: string;
  product: number;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  average_rating: number;
  total_reviews: number;
  total_ratings: number;
  user_rating: number | null;
}

export interface ReviewCreateData {
  product_id: number;
  rating: number;
  title?: string;
  comment?: string;
}

// Get reviews for a product (pass token to get user's rating)
export const getProductReviews = async (productId: number, accessToken?: string | null): Promise<ReviewsResponse> => {
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

  return await response.json();
};

// Create or update review (requires auth)
export const createReview = async (accessToken: string, data: ReviewCreateData): Promise<Review> => {
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
    throw new Error(error.detail || 'Failed to submit review');
  }

  return await response.json();
};

// Delete user's own review
export const deleteReview = async (accessToken: string, reviewId: number): Promise<void> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/reviews/${reviewId}/delete/`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete review');
  }
};

// Get user's reviews
export const getUserReviews = async (accessToken: string): Promise<Review[]> => {
  const response = await apiFetch(`${API_BASE_URL}/auth/reviews/my/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user reviews');
  }

  return await response.json();
};

