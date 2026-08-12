import { API_BASE_URL } from './productService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_ORDERS_KEY = 'guest_orders';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: number;
  product: number | null;
  product_name: string;
  product_price: number;
  quantity: number;
  selected_size: string | null;
  selected_color: string | null;
  line_total: number;
}

export interface Order {
  id: number;
  username: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  payment_method: 'cod' | 'online';
  payment_status: string;
  shipping_full_name: string;
  shipping_phone: string | null;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string;
  subtotal: number;
  shipping_cost: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  guest_access_token?: string | null;
}

export interface CheckoutData {
  address_id?: number;
  shipping_full_name?: string;
  shipping_phone?: string;
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_postal_code?: string;
  shipping_country?: string;
  shipping_cost?: number;
  payment_method: 'cod' | 'online';
  notes?: string;
}

export interface GuestCheckoutItem {
  product_id: number;
  quantity: number;
  selected_size?: string;
  selected_color?: string;
}

export interface GuestCheckoutData {
  guest_email: string;
  shipping_full_name: string;
  shipping_phone: string;
  shipping_address_line1: string;
  shipping_address_line2?: string;
  shipping_city: string;
  shipping_state?: string;
  shipping_postal_code?: string;
  shipping_country: string;
  shipping_cost?: number;
  payment_method: 'cod' | 'online';
  notes?: string;
  items: GuestCheckoutItem[];
}

export interface PaymentInitResponse {
  payment_required: boolean;
  payment_url: string;
  transaction_id: string;
  order: Order;
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

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers });
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
// Customer APIs
// ─────────────────────────────────────────────────────────────────────────────

/** Place an order from the customer's current cart */
export const checkout = async (token: string, data: CheckoutData): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/checkout/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<Order>(res);
};

/** Place an order as guest */
export const guestCheckout = async (data: GuestCheckoutData): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/checkout/guest/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Order>(res);
};

/** Initialize SSL payment for authenticated checkout */
export const checkoutInitPayment = async (
  token: string,
  data: CheckoutData,
): Promise<PaymentInitResponse> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/checkout/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<PaymentInitResponse>(res);
};

/** Initialize SSL payment for guest checkout */
export const guestCheckoutInitPayment = async (data: GuestCheckoutData): Promise<PaymentInitResponse> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/checkout/guest/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<PaymentInitResponse>(res);
};

export interface GuestOrderRef {
  id: number;
  token: string;
  created_at?: string;
}

export const saveGuestOrderRef = async (order: Order): Promise<void> => {
  if (!order.id || !order.guest_access_token) return;
  const existingRaw = await AsyncStorage.getItem(GUEST_ORDERS_KEY);
  const existing: GuestOrderRef[] = existingRaw ? JSON.parse(existingRaw) : [];

  const next: GuestOrderRef[] = [
    { id: order.id, token: order.guest_access_token, created_at: order.created_at },
    ...existing.filter((x) => x.id !== order.id),
  ];

  await AsyncStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify(next.slice(0, 30)));
};

export const getGuestOrderRefs = async (): Promise<GuestOrderRef[]> => {
  const raw = await AsyncStorage.getItem(GUEST_ORDERS_KEY);
  return raw ? (JSON.parse(raw) as GuestOrderRef[]) : [];
};

export const getGuestOrderDetail = async (orderId: number, token: string): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/orders/guest/${orderId}/?token=${encodeURIComponent(token)}`);
  return handleResponse<Order>(res);
};

/** List all orders for the current customer */
export const getOrders = async (token: string): Promise<Order[]> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/orders/`, {
    headers: authHeaders(token),
  });
  return handleResponse<Order[]>(res);
};

/** Get a single order by ID */
export const getOrder = async (token: string, orderId: number): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/orders/${orderId}/`, {
    headers: authHeaders(token),
  });
  return handleResponse<Order>(res);
};

/** Cancel a pending/confirmed order */
export const cancelOrder = async (token: string, orderId: number): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/orders/${orderId}/cancel/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<Order>(res);
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand APIs
// ─────────────────────────────────────────────────────────────────────────────

/** List orders containing this brand's products */
export const getBrandOrders = async (token: string): Promise<Order[]> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/brand/orders/`, {
    headers: authHeaders(token),
  });
  return handleResponse<Order[]>(res);
};

/** Get one order containing this brand's products */
export const getBrandOrder = async (token: string, orderId: number): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/brand/orders/${orderId}/`, {
    headers: authHeaders(token),
  });
  return handleResponse<Order>(res);
};

/** Update order status (brand only) */
export const updateOrderStatus = async (
  token: string,
  orderId: number,
  orderStatus: string
): Promise<Order> => {
  const res = await apiFetch(`${API_BASE_URL}/auth/brand/orders/${orderId}/status/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ status: orderStatus }),
  });
  return handleResponse<Order>(res);
};
