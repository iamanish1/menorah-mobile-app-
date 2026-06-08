declare module 'react-native-razorpay' {
  interface RazorpayOptions {
    description?: string;
    currency: string;
    key: string;
    amount: string;
    name?: string;
    order_id?: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    theme?: {
      color?: string;
    };
  }

  interface RazorpayPaymentData {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface RazorpayError {
    code: string;
    description?: string;
    message?: string;
  }

  class RazorpayCheckout {
    static open(options: RazorpayOptions): Promise<RazorpayPaymentData>;
  }

  export default RazorpayCheckout;
}

