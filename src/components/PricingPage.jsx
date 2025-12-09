import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { creditsAPI } from '../lib/api';

const { FiCheck, FiX, FiChevronLeft, FiZap, FiStar, FiTrendingUp, FiAward, FiLoader } = FiIcons;

const FEATURES_MAP = {
  free: [
    "Standard generation speed",
    "Public gallery access",
    "Standard resolution (1K)",
    "Basic styles",
    "Community support"
  ],
  launch: [
    "Fast generation speed",
    "Private gallery",
    "High resolution (2K)",
    "All art styles",
    "Priority support",
    "No watermarks"
  ],
  standard: [
    "Turbo generation speed",
    "Private gallery",
    "Ultra resolution (4K)",
    "Exclusive beta features",
    "Commercial license",
    "Priority support (24/7)"
  ],
  scale: [
    "Instant generation",
    "API Access",
    "Dedicated account manager",
    "Custom model fine-tuning",
    "Unlimited storage",
    "Team collaboration features"
  ]
};

const PLAN_STYLES = {
  free: {
    gradient: "from-zinc-700 to-zinc-900",
    border: "border-zinc-700",
    glow: "group-hover:shadow-zinc-500/20",
    badge: null
  },
  launch: {
    gradient: "from-blue-600 to-indigo-700",
    border: "border-blue-500/50",
    glow: "group-hover:shadow-blue-500/40",
    badge: "Starter Choice"
  },
  standard: {
    gradient: "from-purple-600 to-pink-600",
    border: "border-purple-500/50",
    glow: "group-hover:shadow-purple-500/50",
    badge: "Most Popular"
  },
  scale: {
    gradient: "from-amber-500 to-orange-600",
    border: "border-amber-500/50",
    glow: "group-hover:shadow-amber-500/40",
    badge: "Best Value"
  }
};

const PricingPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly'); // visual toggle only for now

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await creditsAPI.getPlans();
        if (response.success) {
          // Sort plans by price
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
  }, []);

  const handleSubscribe = (plan) => {
    // Placeholder for payment integration
    console.log("Subscribe to:", plan);
    // You would typically redirect to a payment gateway or open a modal here
    alert(`Redirecting to payment for ${plan.name}... (Integration required)`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <SafeIcon icon={FiLoader} className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden selection:bg-purple-500/30">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <button 
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
          >
            <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
              <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
            </div>
            <span className="font-medium">Back to Home</span>
          </button>
          
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
                <SafeIcon icon={FiZap} className="text-white w-4 h-4" />
             </div>
             <span className="font-bold text-xl tracking-tight">Velos Premium</span>
          </div>
        </header>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-tight"
          >
            Unlock your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-200 to-zinc-400">
              creative potential
            </span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          >
            Choose the perfect plan to fuel your imagination. Generate stunning visuals with higher limits, faster speeds, and exclusive features.
          </motion.p>

          {/* Billing Toggle (Visual Only) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 inline-flex items-center p-1 bg-white/5 rounded-full border border-white/10 backdrop-blur-md"
          >
            <button 
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${billingCycle === 'monthly' ? 'bg-white text-black shadow-lg' : 'text-zinc-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button 
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-white text-black shadow-lg' : 'text-zinc-400 hover:text-white'}`}
            >
              Yearly <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">-20%</span>
            </button>
          </motion.div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 relative">
          {plans.map((plan, index) => {
            const styles = PLAN_STYLES[plan.key] || PLAN_STYLES.free;
            const features = FEATURES_MAP[plan.key] || FEATURES_MAP.free;
            const isPopular = plan.key === 'standard';

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.3 }}
                className={`relative group flex flex-col p-6 rounded-3xl border bg-[#1c1c1e] transition-all duration-500 hover:-translate-y-2 ${styles.border} ${styles.glow} shadow-2xl hover:shadow-2xl`}
              >
                {/* Popular Badge */}
                {styles.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg bg-gradient-to-r ${styles.gradient}`}>
                    {styles.badge}
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-zinc-300 mb-2 uppercase tracking-widest text-xs">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">${plan.price}</span>
                    <span className="text-zinc-500 text-sm">/month</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/5">
                    <SafeIcon icon={FiZap} className="w-4 h-4 text-yellow-400" />
                    <span className="font-bold text-white">{plan.credits}</span> Credits / mo
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-white/5 mb-6" />

                {/* Features */}
                <div className="flex-1 space-y-4 mb-8">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-white/5 group-hover:bg-white/10`}>
                        <SafeIcon icon={FiCheck} className={`w-2.5 h-2.5 ${plan.key === 'free' ? 'text-zinc-500' : 'text-white'}`} />
                      </div>
                      {feature}
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  className={`w-full py-4 rounded-xl font-bold text-sm transition-all duration-300 relative overflow-hidden group/btn ${
                    plan.key === 'free' 
                      ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                      : `bg-gradient-to-r ${styles.gradient} text-white shadow-lg`
                  }`}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {plan.key === 'free' ? 'Current Plan' : 'Get Started'}
                    {plan.key !== 'free' && <SafeIcon icon={FiIcons.FiArrowRight} className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />}
                  </span>
                  {plan.key !== 'free' && (
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ / Trust Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-32 text-center border-t border-white/5 pt-16"
        >
          <p className="text-zinc-500 text-sm mb-6 uppercase tracking-widest">Trusted by creators worldwide</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-40 grayscale">
             {/* Placeholder Logos */}
             <div className="text-2xl font-bold">ACME Corp</div>
             <div className="text-2xl font-bold">GlobalDesign</div>
             <div className="text-2xl font-bold">NextGen</div>
             <div className="text-2xl font-bold">Visionary</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PricingPage;