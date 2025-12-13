import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { API_BASE_URL } from '../config';

const { FiMail, FiArrowRight, FiCheck, FiChevronLeft, FiZap, FiAlertCircle } = FiIcons;

// Helper to check if JWT token is expired
const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    return Date.now() >= exp;
  } catch {
    return true;
  }
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');// 'email' or 'otp'
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(new Array(6).fill(''));// 6 digits
  const [timer, setTimer] = useState(30);
  const [error, setError] = useState('');
  const otpInputRefs = useRef([]);

  // Check if user is already logged in with valid token - redirect to home
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user && !isTokenExpired(token)) {
      navigate('/home', { replace: true });
    }
  }, [navigate]);

  // OTP Timer countdown
  useEffect(() => {
    let interval;
    if (step === 'otp' && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Clear error when user types
  useEffect(() => {
    if (error) setError('');
  }, [email, otp]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (response.ok) {
        setStep('otp');
        setTimer(30);
      } else {
        setError(data.error || 'Failed to send verification code.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.every(char => !isNaN(char))) {
      const newOtp = [...otp];
      pastedData.forEach((val, i) => {
        if (i < 6) newOtp[i] = val;
      });
      setOtp(newOtp);
      const nextFocus = Math.min(pastedData.length, 5);
      otpInputRefs.current[nextFocus].focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const otpCode = otp.join('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      });
      const data = await response.json();

      if (response.ok) {
        // Store auth data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/home');
      } else {
        setError(data.error || 'Invalid verification code.');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setTimer(30);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to resend code.');
      }
    } catch (err) {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-white font-sans">
      {/* Left Section - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 sm:px-12 xl:px-24 bg-white relative z-10">
        <div className="w-full max-w-md space-y-8">
          {/* Logo & Header */}
          <div className="space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg">
                <SafeIcon icon={FiZap} className="text-white w-5 h-5" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-gray-900">Velos</span>
            </div>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {step === 'email' ? 'Welcome Back' : 'Check your inbox'}
              </h1>
              <p className="text-gray-500 mt-2 text-base">
                {step === 'email' ? 'Enter your email to start generating high-converting ads.' : `We've sent a 6-digit code to ${email}`}
              </p>
            </motion.div>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100"
              >
                <SafeIcon icon={FiAlertCircle} className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Container */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {step === 'email' ? (
                <motion.form
                  key="email-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleEmailSubmit}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Email Address</label>
                    <div className="relative group">
                      <SafeIcon icon={FiMail} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors z-10" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-4 pl-11 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black focus:bg-white transition-all duration-200 font-medium"
                        placeholder="name@company.com"
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-black flex items-center justify-center gap-2 group w-full py-4 text-lg disabled:opacity-70"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Continue to Velos</span>
                        <SafeIcon icon={FiArrowRight} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="otp-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleVerify}
                  className="space-y-8"
                >
                  <div className="flex gap-2 sm:gap-3 justify-between" onPaste={handlePaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => otpInputRefs.current[i] = el}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-black focus:bg-white transition-all outline-none caret-black selection:bg-black/20"
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-4">
                    <button
                      type="submit"
                      disabled={loading || otp.join('').length !== 6}
                      className="btn-black py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : 'Verify Access'}
                    </button>
                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => { setStep('email'); setOtp(new Array(6).fill('')); setError(''); }}
                        className="text-gray-500 hover:text-black font-medium flex items-center gap-1 transition-colors"
                      >
                        <SafeIcon icon={FiChevronLeft} /> Wrong email?
                      </button>
                      {timer > 0 ? (
                        <span className="text-gray-400 font-medium">
                          Resend in 00:{timer < 10 ? `0${timer}` : timer}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendCode}
                          className="font-semibold text-black hover:underline"
                          disabled={loading}
                        >
                          Resend Code
                        </button>
                      )}
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <p className="pt-8 text-center text-xs text-gray-400 leading-relaxed">
              By continuing,you agree to Velos's <br />
              <a href="/terms-of-service" className="underline hover:text-gray-600 mx-1">Terms of Service</a> and <a href="/privacy-policy" className="underline hover:text-gray-600 mx-1">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Right Section - EXACT Reference Clone with "V" */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#050505] relative flex-col justify-between p-12 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-full h-[60%] bg-gradient-to-b from-[#111] to-transparent pointer-events-none opacity-50"></div>
        {/* Diagonal Beam */}
        <div className="absolute top-[-20%] right-[-10%] w-[1px] h-[150%] bg-gradient-to-b from-transparent via-white/10 to-transparent transform rotate-45 pointer-events-none"></div>
        <div className="absolute top-[-30%] right-[10%] w-[1px] h-[150%] bg-gradient-to-b from-transparent via-white/5 to-transparent transform rotate-45 pointer-events-none"></div>

        {/* Top: Large Geometric "V" Logo */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center mt-[-40px]">
          <div className="w-[300px] h-[300px] relative flex items-center justify-center">
            {/* The V Shape */}
            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl opacity-90">
              <defs>
                <linearGradient id="v-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#333" />
                  <stop offset="50%" stopColor="#1a1a1a" />
                  <stop offset="100%" stopColor="#000" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Main V Structure */}
              <path
                d="M40,40 L100,180 L160,40 L130,40 L100,120 L70,40 Z"
                fill="url(#v-gradient)"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
                filter="url(#glow)"
                className="drop-shadow-2xl"
              />
              {/* Inner darker V for depth */}
              <path d="M75,50 L100,110 L125,50" fill="#0a0a0a" opacity="0.8" />
            </svg>
            {/* Ambient Glow behind logo */}
            <div className="absolute inset-0 bg-white/5 blur-[100px] rounded-full pointer-events-none"></div>
          </div>

          {/* Middle Content */}
          <div className="w-full max-w-sm mt-8 space-y-6">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-white leading-tight">
                Welcome to Velos
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                Velos helps marketers to build high-converting ad creatives using advanced AI models.
              </p>
              <p className="text-gray-500 text-xs mt-4">
                More than 17k people joined us,it's your turn
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Card Section */}
        <div className="relative z-10 w-full max-w-md mx-auto mt-12">
          <div className="bg-[#1c1c1e] rounded-[2rem] p-8 pb-10 relative overflow-hidden group border border-white/5">
            {/* Card Content */}
            <div className="relative z-10">
              <h3 className="text-2xl font-semibold text-white mb-2">
                Generate your first <br /> ad creative now
              </h3>
              <p className="text-gray-400 text-sm max-w-[240px] leading-relaxed">
                Be among the first founders to experience the easiest way to generate ads.
              </p>

              {/* Avatar Group */}
              <div className="flex items-center gap-3 mt-8 justify-end">
                <div className="flex -space-x-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-[#1c1c1e] bg-gray-700 overflow-hidden relative">
                      <img
                        src={`https://i.pravatar.cc/100?img=${10 + i}`}
                        alt="User"
                        className="w-full h-full object-cover grayscale opacity-80 hover:opacity-100 transition-opacity"
                      />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border-2 border-[#1c1c1e] bg-white text-black flex items-center justify-center text-xs font-bold z-10">
                    +2k
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative Card Elements */}
            <div className="absolute right-[-20px] top-[-20px] w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute left-[-20px] bottom-[-20px] w-40 h-40 bg-black/20 rounded-full blur-2xl pointer-events-none"></div>
          </div>
          {/* Card decorative line connection */}
          <div className="absolute right-[-100px] bottom-[50%] w-[100px] h-[1px] bg-gradient-to-l from-transparent to-indigo-500/50"></div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;