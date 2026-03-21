import React, { useState } from "react";

function AgentRightPanel() {
  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const API_URL = `${API_BASE.replace(/\/$/, "")}`;

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [wccAmount, setWccAmount] = useState(5000);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeAmount, setAutoRechargeAmount] = useState(500);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve(true);
      if (document.getElementById("razorpay-checkout-js")) return resolve(true);

      const script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load Razorpay script"));
      document.body.appendChild(script);
    });
  };

  const handlePurchaseNow = async () => {
    if (purchaseLoading) return;

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please login again.");
      return;
    }

    setPurchaseLoading(true);

    try {
      const createOrderRes = await fetch(`${API_URL}/api/payments/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: wccAmount }),
      });

      const createOrderData = await createOrderRes.json();
      if (!createOrderRes.ok || !createOrderData.success) {
        throw new Error(createOrderData.message || "Failed to create Razorpay order");
      }

      await loadRazorpayScript();

      const options = {
        key: createOrderData.keyId,
        amount: String(createOrderData.amount),
        currency: createOrderData.currency,
        name: "AiSensy",
        description: "Purchase WhatsApp Conversation Credits (WCC)",
        order_id: createOrderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${API_URL}/api/payments/verify-payment`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              throw new Error(verifyData.message || "Payment verification failed");
            }

            setShowPurchaseModal(false);
            alert("WCC purchased successfully!");
          } catch (e) {
            alert(e.message || "Payment verification failed");
          } finally {
            setPurchaseLoading(false);
          }
        },
        prefill: {
          name: "",
          email: "",
          contact: "",
        },
        theme: {
          color: "#1d4ed8",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (resp) {
        const msg = resp?.error?.description || resp?.error?.reason || "Payment failed";
        setPurchaseLoading(false);
        alert(msg);
      });
      rzp.open();
    } catch (e) {
      setPurchaseLoading(false);
      alert(e.message || "Payment failed");
    }
  };

  return (
    <div className="w-80 space-y-4">

      <div className="bg-white p-6 rounded shadow">

        <h3 className="font-semibold">
          ICICI Bank
        </h3>

        <p className="text-green-600 font-semibold">
          +9189956205431
        </p>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowPurchaseModal(true)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Buy WCC
          </button>
        </div>

      </div>

      <div className="bg-white p-6 rounded shadow">

        <p className="text-sm">
          Free Service Conversation
        </p>

        <h3 className="font-bold">
          Unlimited
        </h3>

      </div>

      <div className="bg-white p-6 rounded shadow">

        <p className="text-sm">
          Current Plan
        </p>

        <h3 className="font-bold">
          BASIC
        </h3>

      </div>

      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black bg-opacity-25"
            onClick={() => setShowPurchaseModal(false)}
          />

          <div className="relative w-full max-w-md h-full bg-white border-l border-gray-200 overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900">
                  Purchase WhatsApp Conversation Credits (WCC)
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Enter WCC amount and purchase now.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">Enter WCC Amount</p>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-gray-200 text-gray-700 font-semibold">
                    Min 5000
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum amount of 5000 credits is allowed.
                </p>

                <div className="mt-3 flex items-center">
                  <span className="px-3 py-2 border border-gray-300 border-r-0 bg-white rounded-l-lg text-gray-700 font-semibold">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={wccAmount}
                    min={5000}
                    step={5000}
                    onChange={(e) => setWccAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none border-l-0"
                  />
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[2500, 5000, 10000, 25000].map((amt) => {
                    const isDisabled = amt < 5000;
                    return (
                      <button
                        key={amt}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setWccAmount(amt)}
                        className={`px-2 py-2 text-xs rounded-lg font-semibold transition border ${
                          isDisabled
                            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                            : wccAmount === amt
                              ? "bg-green-600 text-white border-green-700"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-green-50"
                        }`}
                      >
                        {amt.toLocaleString()}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handlePurchaseNow}
                  disabled={purchaseLoading}
                  className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Purchase Now
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      Enable WCC auto-recharge
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Auto-recharge when your WCC goes below the threshold.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoRechargeEnabled}
                      onChange={(e) => setAutoRechargeEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-semibold text-gray-700">On</span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-semibold text-gray-800">
                    Enter auto-recharge amount
                  </label>
                  <div className="mt-2 flex items-center">
                    <span className="px-3 py-2 border border-gray-300 border-r-0 bg-white rounded-l-lg text-gray-700 font-semibold">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={autoRechargeAmount}
                      min={100}
                      step={100}
                      disabled={!autoRechargeEnabled}
                      onChange={(e) => setAutoRechargeAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none border-l-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!autoRechargeEnabled}
                    className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AgentRightPanel;
