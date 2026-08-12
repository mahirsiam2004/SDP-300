import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/themed-text';

import InlineMessage from '@/components/ui/inline-message';
import { Image as RNImage } from 'react-native';
import { ShopFlareColors } from '@/constants/theme';
import * as productService from '@/services/productService';
import { API_BASE_URL } from '@/services/productService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductImage {
  id: number;
  image_base64: string;
  image_type: string;
  order: number;
  created_at: string;
}

interface Product {
  id: number;
  name: string;
  image?: string;
  images?: ProductImage[];
  // add more product fields from your actual product model
}

interface Prediction {
  product_id: number;
  week: string;
  predicted_units_sold: number;
}

interface PredictionModel {
  trained_at: string;
  csv_path: string;
  feature_names: string[];
  learning_rate: number;
  epochs: number;
  use_rolling_feature: boolean;
  final_loss: number;
}

interface PredictionResponse {
  status: 'ok' | 'error';
  model?: PredictionModel;
  predictions?: Prediction[];
  message?: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

//const BACKEND_URL = '${API_BASE_URL}/auth/get-ai-url/';
//console.log('API_BASE_URL at runtime:', API_BASE_URL);
//const BACKEND_URL = `${API_BASE_URL.replace(/\/api\/?$/, '')}/get-ai-url/`;
const BACKEND_URL = API_BASE_URL + '/auth/get-ai-url/';
//console.log('BACKEND_URL at runtime:', BACKEND_URL);


async function fetchWeeklyPrediction(predictionUrl: string, productIds: number[]): Promise<PredictionResponse> {
  const response = await fetch(predictionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_ids: productIds }),
  });
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  return response.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getPredictionColor(units: number) {
  if (units >= 10) return '#22c55e';
  if (units >= 5) return ShopFlareColors.accent;
  return '#f59e0b';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PredictionBadgeProps {
  prediction?: Prediction;
  loading?: boolean;
}

function PredictionBadge({ prediction, loading }: PredictionBadgeProps) {
  if (loading) {
    return (
      <View style={badge.wrapper}>
        <ActivityIndicator size="small" color={ShopFlareColors.accent} />
      </View>
    );
  }
  if (!prediction) return null;

  const color = getPredictionColor(prediction.predicted_units_sold);
  return (
    <View style={[badge.wrapper, { borderColor: color + '33', backgroundColor: color + '15' }]}>
      <Ionicons name="trending-up" size={13} color={color} />
      <ThemedText style={[badge.text, { color }]}>
        {Math.ceil(prediction.predicted_units_sold)} units
      </ThemedText>
    </View>
  );
}

const badge = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ShopFlareColors.border,
    backgroundColor: ShopFlareColors.accentLight,
  },
  text: { fontSize: 12, fontWeight: '700' },
});

interface ProductCardProps {
  product: Product;
  prediction?: Prediction;
  predicting: boolean;
  onPredict: (id: number) => void;
  showExpanded: boolean;
}

function ProductCard({ product, prediction, predicting, onPredict, showExpanded }: ProductCardProps) {
    // Debug log for product image
    //console.log('Product image for product', product.id, ':', product.image, product.images?.[0]?.image_base64);
    const images = Array.isArray(product.images) ? product.images : [];
  return (
    <View style={card.container}>
      <View style={card.row}>
        {/* Avatar */}
        <View style={card.avatar}>
          {images.length > 0 && images[0].image_base64 ? (
            <RNImage
              source={{
                uri: `data:${images[0].image_type || 'image/jpeg'};base64,${images[0].image_base64}`,
              }}
              style={{ width: 44, height: 44, borderRadius: 12 }}
              resizeMode="cover"
            />
          ) : (
            <ThemedText style={card.avatarText}>
              {product.name && typeof product.name === 'string' && product.name.trim().length > 0
                ? product.name.charAt(0).toUpperCase()
                : '#'}
            </ThemedText>
          )}
        </View>

        <View style={card.info}>
          <ThemedText style={card.name} numberOfLines={1}>{product.name}</ThemedText>
          {/*<ThemedText style={card.id}>Product #{product.id}</ThemedText>*/}
        </View>

        {/* Predict button or badge */}
        {prediction ? (
          <PredictionBadge prediction={prediction} />
        ) : (
          <TouchableOpacity
            style={[card.predictBtn, predicting && card.predictBtnDisabled]}
            onPress={() => onPredict(product.id)}
            disabled={predicting}
          >
            {predicting ? (
              <ActivityIndicator size="small" color={ShopFlareColors.secondary} />
            ) : (
              <>
                <Ionicons name="flash" size={13} color={ShopFlareColors.secondary} />
                <ThemedText style={card.predictBtnText}>Predict</ThemedText>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded prediction detail */}
      {showExpanded && prediction && (
        <View style={card.expanded}>
          <View style={card.expandedRow}>
            <ThemedText style={card.expandedLabel}>Predicted Units</ThemedText>
            <ThemedText style={[card.expandedValue, { color: getPredictionColor(prediction.predicted_units_sold) }]}>
              {Math.ceil(prediction.predicted_units_sold)}
            </ThemedText>
          </View>
          <View style={card.expandedRow}>
            <ThemedText style={card.expandedLabel}>Week</ThemedText>
            <ThemedText style={card.expandedValue}>{formatDate(prediction.week)}</ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

const card = StyleSheet.create({
  container: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ShopFlareColors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: ShopFlareColors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ShopFlareColors.border,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: ShopFlareColors.accent },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: ShopFlareColors.text },
  id: { fontSize: 12, color: ShopFlareColors.textLight, marginTop: 2 },
  predictBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ShopFlareColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    justifyContent: 'center',
  },
  predictBtnDisabled: { opacity: 0.65 },
  predictBtnText: { color: ShopFlareColors.secondary, fontSize: 12, fontWeight: '700' },
  expanded: {
    backgroundColor: ShopFlareColors.accentLight,
    borderTopWidth: 1,
    borderTopColor: ShopFlareColors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  expandedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expandedLabel: { fontSize: 12, color: ShopFlareColors.textSecondary },
  expandedValue: { fontSize: 13, fontWeight: '700', color: ShopFlareColors.text },
});

// ─── Model Info Card ──────────────────────────────────────────────────────────

function ModelInfoCard({ model }: { model: PredictionModel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={modelCard.container}>
      <TouchableOpacity style={modelCard.header} onPress={() => setExpanded(!expanded)}>
        <View style={modelCard.headerLeft}>
          <Ionicons name="hardware-chip" size={16} color={ShopFlareColors.accent} />
          <ThemedText style={modelCard.title}>Model Info</ThemedText>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={ShopFlareColors.textLight}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={modelCard.body}>
          {[
            ['Trained At', formatDate(model.trained_at)],
            //['Learning Rate', String(model.learning_rate)],
            //['Epochs', String(model.epochs)],
            ['Final Loss', model.final_loss.toFixed(6)],
            //['Rolling Feature', model.use_rolling_feature ? 'Yes' : 'No'],
            //['Features', model.feature_names.join(', ')],
          ].map(([label, value]) => (
            <View key={label} style={modelCard.row}>
              <ThemedText style={modelCard.label}>{label}</ThemedText>
              <ThemedText style={modelCard.value} numberOfLines={2}>{value}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const modelCard = StyleSheet.create({
  container: {
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ShopFlareColors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: ShopFlareColors.text },
  body: { borderTopWidth: 1, borderTopColor: ShopFlareColors.border, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  label: { fontSize: 12, color: ShopFlareColors.textSecondary, flex: 1 },
  value: { fontSize: 12, fontWeight: '600', color: ShopFlareColors.text, flex: 2, textAlign: 'right' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function WeeklyPredictionScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  // Prediction URL state and fetch
  const [PREDICTION_URL, setPredictionUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(BACKEND_URL)
      .then(res => res.json())
      .then(data => setPredictionUrl(data.ai_url))
      .catch(() => setPredictionUrl(null));
  }, []);

  // Products state — replace with your actual products fetch
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Prediction state
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [predictingIds, setPredictingIds] = useState<Set<number>>(new Set());
  const [predictingAll, setPredictingAll] = useState(false);
  const [modelInfo, setModelInfo] = useState<PredictionModel | null>(null);

  // UI state
  const [showAllExpanded, setShowAllExpanded] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('error');

  // ── Fetch brand products ──────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await productService.getBrandProducts(user.id);
      setProducts(data.products);
    } catch (e: any) {
      setMessageType('error');
      setFormMessage(e?.message || 'Failed to load products.');
    } finally {
      setLoadingProducts(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    setPredictions({});
    setModelInfo(null);
    setFormMessage('');
    loadProducts();
  };

  // ── Single product predict ────────────────────────────────────────────────
  const handlePredict = async (productId: number) => {
    if (!PREDICTION_URL) {
      setMessageType('error');
      setFormMessage('Prediction URL not loaded.');
      return;
    }
    setFormMessage('');
    setPredictingIds(prev => new Set(prev).add(productId));
    try {
      const result = await fetchWeeklyPrediction(PREDICTION_URL, [productId]);
      if (result.status === 'ok' && result.predictions?.length) {
        setPredictions(prev => {
          const next = { ...prev };
          result.predictions!.forEach(p => { next[p.product_id] = p; });
          return next;
        });
        if (result.model) setModelInfo(result.model);
      } else {
        setMessageType('error');
        setFormMessage(result.message || 'No prediction data returned.');
      }
    } catch (e: any) {
      setMessageType('error');
      setFormMessage(e?.message || 'Prediction request failed.');
    } finally {
      setPredictingIds(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  // ── Predict all ──────────────────────────────────────────────────────────
  const handlePredictAll = async () => {
    if (!products.length) return;
    if (!PREDICTION_URL) {
      setMessageType('error');
      setFormMessage('Prediction URL not loaded.');
      return;
    }
    setFormMessage('');
    setPredictingAll(true);
    const ids = products.map(p => p.id);
    try {
      const result = await fetchWeeklyPrediction(PREDICTION_URL, ids);
      if (result.status === 'ok' && result.predictions?.length) {
        setPredictions(prev => {
          const next = { ...prev };
          result.predictions!.forEach(p => { next[p.product_id] = p; });
          return next;
        });
        if (result.model) setModelInfo(result.model);
        setShowAllExpanded(true);
        setMessageType('success');
        setFormMessage(`Predictions ready for ${result.predictions!.length} product(s).`);
      } else {
        setMessageType('error');
        setFormMessage(result.message || 'No prediction data returned.');
      }
    } catch (e: any) {
      setMessageType('error');
      setFormMessage(e?.message || 'Prediction request failed.');
    } finally {
      setPredictingAll(false);
    }
  };

  const predictedCount = Object.keys(predictions).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={ShopFlareColors.secondary} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Weekly Prediction</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ShopFlareColors.accent}
          />
        }
      >
        {/* Top summary bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{products.length}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Products</ThemedText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <ThemedText style={[styles.summaryNumber, { color: ShopFlareColors.accent }]}>
              {predictedCount}
            </ThemedText>
            <ThemedText style={styles.summaryLabel}>Predicted</ThemedText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{products.length - predictedCount}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Pending</ThemedText>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.predictAllBtn, predictingAll && styles.btnDisabled]}
            onPress={handlePredictAll}
            disabled={predictingAll || loadingProducts}
          >
            {predictingAll ? (
              <ActivityIndicator size="small" color={ShopFlareColors.secondary} />
            ) : (
              <Ionicons name="flash" size={16} color={ShopFlareColors.secondary} />
            )}
            <ThemedText style={styles.predictAllText}>
              {predictingAll ? 'Predicting...' : 'Predict All'}
            </ThemedText>
          </TouchableOpacity>

          {predictedCount > 0 && (
            <TouchableOpacity
              style={styles.toggleExpandBtn}
              onPress={() => setShowAllExpanded(!showAllExpanded)}
            >
              <Ionicons
                name={showAllExpanded ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={ShopFlareColors.accent}
              />
              <ThemedText style={styles.toggleExpandText}>
                {showAllExpanded ? 'Hide Details' : 'Show All Predictions'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Inline message */}
        {!!formMessage && (
          <View style={styles.messageWrapper}>
            <InlineMessage message={formMessage} variant={messageType} />
          </View>
        )}

        {/* Model info (collapsed by default) */}
        {modelInfo && <ModelInfoCard model={modelInfo} />}

        {/* Product list */}
        {loadingProducts ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={ShopFlareColors.accent} />
            <ThemedText style={styles.loadingText}>Loading products...</ThemedText>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={ShopFlareColors.textLight} />
            <ThemedText style={styles.emptyText}>No products found for your brand.</ThemedText>
          </View>
        ) : (
          products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              prediction={predictions[product.id]}
              predicting={predictingIds.has(product.id)}
              onPredict={handlePredict}
              showExpanded={showAllExpanded}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  headerTitle: { fontSize: 22, fontWeight: '700', color: ShopFlareColors.secondary },
  headerSpacer: { width: 40 },

  content: { padding: 20, paddingBottom: 60 },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: ShopFlareColors.secondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ShopFlareColors.border,
    paddingVertical: 14,
    marginBottom: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNumber: { fontSize: 22, fontWeight: '800', color: ShopFlareColors.text },
  summaryLabel: { fontSize: 11, color: ShopFlareColors.textLight, marginTop: 2, fontWeight: '500' },
  summaryDivider: { width: 1, backgroundColor: ShopFlareColors.border },

  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  predictAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ShopFlareColors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    shadowColor: ShopFlareColors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 130,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  predictAllText: { color: ShopFlareColors.secondary, fontSize: 14, fontWeight: '700' },
  toggleExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: ShopFlareColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: ShopFlareColors.accentLight,
  },
  toggleExpandText: { color: ShopFlareColors.accent, fontSize: 14, fontWeight: '600' },

  messageWrapper: { marginBottom: 14 },

  loadingCenter: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 14, color: ShopFlareColors.textLight },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: ShopFlareColors.textLight, textAlign: 'center' },
});