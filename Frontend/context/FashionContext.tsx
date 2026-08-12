import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  getProducts, 
  Product as BackendProduct,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getCart,
  addToCartAPI,
  updateCartItem,
  removeFromCartAPI,
  clearCartAPI
} from '@/services/productService';
import { useAuth } from '@/context/AuthContext';

// Frontend product interface (compatible with both backend and local data)
export interface Product {
  id: string;
  name: string;
  category?: string;
  subcategory?: string;
  price: number;
  originalPrice?: number;
  sale_price?: number;
  image?: string;
  emoji?: string;
  colors?: string[];
  sizes?: string[];
  description?: string;
  rating?: number;
  average_rating?: number;
  total_ratings?: number;
  stock?: number;
  brand_name?: string;
  images?: { id: number; image_base64: string; image_type: string }[];
}

interface CartItem extends Product {
  cartItemId?: number;  // Backend cart item ID
  quantity: number;
  selectedSize: string;
  selectedColor: string;
}

interface WishlistItem extends Product {}

interface Order {
  id: string;
  items: CartItem[];
  totalPrice: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  shippingAddress: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  productId: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
}

interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
}

interface PaymentMethod {
  id: string;
  cardNumber: string;
  cardholderName: string;
  expiryDate: string;
  isDefault: boolean;
}

interface FashionContextType {
  // Products
  products: Product[];
  isLoadingProducts: boolean;
  fetchProducts: () => Promise<void>;
  refreshCart: () => Promise<void>;
  refreshWishlist: () => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  // Cart
  cart: CartItem[];
  wishlist: string[];
  wishlistItems: WishlistItem[];
  orders: Order[];
  userProfile: UserProfile | null;
  messages: Message[];
  addToCart: (product: Product, size: string, color: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  getWishlistItems: () => WishlistItem[];
  getTotalPrice: () => number;
  getCartItemCount: () => number;
  checkout: (address: Address, paymentMethod: PaymentMethod) => void;
  setUserProfile: (profile: UserProfile) => void;
  addAddress: (address: Address) => void;
  addPaymentMethod: (method: PaymentMethod) => void;
  addMessage: (message: Message) => void;
  getProductMessages: (productId: string) => Message[];
}

const FashionContext = createContext<FashionContextType | undefined>(undefined);

// Convert backend product to frontend format
const convertBackendProduct = (bp: BackendProduct): Product => ({
  id: String(bp.id),
  name: bp.name,
  category: bp.category || 'General',
  price: bp.sale_price || bp.price,
  originalPrice: bp.is_on_sale ? bp.price : undefined,
  sale_price: bp.sale_price || undefined,
  image: bp.image || undefined,
  description: bp.description || '',
  rating: bp.average_rating || 0,
  average_rating: bp.average_rating || 0,
  total_ratings: bp.total_ratings || 0,
  stock: bp.stock,
  brand_name: bp.brand_name,
  colors: ['Black', 'White', 'Blue'],
  sizes: ['S', 'M', 'L', 'XL'],
  images: bp.images?.map(img => ({
    id: img.id,
    image_base64: img.image_base64,
    image_type: img.image_type
  })),
});

export const FashionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, isSignedIn, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  // Fetch cart and wishlist when user signs in
  useEffect(() => {
    if (isSignedIn && accessToken) {
      // Only fetch cart and wishlist for customer accounts
      if (user?.user_type === 'user') {
        fetchCartFromBackend();
        fetchWishlistFromBackend();
      } else {
        setCart([]);
        setWishlist([]);
        setWishlistItems([]);
      }
    } else {
      // Clear cart and wishlist when user signs out
      setCart([]);
      setWishlist([]);
      setWishlistItems([]);
    }
  }, [isSignedIn, accessToken, user]);

  const fetchCartFromBackend = async () => {
    if (!accessToken) return;
    try {
      const cartItems = await getCart(accessToken);
      const convertedCart: CartItem[] = cartItems.map(item => ({
        ...convertBackendProduct(item.product),
        cartItemId: item.id,
        quantity: item.quantity,
        selectedSize: item.selected_size || '',
        selectedColor: item.selected_color || '',
      }));
      setCart(convertedCart);
    } catch (error) {
      console.error('Failed to fetch cart:', error);
    }
  };

  const fetchWishlistFromBackend = async () => {
    if (!accessToken) return;
    try {
      const wishlistData = await getWishlist(accessToken);
      const productIds = wishlistData.map(item => String(item.product.id));
      const items = wishlistData.map(item => convertBackendProduct(item.product));
      setWishlist(productIds);
      setWishlistItems(items);
    } catch (error) {
      console.error('Failed to fetch wishlist:', error);
    }
  };

  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const backendProducts = await getProducts();
      const converted = backendProducts.map(convertBackendProduct);
      setProducts(converted);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const getProductById = (id: string): Product | undefined => {
    return products.find(p => p.id === id);
  };

  const addToCart = async (product: Product, size: string, color: string, quantity: number) => {
    // Optimistic update
    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.id === product.id && item.selectedSize === size && item.selectedColor === color
      );

      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id && item.selectedSize === size && item.selectedColor === color
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [...prevCart, { ...product, quantity, selectedSize: size, selectedColor: color }];
    });

    // Sync with backend
    if (accessToken) {
      try {
        await addToCartAPI(accessToken, parseInt(product.id), quantity, size, color);
        // Refresh cart from backend to get proper IDs
        await fetchCartFromBackend();
      } catch (error) {
        console.error('Failed to add to cart:', error);
      }
    }
  };

  const removeFromCart = async (productId: string) => {
    const item = cart.find(i => i.id === productId);
    
    // Optimistic update
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));

    // Sync with backend
    if (accessToken && item?.cartItemId) {
      try {
        await removeFromCartAPI(accessToken, item.cartItemId);
      } catch (error) {
        console.error('Failed to remove from cart:', error);
        // Revert on error
        await fetchCartFromBackend();
      }
    }
  };

  const clearCart = async () => {
    setCart([]);

    // Sync with backend
    if (accessToken) {
      try {
        await clearCartAPI(accessToken);
      } catch (error) {
        console.error('Failed to clear cart:', error);
      }
    }
  };

  const toggleWishlist = async (productId: string) => {
    const isCurrentlyWishlisted = wishlist.includes(productId);
    
    // Optimistic update
    if (isCurrentlyWishlisted) {
      setWishlist(prev => prev.filter(id => id !== productId));
      setWishlistItems(prev => prev.filter(item => item.id !== productId));
    } else {
      setWishlist(prev => [...prev, productId]);
      const product = products.find(p => p.id === productId);
      if (product) {
        setWishlistItems(prev => [...prev, product]);
      }
    }

    // Sync with backend
    if (accessToken) {
      try {
        if (isCurrentlyWishlisted) {
          await removeFromWishlist(accessToken, parseInt(productId));
        } else {
          await addToWishlist(accessToken, parseInt(productId));
        }
      } catch (error) {
        console.error('Failed to toggle wishlist:', error);
        // Revert on error
        await fetchWishlistFromBackend();
      }
    }
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const getWishlistItems = (): WishlistItem[] => {
    return products.filter(p => wishlist.includes(p.id));
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + parseFloat(String(item.price)) * item.quantity, 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const updateCartItemQuantity = async (productId: string, quantity: number) => {
    const item = cart.find(i => i.id === productId);
    
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    // Optimistic update
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );

    // Sync with backend
    if (accessToken && item?.cartItemId) {
      try {
        await updateCartItem(accessToken, item.cartItemId, quantity);
      } catch (error) {
        console.error('Failed to update cart:', error);
        // Revert on error
        await fetchCartFromBackend();
      }
    }
  };

  const checkout = (address: Address, paymentMethod: PaymentMethod) => {
    if (cart.length === 0) return;

    const newOrder: Order = {
      id: `ORD-${Date.now()}`,
      items: [...cart],
      totalPrice: getTotalPrice(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      shippingAddress: `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`,
    };

    setOrders((prevOrders) => [...prevOrders, newOrder]);
    setCart([]);
  };

  const addAddress = (address: Address) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        addresses: [...userProfile.addresses, address],
      });
    }
  };

  const addPaymentMethod = (method: PaymentMethod) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        paymentMethods: [...userProfile.paymentMethods, method],
      });
    }
  };

  const addMessage = (message: Message) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  };

  const getProductMessages = (productId: string) => {
    return messages.filter((msg) => msg.productId === productId);
  };

  return (
    <FashionContext.Provider
      value={{
        products,
        isLoadingProducts,
        fetchProducts,
        refreshCart: fetchCartFromBackend,
        refreshWishlist: fetchWishlistFromBackend,
        getProductById,
        cart,
        wishlist,
        wishlistItems,
        orders,
        userProfile,
        messages,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        clearCart,
        toggleWishlist,
        isInWishlist,
        getWishlistItems,
        getTotalPrice,
        getCartItemCount,
        checkout,
        setUserProfile,
        addAddress,
        addPaymentMethod,
        addMessage,
        getProductMessages,
      }}
    >
      {children}
    </FashionContext.Provider>
  );
};

export const useFashion = () => {
  const context = useContext(FashionContext);
  if (!context) {
    throw new Error('useFashion must be used within FashionProvider');
  }
  return context;
};

export { FashionContext };
export type { CartItem, Order, Message, UserProfile, Address, PaymentMethod, WishlistItem };
