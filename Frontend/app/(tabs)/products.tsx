import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView, TextInput, Modal, FlatList, ActivityIndicator, RefreshControl, Platform, ToastAndroid } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { getProducts, createProduct, updateProduct, deleteProduct, Product, ProductCreateData } from '@/services/productService';
import * as ImagePicker from 'expo-image-picker';
import { ShopFlareColors } from '@/constants/theme';
import { FASHION_CATEGORIES, FASHION_SUBCATEGORIES } from '@/constants/fashionData';
import { formatTk } from '@/utils/currency';

const showFeedback = (message: string, isError = false) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  }
  Alert.alert(isError ? 'Error' : 'Success', message);
};

export default function ProductsScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  
  // Product management state
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Product form state
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productSalePrice, setProductSalePrice] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productSubcategory, setProductSubcategory] = useState('');
  const [productImage, setProductImage] = useState('');
  const [productStock, setProductStock] = useState('');
  const [selectedImages, setSelectedImages] = useState<{uri: string, base64: string, type: string}[]>([]);
  
  const isBrand = user?.user_type === 'brand';

  const getProductImage = (product: Product) => {
    if (product.images && product.images.length > 0 && product.images[0].image_base64) {
      return `data:${product.images[0].image_type};base64,${product.images[0].image_base64}`;
    }
    if (product.image) {
      return product.image;
    }
    return null;
  };

  const loadProducts = useCallback(async () => {
    if (!isBrand || !accessToken) return;
    
    setIsLoading(true);
    try {
      const data = await getProducts(accessToken);
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
      const message = error instanceof Error ? error.message : 'Failed to load products';
      showFeedback(message, true);
    } finally {
      setIsLoading(false);
    }
  }, [isBrand, accessToken]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProducts();
    } finally {
      setRefreshing(false);
    }
  }, [loadProducts]);

  useEffect(() => {
    if (isBrand) {
      loadProducts();
    }
  }, [isBrand, loadProducts]);

  const resetProductForm = () => {
    setProductName('');
    setProductDescription('');
    setProductPrice('');
    setProductSalePrice('');
    setProductCategory('');
    setProductSubcategory('');
    setProductImage('');
    setProductStock('');
    setSelectedImages([]);
    setEditingProduct(null);
  };

  const openAddProduct = () => {
    resetProductForm();
    setShowProductModal(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductDescription(product.description || '');
    setProductPrice(product.price.toString());
    setProductSalePrice(product.sale_price?.toString() || '');
    setProductCategory(product.category || '');
    setProductSubcategory(product.subcategory || '');
    setProductImage(product.image || '');
    setProductStock(product.stock.toString());
    setSelectedImages([]);
    setShowProductModal(true);
  };

  const pickImages = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions to upload images');
      return;
    }

    // Check if already at max
    if (selectedImages.length >= 4) {
      Alert.alert('Limit reached', 'Maximum 4 images allowed per product');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - selectedImages.length,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets
        .filter(asset => asset.base64)
        .map(asset => ({
          uri: asset.uri,
          base64: asset.base64!,
          type: asset.mimeType || 'image/jpeg',
        }));
      
      setSelectedImages(prev => [...prev, ...newImages].slice(0, 4));
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveProduct = async () => {
    if (!productName || !productPrice || !accessToken) {
      showFeedback('Product name and price are required', true);
      return;
    }

    const productData: ProductCreateData = {
      name: productName,
      description: productDescription || undefined,
      price: parseFloat(productPrice),
      sale_price: productSalePrice ? parseFloat(productSalePrice) : undefined,
      category: productCategory || undefined,
      subcategory: productSubcategory || undefined,
      image: productImage || undefined,
      stock: parseInt(productStock) || 0,
      is_active: true,
      images: selectedImages.map(img => ({
        data: img.base64,
        type: img.type,
      })),
    };

    setIsLoading(true);
    try {
      if (editingProduct) {
        await updateProduct(accessToken, editingProduct.id, productData);
        showFeedback('Product updated successfully');
      } else {
        await createProduct(accessToken, productData);
        showFeedback('Product created successfully');
      }
      setShowProductModal(false);
      resetProductForm();
      await loadProducts();
      showFeedback('Product list refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save product';
      showFeedback(message, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            setIsLoading(true);
            try {
              await deleteProduct(accessToken, product.id);
              showFeedback('Product deleted');
              loadProducts();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to delete';
              showFeedback(message, true);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  // Not a brand - redirect or show message
  if (!isBrand) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="storefront-outline" size={64} color={ShopFlareColors.border} />
          <ThemedText style={styles.emptyTitle}>Brand Only</ThemedText>
          <ThemedText style={styles.emptyMessage}>This section is only available for brand accounts</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>My Products</ThemedText>
        <TouchableOpacity style={styles.addButton} onPress={openAddProduct}>
          <Ionicons name="add" size={20} color={ShopFlareColors.secondary} />
          <Text style={styles.addButtonText}>Add Product</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Section */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{products.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Total Products</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{products.filter(p => p.is_active).length}</ThemedText>
          <ThemedText style={styles.statLabel}>Active</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{products.filter(p => p.stock > 0).length}</ThemedText>
          <ThemedText style={styles.statLabel}>In Stock</ThemedText>
        </View>
      </View>

      {/* Product List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={ShopFlareColors.primary} style={{ marginTop: 40 }} />
      ) : products.length === 0 ? (
        <View style={styles.emptyProducts}>
          <Ionicons name="cube-outline" size={64} color={ShopFlareColors.textSecondary} />
          <ThemedText style={styles.emptyProductsText}>No products yet</ThemedText>
          <ThemedText style={styles.emptyProductsSubtext}>Add your first product to start selling</ThemedText>
          <TouchableOpacity style={styles.addFirstButton} onPress={openAddProduct}>
            <Ionicons name="add-circle" size={20} color={ShopFlareColors.secondary} />
            <Text style={styles.addFirstButtonText}>Add Your First Product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ShopFlareColors.primary}
              colors={[ShopFlareColors.primary]}
            />
          }
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const imageUrl = getProductImage(item);
            const mainPrice = parseFloat(String(item.price || 0));
            const discountedPrice = item.sale_price ? parseFloat(String(item.sale_price)) : null;
            const hasValidDiscount = discountedPrice !== null && discountedPrice > 0 && discountedPrice < mainPrice;
            return (
            <View style={styles.productCard}>
              <TouchableOpacity
                style={styles.productMainPress}
                onPress={() => router.push(`/productDetail?id=${item.id}`)}
                activeOpacity={0.88}
              >
                <View style={styles.productImagePlaceholder}>
                  {imageUrl ? (
                    <Image source={imageUrl} style={styles.productImage} contentFit="cover" />
                  ) : (
                    <Ionicons name="cube" size={32} color={ShopFlareColors.primary} />
                  )}
                </View>
                <View style={styles.productInfo}>
                  <ThemedText style={styles.productName}>{item.name}</ThemedText>
                  <ThemedText style={styles.productCategory}>{item.category || 'Uncategorized'}</ThemedText>
                  <View style={styles.priceRow}>
                    <ThemedText style={styles.productPrice}>
                      {formatTk(hasValidDiscount ? discountedPrice! : mainPrice)}
                    </ThemedText>
                    {hasValidDiscount && (
                      <ThemedText style={styles.salePrice}>{formatTk(mainPrice)}</ThemedText>
                    )}
                  </View>
                  <View style={styles.stockRow}>
                    <View style={[styles.stockBadge, item.stock > 0 ? styles.inStock : styles.outOfStock]}>
                      <Text style={styles.stockText}>{item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}</Text>
                    </View>
                    {!item.is_active && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveText}>Inactive</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.productActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openEditProduct(item)}
                >
                  <Ionicons name="pencil" size={20} color={ShopFlareColors.warning} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteProduct(item)}
                >
                  <Ionicons name="trash" size={20} color={ShopFlareColors.error} />
                </TouchableOpacity>
              </View>
            </View>
            );
          }}
        />
      )}

      {/* Product Modal */}
      <Modal
        visible={showProductModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProductModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowProductModal(false)}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle}>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </ThemedText>
            <TouchableOpacity onPress={handleSaveProduct} disabled={isLoading}>
              <ThemedText style={[styles.modalSave, isLoading && { opacity: 0.5 }]}>
                {isLoading ? 'Saving...' : 'Save'}
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Product Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter product name"
              value={productName}
              onChangeText={setProductName}
              placeholderTextColor={ShopFlareColors.textLight}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Enter product description"
              value={productDescription}
              onChangeText={setProductDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor={ShopFlareColors.textLight}
            />

            <Text style={styles.inputLabel}>Price *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              value={productPrice}
              onChangeText={setProductPrice}
              keyboardType="decimal-pad"
              placeholderTextColor={ShopFlareColors.textLight}
            />

            <Text style={styles.inputLabel}>Sale Price (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              value={productSalePrice}
              onChangeText={setProductSalePrice}
              keyboardType="decimal-pad"
              placeholderTextColor={ShopFlareColors.textLight}
            />

            <Text style={styles.inputLabel}>Category *</Text>
            <View style={styles.categoryPickerContainer}>
              {FASHION_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPickerItem,
                    productCategory === cat.name && styles.categoryPickerItemActive,
                  ]}
                  onPress={() => {
                    setProductCategory(cat.name);
                    setProductSubcategory('');
                  }}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={20}
                    color={productCategory === cat.name ? ShopFlareColors.secondary : ShopFlareColors.accent}
                  />
                  <Text style={[
                    styles.categoryPickerText,
                    productCategory === cat.name && styles.categoryPickerTextActive,
                  ]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {productCategory ? (
              <>
                <Text style={styles.inputLabel}>Subcategory *</Text>
                <View style={styles.subcategoryPickerContainer}>
                  {(FASHION_SUBCATEGORIES[productCategory] || []).map((sub) => (
                    <TouchableOpacity
                      key={sub}
                      style={[
                        styles.subcategoryPickerItem,
                        productSubcategory === sub && styles.subcategoryPickerItemActive,
                      ]}
                      onPress={() => setProductSubcategory(sub)}
                    >
                      <Text style={[
                        styles.subcategoryPickerText,
                        productSubcategory === sub && styles.subcategoryPickerTextActive,
                      ]}>{sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.inputLabel}>Product Images (Max 4)</Text>
            <View style={styles.imagePickerContainer}>
              {selectedImages.map((img, index) => (
                <View key={index} style={styles.imagePreviewContainer}>
                  <Image source={img.uri} style={styles.imagePreview} contentFit="cover" />
                  <TouchableOpacity 
                    style={styles.removeImageBtn}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={24} color={ShopFlareColors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {selectedImages.length < 4 && (
                <TouchableOpacity style={styles.addImageBtn} onPress={pickImages}>
                  <Ionicons name="camera" size={32} color={ShopFlareColors.textSecondary} />
                  <Text style={styles.addImageText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.inputLabel}>Stock Quantity</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0"
              value={productStock}
              onChangeText={setProductStock}
              keyboardType="number-pad"
              placeholderTextColor={ShopFlareColors.textLight}
            />
            
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ShopFlareColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: ShopFlareColors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addButtonText: {
    color: ShopFlareColors.secondary,
    fontWeight: '600',
    marginLeft: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: ShopFlareColors.secondary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statNumber: {
    color: ShopFlareColors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: ShopFlareColors.textSecondary,
    marginTop: 4,
  },
  productList: {
    padding: 16,
    paddingBottom: 100,
  },
  productCard: {
    flexDirection: 'row',
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
  productMainPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: ShopFlareColors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: ShopFlareColors.borderLight,
  },
  productInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: ShopFlareColors.text,
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 12,
    color: ShopFlareColors.textSecondary,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: ShopFlareColors.text,
  },
  salePrice: {
    fontSize: 14,
    color: ShopFlareColors.error,
    textDecorationLine: 'line-through',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inStock: {
    backgroundColor: ShopFlareColors.successLight,
  },
  outOfStock: {
    backgroundColor: ShopFlareColors.errorLight,
  },
  stockText: {
    fontSize: 11,
    fontWeight: '500',
    color: ShopFlareColors.text,
  },
  inactiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: ShopFlareColors.warningLight,
  },
  inactiveText: {
    fontSize: 11,
    fontWeight: '500',
    color: ShopFlareColors.warning,
  },
  productActions: {
    justifyContent: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ShopFlareColors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: ShopFlareColors.errorLight,
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
  emptyProducts: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyProductsText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyProductsSubtext: {
    fontSize: 14,
    color: ShopFlareColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ShopFlareColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    shadowColor: ShopFlareColors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addFirstButtonText: {
    color: ShopFlareColors.secondary,
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: ShopFlareColors.secondary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: ShopFlareColors.borderLight,
  },
  modalCancel: {
    fontSize: 16,
    color: ShopFlareColors.textSecondary,
  },
  modalTitle: {
    color: ShopFlareColors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  modalSave: {
    fontSize: 16,
    color: ShopFlareColors.accent,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
    color: ShopFlareColors.text,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: ShopFlareColors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: ShopFlareColors.background,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  imagePreviewContainer: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: ShopFlareColors.borderLight,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 12,
  },
  addImageBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: ShopFlareColors.borderLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ShopFlareColors.background,
  },
  addImageText: {
    fontSize: 10,
    color: ShopFlareColors.textSecondary,
    marginTop: 4,
  },
  categoryPickerContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryPickerItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ShopFlareColors.accent,
    backgroundColor: ShopFlareColors.secondary,
  },
  categoryPickerItemActive: {
    backgroundColor: ShopFlareColors.accent,
  },
  categoryPickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: ShopFlareColors.accent,
  },
  categoryPickerTextActive: {
    color: ShopFlareColors.secondary,
  },
  subcategoryPickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subcategoryPickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ShopFlareColors.borderLight,
    backgroundColor: ShopFlareColors.background,
  },
  subcategoryPickerItemActive: {
    backgroundColor: ShopFlareColors.accent,
    borderColor: ShopFlareColors.accent,
  },
  subcategoryPickerText: {
    fontSize: 13,
    color: ShopFlareColors.textSecondary,
  },
  subcategoryPickerTextActive: {
    color: ShopFlareColors.secondary,
    fontWeight: '600',
  },
});
