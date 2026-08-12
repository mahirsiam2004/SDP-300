import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { FashionProvider } from '@/context/FashionContext';
import { ShopFlareColors } from '@/constants/theme';
import { ActivityIndicator, View } from 'react-native';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isSignedIn, isInitialLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isInitialLoading) return;

    const currentPath = segments.join('/');
    const inAuthGroup =
      currentPath.startsWith('login') ||
      currentPath.startsWith('register') ||
      currentPath.startsWith('verify-email') ||
      currentPath.startsWith('forgot-password');

    if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/login');
    }
  }, [isSignedIn, isInitialLoading]);

  if (isInitialLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <FashionProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {!isSignedIn ? (
            <>
              <Stack.Screen name="login/index" />
              <Stack.Screen name="register/index" />
              <Stack.Screen name="verify-email/index" />
              <Stack.Screen name="forgot-password/index" />
            </>
          ) : (
            <>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="productDetail" />
              <Stack.Screen name="editProfile" />
              <Stack.Screen name="addresses" />
              <Stack.Screen name="checkout" />
              <Stack.Screen name="orderDetail" />
              <Stack.Screen name="myReviews" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="changePassword" />
              <Stack.Screen name="privacyControls" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="helpSupport" />
              <Stack.Screen name="brandAnalytics" />
            </>
          )}
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="light" backgroundColor={ShopFlareColors.primary} translucent />
      </FashionProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}


