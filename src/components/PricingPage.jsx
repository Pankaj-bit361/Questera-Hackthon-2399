import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import { toast } from 'react-toastify';
import SafeIcon from '../common/SafeIcon';
import { creditsAPI } from '../lib/api';
import logo from "../../assets/velos 1.svg";

const { FiCheck, FiX, FiChevronLeft, FiZap, FiStar, FiTrendingUp, FiArrowRight, FiLoader, FiShield } = FiIcons;

const FEATURES_MAP = {
  free: [
    "Standard generation speed",
    "Public gallery access",
    "Standard resolution (1K)",
    "Basic styles",
    "Community support"
  ],
  growth: [
    "Fast generation speed",
    "Private gallery",
    "High resolution (2K)",
    "All art styles",
    "Priority support",
    "No watermarks"
  ],
  pro: [
    "Turbo generation speed",
    "Private gallery",
    "Ultra resolution (4K)",
    "Exclusive beta features",
    "Commercial license",
    "Priority support (24/7)"
  ],
  business: [
    "Instant generation",
    "API Access",
    "Dedicated account manager",
    "Custom model fine-tuning",
    "Unlimited storage",
    "Team collaboration"
  ]
};

// Simplified, premium styling logic
const getPlanStyles = (key) => {
  if (key === 'pro') {
    return {
      container: "bg-[#18181b] border-white/10 ring-1 ring-white/20 shadow-[0_0_50px_-12px_rgba(120,50,255,0.2)]",
      button: "bg-white text-black hover:bg-zinc-200",
      badge: "bg-white text-black",
      icon: "text-white"
    };
  }
  if (key === 'business') {
    return {
      container: "bg-[#09090b] border-white/5 hover:border-white/10",
      button: "bg-zinc-800 text-white hover:bg-zinc-700 border border-white/5",
      badge: "bg-zinc-800 text-zinc-300 border border-white/10",
      icon: "text-amber-400"
    };
  }
  return {
    container: "bg-[#09090b] border-white/5 hover:border-white/10",
    button: "bg-[#18181b] text-white hover:bg-zinc-800 border border-white/5",
    badge: null,
    icon: "text-zinc-500"
  };
};

const PricingPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [subscribing, setSubscribing] = useState(null);

  // Get user from localStorage
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await creditsAPI.getPlans();
        if (response.success) {
          const sortedPlans = response.plans.sort((a, b) => a.price - b.price);
          setPlans(sortedPlans);
        }
      } catch (error) {
        console.error("Failed to fetch plans:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();

    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubscribe = async (plan) => {
    if (plan.key === 'free') return;

    if (!user.userId) {
      toast.warning('Please login to subscribe');
      navigate('/');
      return;
    }

    setSubscribing(plan.key);

    try {
      // Create subscription on backend
      const response = await creditsAPI.createSubscription(
        user.userId,
        plan.key,
        user.email,
        user.name
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to create subscription');
      }

      // Open Razorpay checkout
      const options = {
        key: response.razorpayKeyId,
        subscription_id: response.subscriptionId,
        name: plan.name,
        description: response.description,
        handler: async function (paymentResponse) {
          // Verify payment on backend
          try {
            const verifyResponse = await creditsAPI.verifyPayment({
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
              razorpay_signature: paymentResponse.razorpay_signature,
              userId: user.userId,
              planKey: plan.key,
            });

            if (verifyResponse.success) {
              toast.success(`🎉 Successfully subscribed to ${plan.name}! You now have ${verifyResponse.credits.balance} credits.`);
              navigate('/home');
            } else {
              toast.error('Payment verification failed. Please contact support.');
            }
          } catch (error) {
            console.error('Verification error:', error);
            toast.error('Payment verification failed. Please contact support.');
          }
        },
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        theme: {
          color: '#18181b',
        },
        modal: {
          ondismiss: function () {
            setSubscribing(null);
          },
        },
        // For subscriptions, only these methods are supported
        method: {
          card: true,
          upi: true,        // UPI Autopay
          emandate: true,   // Bank mandate
          netbanking: false,
          wallet: false,
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Subscription error:', error);
      toast.error(error.message || 'Failed to create subscription. Please try again.');
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <SafeIcon icon={FiLoader} className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/20">

      {/* Subtle Gradient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-white/5 to-transparent blur-[120px] rounded-full opacity-20" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-24">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-medium group"
          >
            <SafeIcon icon={FiChevronLeft} className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          <div className="flex items-center gap-2.5">

            <span className="font-bold text-lg tracking-tight">
              <img src={logo} alt="Logo" className="w-8 h-8" />
            </span>
          </div>
        </header>

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold mb-6 tracking-tight"
          >
            Simple, transparent <br />
            <span className="text-zinc-500">pricing for creators.</span>
          </motion.h1>


        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan, index) => {
            const styles = getPlanStyles(plan.key);
            const features = FEATURES_MAP[plan.key] || FEATURES_MAP.free;
            const isPro = plan.key === 'pro';

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
                className={`relative flex flex-col p-6 rounded-3xl border transition-all duration-300 ${styles.container}`}
              >
                {/* Badge */}
                {isPro && (
                  <div className="absolute -top-3 right-6 px-3 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-wider rounded-full shadow-lg shadow-white/10">
                    Most Popular
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">₹{plan.price}</span>
                    <span className="text-zinc-500 text-sm">/mo</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-zinc-300">
                    <SafeIcon icon={FiZap} className={`w-3.5 h-3.5 ${styles.icon}`} />
                    <span><strong className="text-white">{plan.credits}</strong> credits monthly</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="flex-1 space-y-3 mb-8">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs text-zinc-400">
                      <SafeIcon icon={FiCheck} className="w-3.5 h-3.5 text-white flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={subscribing === plan.key || plan.key === 'free'}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${styles.button} ${subscribing === plan.key ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {subscribing === plan.key ? (
                    <>
                      <SafeIcon icon={FiLoader} className="w-3.5 h-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : plan.key === 'free' ? (
                    'Current Plan'
                  ) : (
                    <>
                      Subscribe
                      <SafeIcon icon={FiArrowRight} className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Enterprise / Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#18181b] flex items-center justify-center border border-white/5">
              <SafeIcon icon={FiShield} className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Enterprise Security</h4>
              <p className="text-xs text-zinc-500">SOC2 compliant data handling for teams.</p>
            </div>
          </div>

          <div className="flex gap-8 opacity-30 grayscale mix-blend-screen">
            {/* Simple text logos for aesthetic */}
            <span className="font-bold text-lg tracking-widest">ACME</span>
            <span className="font-bold text-lg tracking-widest">LAYER</span>
            <span className="font-bold text-lg tracking-widest">CHEX</span>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default PricingPage;