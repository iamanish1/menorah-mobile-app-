import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import RazorpayCheckout from 'react-native-razorpay';
import { X } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';

export default function PaymentSheet({ route, navigation }: any) {
  const { bookingId, paymentMethod = 'razorpay' } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('INR');
  const [isPolling, setIsPolling] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [sdkPaymentInitiated, setSdkPaymentInitiated] = useState(false);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const returnUrl = ENV.CHECKOUT_RETURN_URL || 'menorah://payments/return';
  const USE_RAZORPAY_SDK = ENV.USE_RAZORPAY_SDK ?? true;

  const checkPaymentStatus = useCallback(async () => {
    try {
      const response = await api.getPaymentStatus(bookingId);
      if (response.success && response.data?.paymentStatus === 'paid') {
        navigation.replace('BookingSuccess', { bookingId });
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Error checking payment status:', err);
      return false;
    }
  }, [bookingId, navigation]);

  const pollOrderStatus = useCallback(async (maxAttempts: number = 15) => {
    if (!orderId || paymentMethod !== 'razorpay') {
      return;
    }

    setIsPolling(true);
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setIsPolling(false);
        // Fallback to booking payment status check
        const paid = await checkPaymentStatus();
        if (!paid) {
          setError('Payment verification is taking longer than expected. Please check your booking status.');
          setTimeout(() => navigation.goBack(), 3000);
        }
        return;
      }

      try {
        const response = await api.getRazorpayOrderStatus(orderId!);
        
        if (response.success && response.data) {
          const { orderStatus, paymentStatus } = response.data;
          
          if (orderStatus === 'paid' || paymentStatus === 'paid') {
            setIsPolling(false);
            // Double check booking payment status
            await checkPaymentStatus();
            navigation.replace('BookingSuccess', { bookingId });
            return;
          } else if (orderStatus === 'attempted') {
            // Payment attempted but not yet confirmed, continue polling
            attempts++;
            setTimeout(poll, 2000);
          } else if (orderStatus === 'created') {
            // Order still created, continue polling
            attempts++;
            setTimeout(poll, 2000);
          } else {
            // Order failed or other status
            setIsPolling(false);
            setError('Payment was not successful. Please try again.');
            setTimeout(() => navigation.goBack(), 3000);
          }
        } else {
          attempts++;
          setTimeout(poll, 2000);
        }
      } catch (err: any) {
        console.error('Error polling order status:', err);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setIsPolling(false);
          // Fallback to booking payment status
          const paid = await checkPaymentStatus();
          if (!paid) {
            setError('Unable to verify payment status. Please check your booking.');
            setTimeout(() => navigation.goBack(), 3000);
          }
        }
      }
    };

    // Start polling after 2 seconds delay
    setTimeout(poll, 2000);
  }, [orderId, paymentMethod, bookingId, navigation, checkPaymentStatus]);

  const createCheckoutSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Creating checkout session with:', { bookingId, paymentMethod });
      console.log('API Base URL:', ENV.API_BASE_URL);
      
      const response = await api.createCheckoutSession(bookingId, paymentMethod);
      
      console.log('Checkout session response:', response);
      
      if (response.success && response.data) {
        // Extract data from response
        const url = response.data.checkoutUrl || response.data.url || response.data.sessionUrl;
        
        // Store orderId for Razorpay
        if (paymentMethod === 'razorpay' && response.data.orderId) {
          setOrderId(response.data.orderId);
        }
        
        // Store keyId, amount, currency for SDK
        if (paymentMethod === 'razorpay') {
          if (response.data.keyId) {
            setKeyId(response.data.keyId);
          }
          if (response.data.amount) {
            setAmount(response.data.amount);
          }
          if (response.data.currency) {
            setCurrency(response.data.currency);
          }
        }
        
        // Store checkout URL for WebView fallback
        if (url) {
          console.log('Checkout URL received:', url);
          setCheckoutUrl(url);
        } else if (!USE_RAZORPAY_SDK || paymentMethod !== 'razorpay') {
          // Only error if WebView is needed
          console.error('No checkout URL in response:', response);
          setError('Checkout URL not found in response');
        }
      } else {
        console.error('Checkout session failed:', response);
        setError(response.message || 'Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        response: err.response?.data
      });
      setError(`Failed to create checkout session: ${err.message || 'Network error. Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }, [bookingId, paymentMethod, USE_RAZORPAY_SDK]);

  const initiateSDKPayment = useCallback(async () => {
    if (!keyId || !orderId || !amount) {
      console.error('Missing required payment data:', { keyId, orderId, amount });
      setError('Payment data incomplete. Please try again.');
      return;
    }

    try {
      console.log('Initiating Razorpay SDK payment:', { keyId: keyId.substring(0, 10) + '...', orderId, amount, currency });
      
      // Prepare user data for prefill
      const userEmail = user?.email || '';
      const userPhone = user?.phone || '';
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';

      const options = {
        description: 'Booking Payment',
        currency: currency,
        key: keyId,
        amount: amount.toString(), // Amount in paise
        name: 'Menorah Health',
        order_id: orderId,
        prefill: {
          email: userEmail,
          contact: userPhone,
          name: userName || 'User'
        },
        theme: {
          color: '#314830' // Brand color
        }
      };

      console.log('Opening Razorpay checkout with options:', { ...options, key: keyId.substring(0, 10) + '...' });

      const paymentData = await RazorpayCheckout.open(options);
      
      console.log('Payment success data:', paymentData);
      
      // Verify payment with backend
      if (paymentData.razorpay_payment_id && paymentData.razorpay_signature) {
        setIsPolling(true);
        
        try {
          const verifyResponse = await api.verifyRazorpayPayment({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentData.razorpay_payment_id,
            razorpay_signature: paymentData.razorpay_signature,
            bookingId: bookingId
          });

          if (verifyResponse.success) {
            setIsPolling(false);
            navigation.replace('BookingSuccess', { bookingId });
          } else {
            setIsPolling(false);
            // Fallback to order status polling
            await pollOrderStatus();
          }
        } catch (verifyError: any) {
          console.error('Payment verification error:', verifyError);
          setIsPolling(false);
          // Fallback to order status polling
          await pollOrderStatus();
        }
      } else {
        // Payment data incomplete, poll order status
        await pollOrderStatus();
      }
    } catch (err: any) {
      console.error('Razorpay SDK error:', err);
      
      // Handle user cancellation
      if (err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
        console.log('User cancelled payment');
        navigation.goBack();
        return;
      }
      
      // Handle other errors
      const errorMessage = err.description || err.message || 'Payment failed. Please try again.';
      setError(errorMessage);
      
      // Show error alert
      Alert.alert(
        'Payment Error',
        errorMessage,
        [
          { text: 'OK', onPress: () => {
            // Optionally navigate back or retry
          }}
        ]
      );
    }
  }, [keyId, orderId, amount, currency, user, bookingId, navigation, pollOrderStatus]);

  useEffect(() => {
    if (bookingId) {
      createCheckoutSession();
    } else {
      setError('Booking ID is required');
      setLoading(false);
    }

    // Cleanup polling on unmount
    return () => {
      setIsPolling(false);
    };
  }, [bookingId, createCheckoutSession]);

  // Initiate SDK payment after checkout session is created
  useEffect(() => {
    if (
      USE_RAZORPAY_SDK &&
      paymentMethod === 'razorpay' &&
      !loading &&
      keyId &&
      orderId &&
      amount &&
      !error &&
      !sdkPaymentInitiated
    ) {
      setSdkPaymentInitiated(true);
      initiateSDKPayment();
    }
  }, [keyId, orderId, amount, loading, error, paymentMethod, sdkPaymentInitiated, USE_RAZORPAY_SDK, initiateSDKPayment]);

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.status === 'success') {
        // For Razorpay, use order status polling for reliable detection
        if (paymentMethod === 'razorpay' && orderId) {
          await pollOrderStatus();
        } else if (paymentMethod === 'razorpay') {
          // Fallback to booking payment status
          await checkPaymentStatus();
        } else {
          // For Stripe, navigate directly
          navigation.replace('BookingSuccess', { bookingId });
        }
      } else if (data?.status === 'cancel' || data?.status === 'failed') {
        navigation.goBack();
      }
    } catch (err) {
      // Ignore parsing errors
      console.log('Payment message parsing error:', err);
    }
  };

  const handleNavigationStateChange = async (nav: any) => {
    const url = nav.url;
    
    // Check for success status in URL
    if (url.includes('status=success') || url.includes(returnUrl + '?status=success')) {
      // For Razorpay, use order status polling for reliable payment detection
      if (paymentMethod === 'razorpay' && orderId) {
        await pollOrderStatus();
      } else if (paymentMethod === 'razorpay') {
        // Fallback to booking payment status check if orderId not available
        setTimeout(async () => {
          await checkPaymentStatus();
        }, 2000);
      } else {
        // For Stripe, navigate directly (webhook handles verification)
        navigation.replace('BookingSuccess', { bookingId });
      }
    } else if (url.includes('status=cancel') || url.includes('status=failed') || url.includes(returnUrl + '?status=cancel')) {
      navigation.goBack();
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Cancel Payment',
      'Are you sure you want to cancel the payment?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => navigation.goBack() }
      ]
    );
  };

  // Add WebView error handler
  const handleWebViewLoadEnd = () => {
    console.log('WebView load ended - page should be fully loaded');
    setWebViewLoading(false);
    // Try to check if content is actually rendered
    setTimeout(() => {
      console.log('Checking if Razorpay content is visible...');
    }, 1000);
  };

  const handleWebViewError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView error:', nativeEvent);
    console.error('Error code:', nativeEvent.code);
    console.error('Error description:', nativeEvent.description);
    console.error('Error domain:', nativeEvent.domain);
    setError(`Failed to load payment page: ${nativeEvent.description || 'Unknown error'}`);
    setWebViewLoading(false);
  };

  // Add handler for Android render process crashes
  const handleRenderProcessGone = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView render process gone:', nativeEvent);
    setError('Payment page crashed. Please try again.');
    setWebViewLoading(false);
  };

  // Add WebView load handler
  const handleWebViewLoad = () => {
    console.log('WebView loaded successfully');
    setWebViewLoading(false);
  };

  const handleWebViewLoadStart = () => {
    console.log('WebView started loading');
    setWebViewLoading(true);
  };

  // Add this function
  const openInBrowser = () => {
    if (checkoutUrl) {
      Linking.openURL(checkoutUrl).catch(err => {
        console.error('Failed to open URL:', err);
        setError('Failed to open payment page');
      });
    }
  };

  if (loading || (USE_RAZORPAY_SDK && paymentMethod === 'razorpay' && !sdkPaymentInitiated && !error)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 16, color: colors.text, marginTop: 16 }}>
            {USE_RAZORPAY_SDK && paymentMethod === 'razorpay' 
              ? 'Preparing payment...' 
              : 'Preparing payment...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            Payment Error
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // For SDK flow, don't require checkoutUrl
  if (!checkoutUrl && (!USE_RAZORPAY_SDK || paymentMethod !== 'razorpay')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            No Checkout URL
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            Checkout URL not available. Please try again.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}>
        <TouchableOpacity onPress={handleClose}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
          {isPolling ? 'Verifying Payment...' : 'Payment'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Polling Indicator */}
      {isPolling && (
        <View style={{
          backgroundColor: colors.card,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 14, color: colors.text }}>
            Verifying payment...
          </Text>
        </View>
      )}

      {/* WebView Loading Overlay */}
      {webViewLoading && checkoutUrl && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1
        }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>
            Loading payment gateway...
          </Text>
        </View>
      )}

      {/* WebView - Only show if not using SDK or for Stripe payments */}
      {(!USE_RAZORPAY_SDK || paymentMethod !== 'razorpay') && checkoutUrl && (
        <TouchableOpacity
          onPress={openInBrowser}
          style={{
            backgroundColor: colors.primary,
            padding: 12,
            margin: 16,
            borderRadius: 8,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>
            Open Payment in Browser
          </Text>
        </TouchableOpacity>
      )}
      {(!USE_RAZORPAY_SDK || paymentMethod !== 'razorpay') && checkoutUrl && (
        <WebView
          source={{ uri: checkoutUrl }}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onError={handleWebViewError}
          onLoad={handleWebViewLoad}
          onLoadEnd={handleWebViewLoadEnd}
          onLoadStart={handleWebViewLoadStart}
          onRenderProcessGone={handleRenderProcessGone}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent);
            setError(`HTTP Error: ${nativeEvent.statusCode} - ${nativeEvent.description || 'Failed to load'}`);
            setWebViewLoading(false);
          }}
          onContentSizeChange={(event) => {
            console.log('WebView content size changed:', event.nativeEvent);
            // If content size is 0, the page might not be rendering
            const contentSize = (event.nativeEvent as any).contentSize;
            if (contentSize && contentSize.height === 0) {
              console.warn('WebView content height is 0 - page may not be rendering');
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url;
            console.log('WebView navigation request:', url);
            // Allow all Razorpay and Stripe domains
            if (url.includes('razorpay.com') || 
                url.includes('stripe.com') ||
                url.includes(returnUrl) ||
                url.includes('checkout/return')) {
              return true;
            }
            // Allow all HTTPS URLs
            if (url.startsWith('https://')) {
              return true;
            }
            return false;
          }}
          originWhitelist={['https://*', 'http://*']}
          userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={false}
          mixedContentMode="always"
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          cacheEnabled={true}
          // Enhanced injected JavaScript to force rendering
          injectedJavaScript={`
            (function() {
              console.log('Injected script running...');
              
              // Force body visibility
              function forceRender() {
                if (document.body) {
                  document.body.style.visibility = 'visible';
                  document.body.style.display = 'block';
                  document.body.style.opacity = '1';
                  console.log('Body forced visible');
                }
                
                // Check for Razorpay elements
                const razorpayElements = document.querySelectorAll('[class*="razorpay"], [id*="razorpay"], [class*="checkout"]');
                console.log('Found Razorpay elements:', razorpayElements.length);
                
                if (razorpayElements.length > 0) {
                  razorpayElements.forEach(el => {
                    el.style.visibility = 'visible';
                    el.style.display = 'block';
                    el.style.opacity = '1';
                  });
                }
                
                // Force all iframes to be visible
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                  iframe.style.visibility = 'visible';
                  iframe.style.display = 'block';
                });
                
                // Remove any hidden styles
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                  if (el.style.visibility === 'hidden' || el.style.display === 'none') {
                    console.log('Found hidden element, making visible:', el.tagName);
                    el.style.visibility = 'visible';
                    el.style.display = 'block';
                  }
                });
              }
              
              // Try immediately
              forceRender();
              
              // Try after DOM is ready
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', forceRender);
              }
              
              // Try after window load
              window.addEventListener('load', forceRender);
              
              // Keep trying periodically
              let attempts = 0;
              const interval = setInterval(() => {
                attempts++;
                forceRender();
                if (attempts >= 10) {
                  clearInterval(interval);
                }
              }, 500);
              
              // Log page info
              console.log('Page URL:', window.location.href);
              console.log('Document ready state:', document.readyState);
              console.log('Body exists:', !!document.body);
              console.log('Body innerHTML length:', document.body ? document.body.innerHTML.length : 0);
              
              true; // Required
            })();
          `}
          // Add injectedJavaScriptBeforeContentLoaded for earlier injection
          injectedJavaScriptBeforeContentLoaded={`
            console.log('Script injected before content loaded');
            true;
          `}
          renderLoading={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      )}
    </SafeAreaView>
  );
}
