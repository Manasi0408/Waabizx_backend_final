const crypto = require('crypto');
const Razorpay = require('razorpay');

const ALLOWED_PURPOSES = new Set(['wcc', 'ads_credits', 'plan_purchase']);
const MIN_AMOUNT_BY_PURPOSE = {
  wcc: 5000,
  ads_credits: 1500,
  plan_purchase: 100,
};

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
    const { amount, purpose = 'wcc', metadata = {} } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!ALLOWED_PURPOSES.has(String(purpose))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment purpose',
      });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }

    const minAmount = MIN_AMOUNT_BY_PURPOSE[purpose] || 1;
    if (numericAmount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum amount is ${minAmount}`,
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
      receipt: `${purpose}_${userId}_${Date.now()}`.slice(0, 40),
      payment_capture: 1,
      notes: {
        userId: String(userId),
        purpose: String(purpose),
        metadata: JSON.stringify(metadata || {}).slice(0, 250),
      },
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      purpose,
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

