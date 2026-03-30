import React, { useState } from "react";
import { createPortal } from "react-dom";

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
        name: "Waabizx",
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
          color: "#0284c7",
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
    <div className="space-y-4 md:space-y-5 motion-stagger-children">
      <div className="motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:border-sky-200/60 hover:shadow-xl hover:shadow-sky-500/10">
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent" aria-hidden />
        <div className="relative">
          <h3 className="font-bold text-gray-900 tracking-tight">ICICI Bank</h3>
          <p className="mt-1 text-emerald-600 font-semibold text-sm md:text-base">+9189956205431</p>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowPurchaseModal(true)}
              className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:ring-offset-2"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 motion-hero-shimmer" aria-hidden />
              <span className="relative">Buy WCC</span>
            </button>
          </div>
        </div>
      </div>

      <div className="motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80">
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-sky-500/5" aria-hidden />
        <div className="relative">
          <p className="text-sm font-medium text-gray-500">Free Service Conversation</p>
          <h3 className="mt-2 font-bold text-xl text-gray-900">Unlimited</h3>
        </div>
      </div>

      <div className="motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80">
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/8 to-blue-500/5" aria-hidden />
        <div className="relative">
          <p className="text-sm font-medium text-gray-500">Current Plan</p>
          <h3 className="mt-2 font-bold text-xl bg-gradient-to-r from-sky-700 to-blue-800 bg-clip-text text-transparent">
            BASIC
          </h3>
        </div>
      </div>

      {showPurchaseModal &&
        createPortal(
          <div className="motion-enter fixed inset-0 z-[300] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowPurchaseModal(false)}
              aria-label="Close overlay"
            />

            <div className="motion-pop relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/10 ring-1 ring-black/5">
            <div className="p-5 border-b border-gray-100/90 flex items-start justify-between gap-4 bg-gradient-to-r from-slate-50/90 to-sky-50/40">
              <div>
                <h3 className="text-base md:text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Purchase WhatsApp Conversation Credits (WCC)
                </h3>
                <p className="text-xs text-gray-500 mt-1">Enter WCC amount and purchase now.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-2xl p-4 md:p-5 border-2 border-gray-100/90 bg-gradient-to-br from-white to-sky-50/30 shadow-inner ring-1 ring-sky-100/50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">Enter WCC Amount</p>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold ring-1 ring-sky-200/80">
                    Min 5000
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Minimum amount of 5000 credits is allowed.</p>

                <div className="mt-3 flex items-center">
                  <span className="px-3 py-2.5 border-2 border-r-0 border-gray-200 rounded-l-xl bg-gray-50/80 text-gray-700 font-semibold text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={wccAmount}
                    min={5000}
                    step={5000}
                    onChange={(e) => setWccAmount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white"
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
                        className={`px-2 py-2 text-xs rounded-xl font-semibold transition border-2 ${
                          isDisabled
                            ? "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                            : wccAmount === amt
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md"
                              : "bg-white text-gray-700 border-gray-200 hover:border-sky-200 hover:bg-sky-50/80"
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
                  className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {purchaseLoading ? "Opening…" : "Purchase Now"}
                </button>
              </div>

              <div className="rounded-2xl p-4 md:p-5 border-2 border-gray-100/90 bg-white/80 ring-1 ring-gray-100/80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Enable WCC auto-recharge</p>
                    <p className="text-xs text-gray-500 mt-1">Auto-recharge when your WCC goes below the threshold.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={autoRechargeEnabled}
                      onChange={(e) => setAutoRechargeEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">On</span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-semibold text-gray-800">Enter auto-recharge amount</label>
                  <div className="mt-2 flex items-center">
                    <span className="px-3 py-2.5 border-2 border-r-0 border-gray-200 rounded-l-xl bg-gray-50/80 text-gray-700 font-semibold text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={autoRechargeAmount}
                      min={100}
                      step={100}
                      disabled={!autoRechargeEnabled}
                      onChange={(e) => setAutoRechargeAmount(Number(e.target.value))}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!autoRechargeEnabled}
                    className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 shadow-md shadow-sky-500/20 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default AgentRightPanel;
