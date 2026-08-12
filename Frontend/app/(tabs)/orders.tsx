import { StyleSheet, View, TouchableOpacity, FlatList, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { ShopFlareColors } from '@/constants/theme';
import React, { useState, useEffect, useCallback, Fragment } from 'react';
import {
  getOrders,
  getBrandOrders,
  getGuestOrderRefs,
  getGuestOrderDetail,
  cancelOrder,
  updateOrderStatus,
  Order,
} from '@/services/orderService';
import { formatTk } from '@/utils/currency';

export default function OrdersScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const isBrand = user?.user_type === 'brand';

  useEffect(() => {
    if (accessToken) {
      fetchOrders();
    } else {
      fetchGuestOrders();
    }
  }, [accessToken, isBrand]);

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const data = isBrand ? await getBrandOrders(accessToken) : await getOrders(accessToken);
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, isBrand]);

  const fetchGuestOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const refs = await getGuestOrderRefs();
      if (refs.length === 0) {
        setOrders([]);
        return;
      }

      const fetched = await Promise.all(
        refs.map(async (ref) => {
          try {
            return await getGuestOrderDetail(ref.id, ref.token);
          } catch {
            return null;
          }
        })
      );

      const guestOrders = fetched.filter((order): order is Order => !!order);
      setOrders(guestOrders);
    } catch (err) {
      console.error('Failed to fetch guest orders:', err);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (accessToken) {
        await fetchOrders();
      } else {
        await fetchGuestOrders();
      }
    } finally {
      setRefreshing(false);
    }
  }, [accessToken, fetchGuestOrders, fetchOrders]);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return ShopFlareColors.statusPending;
      case 'confirmed': return ShopFlareColors.statusConfirmed;
      case 'processing': return ShopFlareColors.statusProcessing;
      case 'shipped': return ShopFlareColors.statusShipped;
      case 'delivered': return ShopFlareColors.statusDelivered;
      case 'cancelled': return ShopFlareColors.statusCancelled;
      case 'refunded': return ShopFlareColors.statusRefunded;
      default: return ShopFlareColors.textLight;
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'pending': return ShopFlareColors.statusPendingLight;
      case 'confirmed': return ShopFlareColors.statusConfirmedLight;
      case 'processing': return ShopFlareColors.statusProcessingLight;
      case 'shipped': return ShopFlareColors.statusShippedLight;
      case 'delivered': return ShopFlareColors.statusDeliveredLight;
      case 'cancelled': return ShopFlareColors.statusCancelledLight;
      case 'refunded': return ShopFlareColors.statusRefundedLight;
      default: return ShopFlareColors.background;
    }
  };

  const filteredOrders =
    selectedFilter === 'all' ? orders : orders.filter(o => o.status === selectedFilter);

  const handleCancel = (item: Order) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await cancelOrder(accessToken, item.id, item.guest_access_token);
            Alert.alert('Cancelled', `Order #${item.id} has been cancelled.`);
            fetchOrders();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to cancel order');
          }
        },
      },
    ]);
  };

  const handleStatusUpdate = (orderId: number, newStatus: string) => {
    if (!accessToken) return;
    Alert.alert('Update Status', `Mark this order as "${newStatus}"?`, [
      { text: 'No' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            const updated = await updateOrderStatus(accessToken, orderId, newStatus);
            Alert.alert('Updated', `Order #${orderId} is now "${updated.status}".`);
            fetchOrders();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update status');
          }
        },
      },
    ]);
  };

  const getNextStatus = (current: string): string | null => {
    const flow: Record<string, string> = {
      pending: 'confirmed',
      confirmed: 'processing',
      processing: 'shipped',
      shipped: 'delivered',
    };
    return flow[current] || null;
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const itemSummary = item.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ');
    const canCancel = !isBrand && ['pending', 'confirmed'].includes(item.status);

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => {
          if (!accessToken && item.guest_access_token) {
            router.push(`/orderDetail?id=${item.id}&guestToken=${item.guest_access_token}`);
            return;
          }
          router.push(`/orderDetail?id=${item.id}`);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.orderHeader}>
          <ThemedText style={styles.orderNumber}>Order #{item.id}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor(item.status) }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.orderInfo}>
          {isBrand && (
            <View style={styles.orderRow}>
              <Ionicons name="person-outline" size={16} color={ShopFlareColors.textSecondary} />
              <ThemedText style={styles.orderRowText}>{item.username}</ThemedText>
            </View>
          )}

          {/* Brand-facing visual status stepper (Pending → … → Delivered) */}
          {isBrand && (() => {
            const STAGES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
            const currentIdx = STAGES.indexOf(item.status);
            const idx = currentIdx === -1 ? 0 : currentIdx;
            const next = getNextStatus(item.status);
            return (
              <View style={{ marginTop: 8 }}>
                <ThemedText style={styles.currentStageText}>
                  Current: {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </ThemedText>
                <View style={styles.stepper}>
                  {STAGES.map((stage, i) => {
                    const done = i <= idx;
                    const dotColor = done ? ShopFlareColors.accent : ShopFlareColors.statusCancelled;
                    return (
                      <Fragment key={stage}>
                        <View style={styles.stepNode}>
                          <View
                            style={[
                              styles.stepCircle,
                              {
                                backgroundColor: done ? ShopFlareColors.accent : ShopFlareColors.background,
                                borderColor: dotColor,
                              },
                            ]}
                          />
                          <ThemedText
                            style={[
                              styles.stepLabel,
                              { color: done ? ShopFlareColors.text : ShopFlareColors.textLight },
                            ]}
                          >
                            {stage.charAt(0).toUpperCase() + stage.slice(1)}
                          </ThemedText>
                        </View>
                        {i < STAGES.length - 1 && (
                          <View
                            style={[
                              styles.stepLine,
                              { backgroundColor: i < idx ? ShopFlareColors.accent : ShopFlareColors.statusCancelledLight },
                            ]}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </View>
                {next ? (
                  <TouchableOpacity
                    style={styles.advanceBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleStatusUpdate(item.id, next);
                    }}
                  >
                    <ThemedText style={styles.advanceBtnText}>
                      Advance to {next.charAt(0).toUpperCase() + next.slice(1)}
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <ThemedText style={[styles.currentStageText, { textAlign: 'center' }]}>
                    Order fully delivered ✓
                  </ThemedText>
                )}
              </View>
            );
          })()}
          <View style={styles.orderRow}>
            <Ionicons name="cube-outline" size={16} color={ShopFlareColors.textSecondary} />
            <ThemedText style={styles.orderRowText} numberOfLines={2}>{itemSummary}</ThemedText>
          </View>
          <View style={styles.orderRow}>
            <Ionicons name="calendar-outline" size={16} color={ShopFlareColors.textSecondary} />
            <ThemedText style={styles.orderRowText}>
              {new Date(item.created_at).toLocaleDateString()}
            </ThemedText>
          </View>
        </View>

        <View style={styles.orderFooter}>
          <ThemedText style={styles.orderTotal}>{formatTk(item.total_amount)}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={(e) => { e.stopPropagation?.(); handleCancel(item); }}
              >
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={20} color={ShopFlareColors.textLight} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // --- Not signed in ---
  if (!accessToken) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>My Orders</ThemedText>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchGuestOrders}>
            <Ionicons name="refresh" size={22} color={ShopFlareColors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={ShopFlareColors.primary} style={{ marginTop: 40 }} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color={ShopFlareColors.border} />
            <ThemedText style={styles.emptyTitle}>No guest orders found</ThemedText>
            <ThemedText style={styles.emptyMessage}>Place an order to see it here, or sign in to view account orders</ThemedText>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={item => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={ShopFlareColors.primary}
                colors={[ShopFlareColors.primary]}
              />
            }
            contentContainerStyle={styles.orderList}
            showsVerticalScrollIndicator={false}
            renderItem={renderOrder}
          />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>
          {isBrand ? 'Customer Orders' : 'My Orders'}
        </ThemedText>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchOrders}>
          <Ionicons name="refresh" size={22} color={ShopFlareColors.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: ShopFlareColors.statusPendingLight }]}>
            <Ionicons name="time-outline" size={20} color={ShopFlareColors.statusPending} />
          </View>
          <ThemedText style={styles.statNumber}>
            {orders.filter(o => o.status === 'pending').length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Pending</ThemedText>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: ShopFlareColors.statusConfirmedLight }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={ShopFlareColors.statusConfirmed} />
          </View>
          <ThemedText style={styles.statNumber}>
            {orders.filter(o => o.status === 'confirmed').length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Confirmed</ThemedText>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: ShopFlareColors.statusShippedLight }]}>
            <Ionicons name="airplane-outline" size={20} color={ShopFlareColors.statusShipped} />
          </View>
          <ThemedText style={styles.statNumber}>
            {orders.filter(o => o.status === 'shipped').length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Shipped</ThemedText>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: ShopFlareColors.statusDeliveredLight }]}>
            <Ionicons name="checkmark-done-outline" size={20} color={ShopFlareColors.statusDelivered} />
          </View>
          <ThemedText style={styles.statNumber}>
            {orders.filter(o => o.status === 'delivered').length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Delivered</ThemedText>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedFilter === item.key && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedFilter(item.key)}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </ThemedText>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Orders List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={ShopFlareColors.primary} style={{ marginTop: 40 }} />
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyOrders}>
          <Ionicons name="receipt-outline" size={64} color={ShopFlareColors.border} />
          <ThemedText style={styles.emptyOrdersText}>No orders yet</ThemedText>
          <ThemedText style={styles.emptyOrdersSubtext}>
            {isBrand
              ? "When customers order your products, they'll appear here"
              : 'Your placed orders will appear here'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={item => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ShopFlareColors.primary}
              colors={[ShopFlareColors.primary]}
            />
          }
          contentContainerStyle={styles.orderList}
          showsVerticalScrollIndicator={false}
          renderItem={renderOrder}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ShopFlareColors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
    backgroundColor: ShopFlareColors.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: ShopFlareColors.secondary,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.79)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: ShopFlareColors.secondary,
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: -8,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: ShopFlareColors.text,
  },
  statLabel: {
    fontSize: 10,
    color: ShopFlareColors.textSecondary,
    marginTop: 2,
  },
  filterContainer: {
    backgroundColor: ShopFlareColors.secondary,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ShopFlareColors.borderLight,
    marginTop: -10,
    marginBottom : -2,
  },
  filterList: {
    paddingHorizontal: 10,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: ShopFlareColors.borderLight,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: ShopFlareColors.accent,
  },
  filterText: {
    fontSize: 14,
    color: ShopFlareColors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: ShopFlareColors.secondary,
  },
  orderList: {
    padding: 16,
    paddingBottom: 100,
  },
  orderCard: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: ShopFlareColors.primary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderInfo: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ShopFlareColors.borderLight,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderRowText: {
    fontSize: 14,
    color: ShopFlareColors.text,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: ShopFlareColors.text,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: ShopFlareColors.textSecondary,
    textAlign: 'center',
  },
  emptyOrders: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyOrdersText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyOrdersSubtext: {
    fontSize: 14,
    color: ShopFlareColors.textSecondary,
    textAlign: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: ShopFlareColors.statusCancelled,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: ShopFlareColors.statusCancelled,
  },
  // ── Brand order status stepper ──
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  stepNode: {
    alignItems: 'center',
    width: 56,
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginBottom: 4,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 2,
    alignSelf: 'center',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  advanceBtn: {
    backgroundColor: ShopFlareColors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  advanceBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: ShopFlareColors.secondary,
  },
  currentStageText: {
    fontSize: 12,
    color: ShopFlareColors.textSecondary,
    marginBottom: 2,
  },
});
