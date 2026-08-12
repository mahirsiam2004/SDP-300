import { API_BASE_URL } from './productService';

export interface AppNotification {
  id: number;
  notification_type: 'order' | 'message' | 'system';
  title: string;
  body: string | null;
  is_read: boolean;
  related_order: number | null;
  related_product: number | null;
  created_at: string;
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || 'Request failed');
  }
  return res.json() as Promise<T>;
}

export const getNotifications = async (token: string): Promise<AppNotification[]> => {
  const res = await fetch(`${API_BASE_URL}/auth/notifications/`, {
    headers: authHeaders(token),
  });
  return handleResponse<AppNotification[]>(res);
};

export const getUnreadNotificationsCount = async (token: string): Promise<number> => {
  const res = await fetch(`${API_BASE_URL}/auth/notifications/unread-count/`, {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ unread_count: number }>(res);
  return data.unread_count || 0;
};

export const markNotificationRead = async (token: string, notificationId: number): Promise<AppNotification> => {
  const res = await fetch(`${API_BASE_URL}/auth/notifications/${notificationId}/read/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<AppNotification>(res);
};

export const markAllNotificationsRead = async (token: string): Promise<{ updated: number }> => {
  const res = await fetch(`${API_BASE_URL}/auth/notifications/read-all/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<{ updated: number }>(res);
};
