import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import InlineMessage from '@/components/ui/inline-message';
import { Ionicons } from '@expo/vector-icons';
import { ShopFlareColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useFashion } from '@/context/FashionContext';
import { getAddresses, Address } from '@/services/profileService';
import {
  checkout,
  guestCheckout,
  checkoutInitPayment,
  guestCheckoutInitPayment,
  saveGuestOrderRef,
  CheckoutData,
  GuestCheckoutData,
} from '@/services/orderService';
import { formatTk } from '@/utils/currency';
import { calculateShippingCharge } from '@/utils/shipping';

// Open an external payment URL. On web we navigate the browser tab directly;
// on a native device (Expo Go / dev build) window.location.href is not
// available, so we use Linking.openURL which is the correct native API.
async function openPaymentUrl(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    window.location.href = url;
  } else {
    await Linking.openURL(url);
  }
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { cart, getTotalPrice, getCartItemCount, clearCart, fetchProducts } = useFashion();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPlacing, setIsPlacing] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('error');
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestFullName, setGuestFullName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestAddressLine1, setGuestAddressLine1] = useState('');
  const [guestCity, setGuestCity] = useState('');
  const [guestPostalCode, setGuestPostalCode] = useState('');
  const [guestCountry, setGuestCountry] = useState('Bangladesh');

  const subtotal = getTotalPrice();
  const shipping = calculateShippingCharge(subtotal);
  const total = subtotal + shipping;

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getAddresses(accessToken);
      setAddresses(data);
      // Auto-select default address
      const defaultAddr = data.find(a => a.is_default);
      if (defaultAddr) setSelectedAddressId(defaultAddr.id);
      else if (data.length > 0) setSelectedAddressId(data[0].id);
    } catch (err) {
      console.error('Failed to load addresses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    setFormMessage('');
    setPlacedOrderId(null);

    if (cart.length === 0) {
      setMessageType('error');
      setFormMessage('Your cart is empty.');
      return;
    }

    if (accessToken && !selectedAddressId) {
      setMessageType('error');
      setFormMessage('Please select or add a shipping address before placing your order.');
      return;
    }

    if (accessToken && selectedAddressId) {
      const selectedAddress = addresses.find((addr) => addr.id === selectedAddressId);
      if (!selectedAddress?.phone || !selectedAddress.phone.trim()) {
        setMessageType('error');
        setFormMessage('Phone number is required. Please update the selected address phone number.');
        return;
      }
      if (!/^\d{11}$/.test(selectedAddress.phone.trim())) {
        setMessageType('error');
        setFormMessage('Phone number must be exactly 11 digits in selected address.');
        return;
      }
    }

    if (!accessToken) {
      if (!guestEmail || !guestFullName || !guestPhone || !guestAddressLine1 || !guestCity || !guestCountry) {
        setMessageType('error');
        setFormMessage('Please fill all required guest shipping fields.');
        return;
      }

      const productItems: GuestCheckoutData['items'] = [];
      for (const item of cart) {
        const productId = Number(item.id);
        if (!Number.isFinite(productId)) {
          continue;
        }
        productItems.push({
          product_id: productId,
          quantity: item.quantity,
          selected_size: item.selectedSize || undefined,
          selected_color: item.selectedColor || undefined,
        });
      }

      if (productItems.length === 0) {
        setMessageType('error');
        setFormMessage('Your cart has invalid items. Please refresh and try again.');
        return;
      }

      if (!/^\d{11}$/.test(guestPhone.trim())) {
        setMessageType('error');
        setFormMessage('Phone number must be exactly 11 digits.');
        return;
      }
    }

    setIsPlacing(true);
    try {
      let order;

      if (accessToken) {
        const checkoutData: CheckoutData = {
          address_id: selectedAddressId!,
          payment_method: paymentMethod,
          notes: notes.trim() || undefined,
        };

        if (paymentMethod === 'cod') {
          order = await checkout(accessToken, checkoutData);

          // Cart is already cleared by the backend; refresh local state
          await clearCart();
          await fetchProducts(); // refresh stock

          setPlacedOrderId(order.id);
          setMessageType('success');
          setFormMessage(`Your order #${order.id} has been placed successfully.`);
          router.replace(`/orderDetail?id=${order.id}`);
          return;
        }

        const paymentInit = await checkoutInitPayment(accessToken, checkoutData);
        order = paymentInit.order;

        // Real SSLCommerz redirect vs local mock fallback (when SSL is unavailable).
        if (paymentInit.is_mock) {
          try {
            const sep = paymentInit.payment_url.includes('?') ? '&' : '?';
            await fetch(`${paymentInit.payment_url}${sep}no_redirect=1`, { method: 'GET' });
          } catch {
            // best-effort; the order completion is idempotent
          }
          await clearCart();
          await fetchProducts();
          setMessageType('success');
          setFormMessage(`Payment completed (demo mode). Order #${order.id} is confirmed.`);
          router.replace(`/orderDetail?id=${order.id}`);
          return;
        }

        setMessageType('info');
        setFormMessage(`Continue payment in SSLCommerz. Your order will appear after successful payment.`);
        await openPaymentUrl(paymentInit.payment_url);
        return;
      } else {
        const guestData: GuestCheckoutData = {
          guest_email: guestEmail,
          shipping_full_name: guestFullName,
          shipping_phone: guestPhone,
          shipping_address_line1: guestAddressLine1,
          shipping_city: guestCity,
          shipping_postal_code: guestPostalCode || undefined,
          shipping_country: guestCountry,
          payment_method: paymentMethod,
          notes: notes.trim() || undefined,
          items: (() => {
            const safeItems: GuestCheckoutData['items'] = [];
            for (const item of cart) {
              const productId = Number(item.id);
              if (!Number.isFinite(productId)) {
                continue;
              }
              safeItems.push({
                product_id: productId,
                quantity: item.quantity,
                selected_size: item.selectedSize || undefined,
                selected_color: item.selectedColor || undefined,
              });
            }
            return safeItems;
          })(),
        };

        if (paymentMethod === 'cod') {
          order = await guestCheckout(guestData);

          // Cart is already cleared by the backend; refresh local state
          await clearCart();
          await fetchProducts(); // refresh stock

          setPlacedOrderId(order.id);
          setMessageType('success');
          setFormMessage(`Your order #${order.id} has been placed successfully.`);
        } else {
          const paymentInit = await guestCheckoutInitPayment(guestData);
          order = paymentInit.order;
          setMessageType('info');
          setFormMessage(`Continue payment in SSLCommerz. Your order will appear after successful payment.`);
          await openPaymentUrl(paymentInit.payment_url);
          return;
        }
      }

      await saveGuestOrderRef(order);
      if (order.guest_access_token) {
        router.replace(`/orderDetail?id=${order.id}&guestToken=${encodeURIComponent(order.guest_access_token)}`);
        return;
      }
    } catch (err: any) {
      setMessageType('error');
      setFormMessage(err.message || 'Checkout failed. Something went wrong.');
    } finally {
      setIsPlacing(false);
    }
  };

  const paymentMethods = [
    { key: 'cod' as const, label: 'Cash on Delivery', icon: 'cash-outline' as const },
    { key: 'online' as const, label: 'Pay Online (SSLCommerz)', icon: 'card-outline' as const },
  ];

  if (isLoading) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={ShopFlareColors.secondary} />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Checkout</ThemedText>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={ShopFlareColors.primary} />
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={ShopFlareColors.secondary} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Checkout</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!!formMessage && (
          <View style={styles.messageWrap}>
            <InlineMessage message={formMessage} variant={messageType} />
          </View>
        )}

        {placedOrderId && accessToken && (
          <View style={styles.postOrderActions}>
            <TouchableOpacity style={styles.postOrderPrimary} onPress={() => router.replace('/(tabs)/orders')}>
              <ThemedText style={styles.postOrderPrimaryText}>View Orders</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.postOrderSecondary} onPress={() => router.replace('/(tabs)')}>
              <ThemedText style={styles.postOrderSecondaryText}>Continue Shopping</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Shipping Address Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={20} color={ShopFlareColors.primary} />
            <ThemedText style={styles.sectionTitle}>{accessToken ? 'Shipping Address' : 'Guest Shipping Details'}</ThemedText>
          </View>

          {!accessToken ? (
            <View style={styles.guestFormCard}>
              <TextInput
                style={styles.guestInput}
                placeholder="Email *"
                placeholderTextColor={ShopFlareColors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                value={guestEmail}
                onChangeText={setGuestEmail}
              />
              <TextInput
                style={styles.guestInput}
                placeholder="Full Name *"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestFullName}
                onChangeText={setGuestFullName}
              />
              <TextInput
                style={styles.guestInput}
                placeholder="Phone *"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestPhone}
                onChangeText={setGuestPhone}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.guestInput}
                placeholder="Address Line 1 *"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestAddressLine1}
                onChangeText={setGuestAddressLine1}
              />
              <TextInput
                style={styles.guestInput}
                placeholder="City *"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestCity}
                onChangeText={setGuestCity}
              />
              <TextInput
                style={styles.guestInput}
                placeholder="Postal Code"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestPostalCode}
                onChangeText={setGuestPostalCode}
              />
              <TextInput
                style={styles.guestInput}
                placeholder="Country *"
                placeholderTextColor={ShopFlareColors.textLight}
                value={guestCountry}
                onChangeText={setGuestCountry}
              />
            </View>
          ) : addresses.length === 0 ? (
            <TouchableOpacity style={styles.addAddressCard} onPress={() => router.push('/addresses')}>
              <Ionicons name="add-circle-outline" size={32} color={ShopFlareColors.primary} />
              <ThemedText style={styles.addAddressText}>Add a shipping address</ThemedText>
            </TouchableOpacity>
          ) : (
            addresses.map(addr => (
              <TouchableOpacity
                key={addr.id}
                style={[
                  styles.addressCard,
                  selectedAddressId === addr.id && styles.addressCardSelected,
                ]}
                onPress={() => setSelectedAddressId(addr.id)}
              >
                <View style={styles.addressRadio}>
                  <Ionicons
                    name={selectedAddressId === addr.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selectedAddressId === addr.id ? ShopFlareColors.primary : ShopFlareColors.border}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.addressLabelRow}>
                    <ThemedText style={styles.addressName}>{addr.full_name}</ThemedText>
                    <View style={[styles.labelBadge, { backgroundColor: addr.label === 'home' ? ShopFlareColors.infoLight : ShopFlareColors.warningLight }]}>
                      <ThemedText style={[styles.labelText, { color: addr.label === 'home' ? ShopFlareColors.info : ShopFlareColors.warning }]}>
                        {addr.label.charAt(0).toUpperCase() + addr.label.slice(1)}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.addressLine}>{addr.address_line1}</ThemedText>
                  <ThemedText style={styles.addressLine}>
                    {addr.city}{addr.postal_code ? `, ${addr.postal_code}` : ''}
                  </ThemedText>
                  {addr.phone ? <ThemedText style={styles.addressPhone}>{addr.phone}</ThemedText> : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Payment Method Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card-outline" size={20} color={ShopFlareColors.primary} />
            <ThemedText style={styles.sectionTitle}>Payment Method</ThemedText>
          </View>
          {paymentMethods.map(pm => (
            <TouchableOpacity
              key={pm.key}
              style={[styles.paymentCard, paymentMethod === pm.key && styles.paymentCardSelected]}
              onPress={() => setPaymentMethod(pm.key)}
            >
              <Ionicons
                name={paymentMethod === pm.key ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={paymentMethod === pm.key ? ShopFlareColors.primary : ShopFlareColors.border}
              />
              <Ionicons name={pm.icon} size={22} color={ShopFlareColors.textSecondary} style={{ marginLeft: 12 }} />
              <ThemedText style={styles.paymentLabel}>{pm.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Order Summary Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt-outline" size={20} color={ShopFlareColors.primary} />
            <ThemedText style={styles.sectionTitle}>Order Summary</ThemedText>
          </View>
          <View style={styles.summaryCard}>
            {cart.map(item => (
              <View key={`${item.id}-${item.selectedSize}-${item.selectedColor}`} style={styles.summaryItem}>
                <ThemedText style={styles.summaryItemName} numberOfLines={1}>
                  {item.name} × {item.quantity}
                </ThemedText>
                <ThemedText style={styles.summaryItemPrice}>
                  {formatTk(parseFloat(String(item.price)) * item.quantity)}
                </ThemedText>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Subtotal ({getCartItemCount()} items)</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatTk(subtotal)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Shipping</ThemedText>
              <ThemedText style={styles.summaryValue}>{shipping === 0 ? 'FREE' : formatTk(shipping)}</ThemedText>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <ThemedText style={styles.totalLabel}>Total</ThemedText>
              <ThemedText style={styles.totalValue}>{formatTk(total)}</ThemedText>
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbox-outline" size={20} color={ShopFlareColors.primary} />
            <ThemedText style={styles.sectionTitle}>Order Notes (optional)</ThemedText>
          </View>
          <TextInput
            style={styles.notesInput}
            placeholder="Any special instructions…"
            placeholderTextColor={ShopFlareColors.textLight}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Place Order Button */}
      <View style={styles.footerContainer}>
        <View style={styles.footerRow}>
          <ThemedText style={styles.footerTotal}>Total: {formatTk(total)}</ThemedText>
        </View>
        <TouchableOpacity
          style={[styles.placeOrderButton, (isPlacing || !!placedOrderId) && { opacity: 0.7 }]}
          onPress={handlePlaceOrder}
          disabled={isPlacing || !!placedOrderId}
        >
          {isPlacing ? (
            <ActivityIndicator color={ShopFlareColors.secondary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={ShopFlareColors.secondary} />
              <ThemedText style={styles.placeOrderText}>
                {paymentMethod === 'cod' ? 'Place Order' : 'Pay with SSLCommerz'}
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ShopFlareColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: ShopFlareColors.primary,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: ShopFlareColors.secondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 16 },
  messageWrap: { marginBottom: 8 },
  postOrderActions: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: ShopFlareColors.borderLight,
    gap: 10,
  },
  postOrderPrimary: {
    backgroundColor: ShopFlareColors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  postOrderPrimaryText: {
    color: ShopFlareColors.secondary,
    fontWeight: '700',
    fontSize: 14,
  },
  postOrderSecondary: {
    borderWidth: 1,
    borderColor: ShopFlareColors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  postOrderSecondaryText: {
    color: ShopFlareColors.accent,
    fontWeight: '700',
    fontSize: 14,
  },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: ShopFlareColors.text },

  // Address
  addAddressCard: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: ShopFlareColors.border,
    borderStyle: 'dashed',
  },
  addAddressText: { marginTop: 8, color: ShopFlareColors.primary, fontWeight: '600' },
  guestFormCard: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ShopFlareColors.borderLight,
    gap: 10,
  },
  guestInput: {
    backgroundColor: ShopFlareColors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ShopFlareColors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ShopFlareColors.text,
    fontSize: 14,
  },
  addressCard: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: ShopFlareColors.borderLight,
  },
  addressCardSelected: { borderColor: ShopFlareColors.primary },
  addressRadio: { marginRight: 12, marginTop: 2 },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addressName: { fontWeight: '700', fontSize: 15, color: ShopFlareColors.text },
  labelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  labelText: { fontSize: 11, fontWeight: '600' },
  addressLine: { fontSize: 13, color: ShopFlareColors.textSecondary, lineHeight: 20 },
  addressPhone: { fontSize: 13, color: ShopFlareColors.textLight, marginTop: 4 },

  // Payment
  paymentCard: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: ShopFlareColors.borderLight,
  },
  paymentCardSelected: { borderColor: ShopFlareColors.primary },
  paymentLabel: { marginLeft: 12, fontSize: 14, fontWeight: '500', color: ShopFlareColors.text },

  // Summary
  summaryCard: { backgroundColor: ShopFlareColors.secondary, borderRadius: 14, padding: 16 },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryItemName: { flex: 1, fontSize: 13, color: ShopFlareColors.textSecondary, marginRight: 8 },
  summaryItemPrice: { fontSize: 13, fontWeight: '600', color: ShopFlareColors.text },
  divider: { height: 1, backgroundColor: ShopFlareColors.borderLight, marginVertical: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 14, color: ShopFlareColors.textLight },
  summaryValue: { fontSize: 14, fontWeight: '500', color: ShopFlareColors.text },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: ShopFlareColors.text },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: ShopFlareColors.primary },

  // Notes
  notesInput: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: ShopFlareColors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Footer
  footerContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: ShopFlareColors.secondary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  footerTotal: { fontSize: 18, fontWeight: 'bold', color: ShopFlareColors.primary },
  placeOrderButton: {
    flexDirection: 'row',
    backgroundColor: ShopFlareColors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: ShopFlareColors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  placeOrderText: { fontSize: 16, fontWeight: '700', color: ShopFlareColors.secondary },
});
