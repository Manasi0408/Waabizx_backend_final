import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getSettings } from "../services/settingsService";
import axios from "../api/axios";

const PLAN_PRICING = {
  monthly: { basic: 1245, pro: 3040, enterprise: 6490 },
  quarterly: { basic: 3540, pro: 8650, enterprise: 16245 },
  yearly: { basic: 13200, pro: 32500, enterprise: 69000 },
};

const PLAN_DISCOUNT_LABEL = {
  monthly: "",
  quarterly: "(5% Off)",
  yearly: "(10% Off)",
};

const PLAN_FEATURES = {
  basic: ["Upto 1 Agent", "Upto 5 Custom Attributes", "Template Message APIs", "1200 messages/month"],
  pro: ["All in Basic", "Upto 10 Tags", "Campaign click tracking", "Project APIs"],
  enterprise: ["Unlimited tags", "Dedicated account manager", "Highest messaging speed", "Upto 10GB cloud storage"],
};

const COUNTRY_CODES = ["+971", "+91", "+65", "+44", "+1"];

const splitWhatsappNumber = (value = "", fallbackCountryCode = "+91") => {
  const cleaned = String(value || "").replace(/\s+/g, "");
  const fallback = String(fallbackCountryCode || "+91").trim();
  const fallbackDigits = fallback.replace(/\D/g, "");

  if (!cleaned) {
    return { countryCode: fallback || "+91", localNumber: "" };
  }

  const matchedCode = COUNTRY_CODES.find((code) => cleaned.startsWith(code));
  if (matchedCode) {
    return {
      countryCode: matchedCode,
      localNumber: cleaned.slice(matchedCode.length).replace(/\D/g, ""),
    };
  }

  const digits = cleaned.replace(/\D/g, "");
  if (fallbackDigits && digits.startsWith(fallbackDigits) && digits.length > fallbackDigits.length) {
    return {
      countryCode: fallback || "+91",
      localNumber: digits.slice(fallbackDigits.length),
    };
  }

  return {
    countryCode: fallback || "+91",
    localNumber: digits,
  };
};

const addMonthsIso = (fromDate, monthsToAdd) => {
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + Number(monthsToAdd || 0));
  return d.toISOString();
};

function AgentRightPanel({ user = null, selectedProject = null, conversationQuota = null, loadingQuota = false }) {
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const API_URL = `${API_BASE.replace(/\/$/, "")}`;

  const [showWccModal, setShowWccModal] = useState(false);
  const [showAdsModal, setShowAdsModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const [wccAmount, setWccAmount] = useState(5000);
  const [adsAmount, setAdsAmount] = useState(1500);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeAmount, setAutoRechargeAmount] = useState(500);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [settingsWhatsappNumber, setSettingsWhatsappNumber] = useState("");
  const [projectWhatsappNumber, setProjectWhatsappNumber] = useState("");
  const [planInfo, setPlanInfo] = useState(null);

  const [planStep, setPlanStep] = useState(1);
  const [billingCycle, setBillingCycle] = useState("quarterly");
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [flowBuilderEnabled, setFlowBuilderEnabled] = useState(false);
  const [agentSeatCount, setAgentSeatCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await getSettings();
        if (!mounted) return;
        setSettingsWhatsappNumber(String(settings?.whatsappNumber || "").trim());
      } catch (_) {
        if (!mounted) return;
        setSettingsWhatsappNumber("");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch selected project's own WhatsApp number for this right card.
  useEffect(() => {
    const selectedProjectId = Number(selectedProject?.id);
    if (!Number.isInteger(selectedProjectId) || selectedProjectId <= 0) {
      setProjectWhatsappNumber("");
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await axios.get("/projects/list");
        const projects = Array.isArray(res?.data?.projects) ? res.data.projects : [];
        const matched = projects.find((p) => Number(p?.id) === selectedProjectId);
        const nextPhone = String(matched?.whatsappNumber || "").trim();
        if (mounted) setProjectWhatsappNumber(nextPhone);
      } catch (_) {
        if (mounted) setProjectWhatsappNumber("");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedProject?.id]);

  useEffect(() => {
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      setPlanInfo(null);
      return;
    }
    try {
      const raw = localStorage.getItem(`planInfo:${userId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      setPlanInfo(parsed && parsed.active ? parsed : null);
    } catch (_) {
      setPlanInfo(null);
    }
  }, [user?.id]);

  const businessName = selectedProject?.project_name || user?.name || user?.displayName || "Business";
  const businessCategory = (selectedProject?.category || user?.industry || "BUSINESS")
    .toString()
    .trim()
    .toUpperCase()
    .slice(0, 32);
  const rawPhone =
    projectWhatsappNumber ||
    settingsWhatsappNumber ||
    user?.whatsappNumber ||
    user?.whatsapp_number ||
    user?.mobileNumber ||
    user?.mobile_number ||
    user?.mobile ||
    user?.phone ||
    user?.phoneNumber ||
    user?.dataValues?.mobileNumber ||
    user?.dataValues?.mobile_number ||
    "";
  const fallbackCc = (user?.countryCode || user?.country_code || "+91").toString().trim();
  const splitPhone = splitWhatsappNumber(rawPhone, fallbackCc);
  const cc = splitPhone.countryCode || "+91";
  const phoneDigits = splitPhone.localNumber || "";
  const phoneDisplay = phoneDigits ? `${cc} ${phoneDigits}` : "--";

  const basePlanPrice = PLAN_PRICING[billingCycle][selectedPlan];
  const flowBuilderPrice = billingCycle === "quarterly" ? 7125 : billingCycle === "yearly" ? 24900 : 2499;
  const agentSeatPrice = billingCycle === "quarterly" ? 1200 : billingCycle === "yearly" ? 4200 : 450;
  const addonPrice = (flowBuilderEnabled ? flowBuilderPrice : 0) + agentSeatCount * agentSeatPrice;
  const grandTotal = basePlanPrice + addonPrice;
  const remainingCredits = conversationQuota != null && !loadingQuota ? Number(conversationQuota.remaining ?? 0) : null;
  const hasActivePlan = Boolean(planInfo?.active);
  const renewDateLabel = planInfo?.renewsOn
    ? new Date(planInfo.renewsOn).toLocaleDateString()
    : null;

  const planSummaryText = useMemo(() => {
    if (billingCycle === "monthly") return "Renews every month";
    if (billingCycle === "quarterly") return "Renews every 3 months";
    return "Renews every 12 months";
  }, [billingCycle]);

  const copyPhone = () => {
    const digits = phoneDisplay.replace(/\D/g, "");
    if (digits && navigator.clipboard?.writeText) navigator.clipboard.writeText(digits);
  };

  const loadRazorpayScript = () =>
    new Promise((resolve, reject) => {
      if (window.Razorpay || document.getElementById("razorpay-checkout-js")) return resolve(true);
      const script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load Razorpay script"));
      document.body.appendChild(script);
    });

  const openRazorpayCheckout = async ({ amount, purpose, description, metadata = {}, onSuccess }) => {
    if (paymentLoading) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please login again.");
      return;
    }
    setPaymentLoading(true);
    try {
      const createOrderRes = await fetch(`${API_URL}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, purpose, metadata }),
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
        description,
        order_id: createOrderData.orderId,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: phoneDigits || "",
        },
        theme: { color: "#0284c7" },
        modal: {
          ondismiss: () => setPaymentLoading(false),
        },
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${API_URL}/api/payments/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.message || "Payment verification failed");
            if (typeof onSuccess === "function") onSuccess();
          } catch (e) {
            alert(e.message || "Payment verification failed");
          } finally {
            setPaymentLoading(false);
          }
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        const msg = resp?.error?.description || resp?.error?.reason || "Payment failed";
        setPaymentLoading(false);
        alert(msg);
      });
      rzp.open();
    } catch (e) {
      setPaymentLoading(false);
      alert(e.message || "Payment failed");
    }
  };

  const purchaseWcc = () =>
    openRazorpayCheckout({
      amount: wccAmount,
      purpose: "wcc",
      description: "Purchase WhatsApp Conversation Credits (WCC)",
      metadata: { projectId: selectedProject?.id || null },
      onSuccess: () => {
        setShowWccModal(false);
        setPaymentLoading(false);
        alert("WCC purchased successfully!");
      },
    });

  const purchaseAdsCredits = () =>
    openRazorpayCheckout({
      amount: adsAmount,
      purpose: "ads_credits",
      description: "Purchase AiSensy Ads Credits",
      metadata: { projectId: selectedProject?.id || null },
      onSuccess: () => {
        setShowAdsModal(false);
        setPaymentLoading(false);
        alert("Ads credits purchased successfully!");
      },
    });

  const purchasePlan = () =>
    openRazorpayCheckout({
      amount: grandTotal,
      purpose: "plan_purchase",
      description: `${selectedPlan.toUpperCase()} plan (${billingCycle})`,
      metadata: {
        cycle: billingCycle,
        plan: selectedPlan,
        flowBuilderEnabled,
        agentSeatCount,
        basePlanPrice,
        addonPrice,
      },
      onSuccess: () => {
        const nowIso = new Date().toISOString();
        const renewsOn =
          billingCycle === "monthly"
            ? addMonthsIso(nowIso, 1)
            : billingCycle === "quarterly"
              ? addMonthsIso(nowIso, 3)
              : addMonthsIso(nowIso, 12);
        const nextPlanInfo = {
          active: true,
          plan: selectedPlan,
          cycle: billingCycle,
          purchasedAt: nowIso,
          renewsOn,
        };
        setPlanInfo(nextPlanInfo);
        const uid = Number(user?.id);
        if (Number.isInteger(uid) && uid > 0) {
          localStorage.setItem(`planInfo:${uid}`, JSON.stringify(nextPlanInfo));
        }
        setShowPlanModal(false);
        setPlanStep(1);
        setPaymentLoading(false);
        alert("Plan purchased successfully!");
      },
    });

  const cardShell =
    "relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80";

  return (
    <div className="space-y-3 md:space-y-4 motion-stagger-children">
      <div className={`${cardShell} p-3.5 md:p-4`}>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] sm:text-xs font-semibold text-sky-800">
          <button type="button" onClick={() => navigate("/analytics")} className="hover:text-sky-950 transition-colors">
            Analytics Dashboard
          </button>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift transition-all duration-300 hover:border-sky-200/60 hover:shadow-xl hover:shadow-sky-500/10`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent" aria-hidden />
        <div className="relative flex gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 tracking-tight text-sm md:text-base truncate">{businessName}</h3>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-600/90">{businessCategory}</p>
            <div className="mt-3 flex items-center gap-2">
              <p className="text-emerald-600 font-semibold text-sm md:text-base tabular-nums truncate">{phoneDisplay}</p>
              <button
                type="button"
                onClick={copyPhone}
                className="shrink-0 p-1.5 rounded-lg border border-gray-200/90 bg-white text-sky-700 hover:bg-sky-50 hover:border-sky-200 transition"
                title="Copy number"
                aria-label="Copy WhatsApp number"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <button type="button" onClick={() => navigate("/settings")} className="mt-3 text-xs font-semibold text-sky-700 hover:text-sky-900 flex items-center gap-1">
              View profile <span className="text-[10px]">▾</span>
            </button>
          </div>
          <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
            <span className="text-white font-bold text-lg">W</span>
          </div>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-sky-500/5" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Free Service Conversation</p>
          <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-gray-500">
            <span>0</span>
            <span>Unlimited</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-100 border border-gray-200/80 overflow-hidden">
            <div className="h-full w-[96%] rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 shadow-sm" />
          </div>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/8 to-blue-500/5" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-500 leading-snug">WhatsApp Conversation Credits (WCC)</p>
            <p className="mt-1 text-lg md:text-xl font-bold text-gray-900 tabular-nums">
              {loadingQuota ? "…" : remainingCredits != null ? `${remainingCredits} left` : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setWccAmount(5000);
              setPaymentLoading(false);
              setShowWccModal(true);
            }}
            className="shrink-0 px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-slate-800 to-slate-900 shadow-md shadow-slate-900/25 hover:from-slate-700 hover:to-slate-800 transition"
          >
            Buy More
          </button>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/8 to-blue-500/5" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Plan</p>
          <h3 className="mt-1.5 font-bold text-base md:text-lg bg-gradient-to-r from-sky-700 to-blue-800 bg-clip-text text-transparent tracking-tight">
            {hasActivePlan ? String(planInfo?.plan || "basic").toUpperCase() : "BASIC"}
          </h3>
          {hasActivePlan && renewDateLabel ? (
            <p className="mt-2 text-[11px] text-gray-500 leading-snug">Renews on {renewDateLabel}</p>
          ) : (
            <p className="mt-2 text-[11px] text-gray-500 leading-snug">Upgrade anytime from billing when you need higher limits.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setPlanStep(1);
              setPaymentLoading(false);
              setShowPlanModal(true);
            }}
            className="mt-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500 transition"
          >
            {hasActivePlan ? "Upgrade Now" : "Get Plan"}
          </button>
        </div>
      </div>

      {showAdsModal &&
        createPortal(
          <div className="fixed inset-0 z-[310] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowAdsModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-center justify-between bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase AiSensy Ads Credits</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Fund ad campaigns with instant top-up</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdsModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                >
                  &#x2715;
                </button>
              </div>
              <div className="p-5 bg-gradient-to-b from-white to-sky-50/30">
                <div className="rounded-2xl border border-sky-100/90 bg-white p-4 ring-1 ring-sky-100/80 shadow-lg shadow-sky-100/30">
                  <p className="text-xs text-gray-600 leading-relaxed">These ad credits can be used to create and run ads only from AiSensy&apos;s Ads Manager.</p>
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-800">Enter Amount</label>
                    <p className="text-xs text-gray-500 mt-1">Minimum purchase of 1500 credits is allowed</p>
                    <div className="mt-2 flex items-center">
                      <span className="px-3 py-2.5 border-2 border-r-0 border-sky-200 rounded-l-xl bg-sky-50 text-sky-700 font-semibold text-sm">₹</span>
                      <input
                        type="number"
                        value={adsAmount}
                        min={1500}
                        step={500}
                        onChange={(e) => setAdsAmount(Number(e.target.value))}
                        className="w-full px-3 py-2.5 border-2 border-sky-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[2500, 5000, 10000, 50000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdsAmount(amt)}
                          className={`px-2 py-2 text-xs rounded-xl font-semibold transition border-2 ${
                            adsAmount === amt
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md"
                              : "bg-white text-gray-700 border-sky-100 hover:border-sky-300 hover:bg-sky-50/80"
                          }`}
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={purchaseAdsCredits}
                      disabled={paymentLoading}
                      className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {paymentLoading ? "Opening…" : "Purchase Now"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showWccModal &&
        createPortal(
          <div className="motion-enter fixed inset-0 z-[300] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowWccModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="motion-pop relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-start justify-between gap-4 bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base md:text-lg font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase WhatsApp Conversation Credits (WCC)</h3>
                  <p className="text-xs text-slate-500 mt-1">Keep conversations running with instant recharge</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowWccModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                  aria-label="Close"
                >
                  &#x2715;
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5 bg-gradient-to-b from-white to-sky-50/30">
                <div className="rounded-2xl p-4 md:p-5 border-2 border-sky-100/90 bg-gradient-to-br from-white to-sky-50/40 shadow-inner ring-1 ring-sky-100/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800">Enter WCC Amount</p>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold ring-1 ring-sky-200/80">Min 5000</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Minimum amount of 5000 credits is allowed.</p>

                  <div className="mt-3 flex items-center">
                    <span className="px-3 py-2.5 border-2 border-r-0 border-sky-200 rounded-l-xl bg-sky-50 text-sky-700 font-semibold text-sm">₹</span>
                    <input
                      type="number"
                      value={wccAmount}
                      min={5000}
                      step={5000}
                      onChange={(e) => setWccAmount(Number(e.target.value))}
                      className="w-full px-3 py-2.5 border-2 border-sky-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white"
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
                                : "bg-white text-gray-700 border-sky-100 hover:border-sky-300 hover:bg-sky-50/80"
                          }`}
                        >
                          {amt.toLocaleString()}
                        </button>
                      );
                    })}
                  </div>

                  <button type="button" onClick={purchaseWcc} disabled={paymentLoading} className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {paymentLoading ? "Opening…" : "Purchase Now"}
                  </button>
                </div>

                <div className="rounded-2xl p-4 md:p-5 border-2 border-sky-100/90 bg-white/85 ring-1 ring-sky-100/80 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Enable WCC auto-recharge</p>
                      <p className="text-xs text-gray-500 mt-1">Auto-recharge when your WCC goes below the threshold.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                      <input type="checkbox" checked={autoRechargeEnabled} onChange={(e) => setAutoRechargeEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-semibold text-gray-700">On</span>
                    </label>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-800">Enter auto-recharge amount</label>
                    <div className="mt-2 flex items-center">
                      <span className="px-3 py-2.5 border-2 border-r-0 border-gray-200 rounded-l-xl bg-gray-50/80 text-gray-700 font-semibold text-sm">₹</span>
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

                    <button type="button" disabled={!autoRechargeEnabled} className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 shadow-md shadow-sky-500/20 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      Start
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showPlanModal &&
        createPortal(
          <div className="fixed inset-0 z-[320] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowPlanModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="relative z-10 h-full w-full max-w-4xl overflow-y-auto bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-center justify-between bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base md:text-lg font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase Plan</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Choose plan and add-ons that fit your team</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPlanModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                >
                  &#x2715;
                </button>
              </div>
              <div className="p-5 space-y-5 bg-gradient-to-b from-white to-sky-50/30">
                {planStep === 1 ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                      <p className="text-sm font-semibold text-emerald-800">Upgrade your plan to unlock this feature</p>
                      <p className="text-xs text-emerald-700 mt-1">Get advanced features to elevate your marketing game</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-sky-50/90 p-1.5 ring-1 ring-sky-100/80">
                      {["monthly", "quarterly", "yearly"].map((cycle) => (
                        <button
                          key={cycle}
                          type="button"
                          onClick={() => setBillingCycle(cycle)}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg transition ${
                            billingCycle === cycle ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow" : "bg-transparent text-slate-700 hover:bg-white"
                          }`}
                        >
                          {cycle.charAt(0).toUpperCase() + cycle.slice(1)} {PLAN_DISCOUNT_LABEL[cycle]}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {["basic", "pro", "enterprise"].map((plan) => (
                        <button
                          key={plan}
                          type="button"
                          onClick={() => setSelectedPlan(plan)}
                          className={`text-left rounded-2xl border-2 p-4 transition ${
                            selectedPlan === plan
                              ? "border-emerald-400 ring-2 ring-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white shadow-md"
                              : "border-gray-200 bg-white hover:border-sky-200 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-base font-bold text-slate-900 uppercase">{plan}</h4>
                            {selectedPlan === plan ? <span className="text-[10px] font-bold text-emerald-700">CHOSEN</span> : null}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-emerald-700">₹ {PLAN_PRICING[billingCycle][plan].toLocaleString()}/{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}</p>
                          <ul className="mt-3 space-y-1">
                            {PLAN_FEATURES[plan].map((f) => (
                              <li key={f} className="text-[11px] text-gray-600">
                                • {f}
                              </li>
                            ))}
                          </ul>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-sky-100/90 p-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Total</p>
                          <p className="text-xs text-slate-500">{planSummaryText}</p>
                        </div>
                        <p className="text-xl font-bold text-emerald-700">₹ {basePlanPrice.toLocaleString()}</p>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setPlanStep(2)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition shadow-md shadow-emerald-500/25">
                          Continue
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-sky-100/90 p-4 space-y-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Flow Builder Add-on</p>
                          <p className="text-xs text-slate-500">Drag & drop chatbot builder, catalogs, and checkout support.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFlowBuilderEnabled((v) => !v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            flowBuilderEnabled ? "bg-rose-100 text-rose-700 border border-rose-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {flowBuilderEnabled ? "Remove Add-on" : "Select Add-on"}
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-emerald-700">
                        ₹ {flowBuilderPrice.toLocaleString()}/{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-sky-100/90 p-4 space-y-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Agent Seats Add-on</p>
                          <p className="text-xs text-slate-500">Multi-agent collaboration with role-based access control.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {[-1, 1, 5, 10].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => setAgentSeatCount((prev) => Math.max(0, prev + delta))}
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-slate-700 hover:bg-sky-50"
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-600">No. of agent seats: {agentSeatCount}</p>
                        <p className="text-sm font-semibold text-emerald-700">
                          ₹ {(agentSeatCount * agentSeatPrice).toLocaleString()}/{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-sky-100/90 p-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-xl border border-gray-200 p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing Address</p>
                          <p className="mt-1 text-sm text-slate-700">Pune, Maharashtra, IN</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Method</p>
                          <p className="mt-1 text-sm text-slate-700">Add card and pay securely via Razorpay</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Total</p>
                          <p className="text-xs text-slate-500">{planSummaryText}</p>
                        </div>
                        <p className="text-2xl font-bold text-emerald-700">
                          ₹ {grandTotal.toLocaleString()}/{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                        </p>
                      </div>
                      <div className="flex justify-between gap-2">
                        <button type="button" onClick={() => setPlanStep(1)} className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-slate-700 hover:bg-gray-50">
                          Back
                        </button>
                        <button type="button" onClick={purchasePlan} disabled={paymentLoading} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25">
                          {paymentLoading ? "Opening…" : "Purchase Now"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default AgentRightPanel;
