const crypto = require('crypto');
const Razorpay = require('razorpay');

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return null;

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

// Create Razorpay order for WCC purchase
exports.createWccOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }

    // UI uses minimum WCC amount of 5000
    if (numericAmount < 5000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount is 5000',
      });
    }

    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay credentials not configured',
      });
    }

    // Treat 1 WCC amount unit as INR amount for payment.
    // Razorpay expects amount in paise.
    const amountInPaise = Math.round(numericAmount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `wcc_${userId}_${Date.now()}`,
      payment_capture: 1,
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create Razorpay order',
      error: error.message,
    });
  }
};

// Verify Razorpay payment signature
exports.verifyWccPayment = async (req, res) => {
  try {
    const { order_id, payment_id, razorpay_signature } = req.body;

    if (!order_id || !payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay credentials not configured',
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay signature',
      });
    }

    return res.json({
      success: true,
      paymentId: payment_id,
      orderId: order_id,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to verify Razorpay payment',
      error: error.message,
    });
  }
};

