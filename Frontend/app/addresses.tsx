import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/themed-text';
import InlineMessage from '@/components/ui/inline-message';
import { ShopFlareColors } from '@/constants/theme';
import * as profileService from '@/services/profileService';
import { Address, AddressInput } from '@/services/profileService';

const LABEL_ICONS: Record<string, string> = {
  home: 'home-outline',
  work: 'briefcase-outline',
  other: 'location-outline',
};

const EMPTY_FORM: AddressInput = {
  label: 'home',
  full_name: '',
  phone: '',
  address_line1: '',
  city: '',
  postal_code: '',
  is_default: false,
};

export default function AddressesScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formMessageType, setFormMessageType] = useState<'error' | 'success' | 'info'>('error');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'full_name' | 'phone' | 'address_line1' | 'city' | 'postal_code', string>>>({});

  const loadAddresses = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const data = await profileService.getAddresses(accessToken);
      setAddresses(data);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const openAdd = () => {
    setEditingAddress(null);
    setForm(EMPTY_FORM);
    setFormMessage('');
    setFieldErrors({});
    setModalVisible(true);
  };

  const openEdit = (addr: Address) => {
    setEditingAddress(addr);
    setForm({
      label: addr.label,
      full_name: addr.full_name,
      phone: addr.phone || '',
      address_line1: addr.address_line1,
      city: addr.city,
      postal_code: addr.postal_code || '',
      is_default: addr.is_default,
    });
    setFormMessage('');
    setFieldErrors({});
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!accessToken) return;
    setFormMessage('');
    const nextFieldErrors: Partial<Record<'full_name' | 'phone' | 'address_line1' | 'city' | 'postal_code', string>> = {};

    if (!form.full_name.trim()) {
      nextFieldErrors.full_name = 'Full name is required.';
    }
    if (!form.phone?.trim()) {
      nextFieldErrors.phone = 'Phone number is required.';
    } else if (!/^[0-9]{11}$/.test(form.phone.trim())) {
      nextFieldErrors.phone = 'Phone number must be exactly 11 digits.';
    }
    if (!form.address_line1.trim()) {
      nextFieldErrors.address_line1 = 'Address line 1 is required.';
    }
    if (!form.city.trim()) {
      nextFieldErrors.city = 'City is required.';
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      if (editingAddress) {
        const updated = await profileService.updateAddress(accessToken, editingAddress.id, form);
        setAddresses(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      } else {
        const created = await profileService.createAddress(accessToken, form);
        setAddresses(prev =>
          form.is_default
            ? [created, ...prev.map(a => ({ ...a, is_default: false }))]
            : [...prev, created]
        );
      }
      setModalVisible(false);
    } catch (e: any) {
      setFormMessageType('error');
      setFormMessage(e.message || 'Failed to save address.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: Address) => {
    Alert.alert('Delete Address', `Delete "${addr.address_line1}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          try {
            await profileService.deleteAddress(accessToken, addr.id);
            setAddresses(prev => prev.filter(a => a.id !== addr.id));
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to delete address');
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (addr: Address) => {
    if (!accessToken || addr.is_default) return;
    try {
      await profileService.updateAddress(accessToken, addr.id, { is_default: true });
      setAddresses(prev =>
        prev.map(a => ({ ...a, is_default: a.id === addr.id }))
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to set default');
    }
  };

  const renderAddress = ({ item }: { item: Address }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.labelBadge}>
          <Ionicons name={LABEL_ICONS[item.label] as any} size={16} color={ShopFlareColors.primary} />
          <ThemedText style={styles.labelText}>{item.label.toUpperCase()}</ThemedText>
        </View>
        {item.is_default && (
          <View style={styles.defaultBadge}>
            <ThemedText style={styles.defaultBadgeText}>Default</ThemedText>
          </View>
        )}
      </View>
      <ThemedText style={styles.cardName}>{item.full_name}</ThemedText>
      <ThemedText style={styles.cardText}>{item.address_line1}</ThemedText>
      <ThemedText style={styles.cardText}>
        {[item.city, item.postal_code].filter(Boolean).join(', ')}
      </ThemedText>
      {item.phone && <ThemedText style={styles.cardPhone}>{item.phone}</ThemedText>}

      <View style={styles.cardActions}>
        {!item.is_default && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSetDefault(item)}
          >
            <Ionicons name="star-outline" size={16} color={ShopFlareColors.primary} />
            <ThemedText style={styles.actionBtnText}>Set Default</ThemedText>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
          <Ionicons name="pencil-outline" size={16} color={ShopFlareColors.primary} />
          <ThemedText style={styles.actionBtnText}>Edit</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
        >
          <Ionicons name="trash-outline" size={16} color={ShopFlareColors.error} />
          <ThemedText style={[styles.actionBtnText, { color: ShopFlareColors.error }]}>Delete</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAddresses();
    } finally {
      setRefreshing(false);
    }
  }, [loadAddresses]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={ShopFlareColors.secondary} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>My Addresses</ThemedText>
        <TouchableOpacity onPress={openAdd} style={styles.addButton}>
          <Ionicons name="add" size={26} color={ShopFlareColors.secondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={ShopFlareColors.primary} />
      ) : addresses.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={64} color={ShopFlareColors.secondary} />
          <ThemedText style={styles.emptyTitle}>No Addresses Yet</ThemedText>
          <ThemedText style={styles.emptySubtitle}>Add a delivery address to get started</ThemedText>
          <TouchableOpacity style={styles.addFirstBtn} onPress={openAdd}>
            <ThemedText style={styles.addFirstBtnText}>Add Address</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={item => String(item.id)}
          renderItem={renderAddress}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ShopFlareColors.primary}
              colors={[ShopFlareColors.primary]}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {editingAddress ? 'Edit Address' : 'New Address'}
              </ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={ShopFlareColors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!!formMessage && (
                <View style={styles.inlineMessageWrap}>
                  <InlineMessage message={formMessage} variant={formMessageType} />
                </View>
              )}

              {/* Label selector */}
              <ThemedText style={styles.label}>Label</ThemedText>
              <View style={styles.labelRow}>
                {(['home', 'work', 'other'] as const).map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.labelChip, form.label === l && styles.labelChipActive]}
                    onPress={() => setForm(f => ({ ...f, label: l }))}
                  >
                    <Ionicons name={LABEL_ICONS[l] as any} size={14} color={form.label === l ? ShopFlareColors.secondary : ShopFlareColors.textSecondary} />
                    <ThemedText style={[styles.labelChipText, form.label === l && styles.labelChipTextActive]}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {[
                { key: 'full_name', label: 'Full Name *', placeholder: 'Recipient full name' },
                { key: 'phone', label: 'Phone *', placeholder: 'Phone number' },
                { key: 'address_line1', label: 'Address Line 1 *', placeholder: 'Street address' },
                { key: 'city', label: 'City *', placeholder: 'City' },
                { key: 'postal_code', label: 'Postal Code', placeholder: 'ZIP / Postal code' },
                { key: 'country', label: 'Country', placeholder: 'Country' },
              ].map(field => (
                <View key={field.key} style={styles.fieldGroup}>
                  <ThemedText style={styles.label}>{field.label}</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={(form as any)[field.key] || ''}
                    onChangeText={text => {
                      setForm(f => ({ ...f, [field.key]: text }));
                      if ((fieldErrors as any)[field.key]) {
                        setFieldErrors(prev => ({ ...prev, [field.key]: '' }));
                      }
                    }}
                    placeholder={field.placeholder}
                    placeholderTextColor={ShopFlareColors.textLight}
                    keyboardType={field.key === 'phone' ? 'phone-pad' : 'default'}
                  />
                  {!!(fieldErrors as any)[field.key] && (
                    <ThemedText style={styles.fieldErrorText}>{(fieldErrors as any)[field.key]}</ThemedText>
                  )}
                </View>
              ))}

              {/* Default toggle */}
              <TouchableOpacity
                style={styles.defaultToggle}
                onPress={() => setForm(f => ({ ...f, is_default: !f.is_default }))}
              >
                <Ionicons
                  name={form.is_default ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={ShopFlareColors.primary}
                />
                <ThemedText style={styles.defaultToggleText}>Set as default address</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={ShopFlareColors.secondary} />
                ) : (
                  <ThemedText style={styles.saveButtonText}>
                    {editingAddress ? 'Save Changes' : 'Add Address'}
                  </ThemedText>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ShopFlareColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
    backgroundColor: ShopFlareColors.primary,
  },
  backButton: { padding: 8 },
  addButton: { padding: 8 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: ShopFlareColors.secondary },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: ShopFlareColors.background,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: ShopFlareColors.borderLight,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  labelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ShopFlareColors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  labelText: { fontSize: 11, fontWeight: '700', color: ShopFlareColors.primary },
  defaultBadge: {
    backgroundColor: ShopFlareColors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '700', color: ShopFlareColors.secondary },
  cardName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardText: { fontSize: 14, color: ShopFlareColors.textSecondary, lineHeight: 20 },
  cardPhone: { fontSize: 13, color: ShopFlareColors.textLight, marginTop: 4 },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ShopFlareColors.borderLight,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteBtn: {},
  actionBtnText: { fontSize: 13, color: ShopFlareColors.primary, fontWeight: '600' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: ShopFlareColors.textSecondary, textAlign: 'center', marginBottom: 24 },
  addFirstBtn: {
    backgroundColor: ShopFlareColors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    shadowColor: ShopFlareColors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addFirstBtnText: { color: ShopFlareColors.secondary, fontWeight: '700', fontSize: 15 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: ShopFlareColors.secondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  inlineMessageWrap: { marginBottom: 12 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: ShopFlareColors.textSecondary, marginBottom: 5 },
  fieldErrorText: {
    color: ShopFlareColors.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1.5,
    borderColor: ShopFlareColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: ShopFlareColors.text,
    backgroundColor: ShopFlareColors.background,
  },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ShopFlareColors.borderLight,
  },
  labelChipActive: { backgroundColor: ShopFlareColors.accent },
  labelChipText: { fontSize: 13, fontWeight: '600', color: ShopFlareColors.textSecondary },
  labelChipTextActive: { color: ShopFlareColors.secondary },
  defaultToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  defaultToggleText: { fontSize: 14, fontWeight: '600' },
  saveButton: {
    backgroundColor: ShopFlareColors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  saveButtonText: { color: ShopFlareColors.secondary, fontSize: 16, fontWeight: '700' },
});
