import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { API_BASE_URL } from '../config';
import { isLoggedIn, setAuth, getAuthToken } from '../lib/velosStorage';

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
    const token = getAuthToken();
    if (token && isLoggedIn() && !isTokenExpired(token)) {
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
        // Store auth data using velosStorage
        setAuth(data.token, data.user);
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
    <div className="flex min-h-screen w-full bg-white font-sans text-gray-900">

      {/* Visual Section - Now on LEFT */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#09090b] relative flex-col justify-between p-12 overflow-hidden border-r border-white/5">

        {/* Animated Background Grid */}
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[500px] w-[500px] rounded-full bg-white opacity-[0.05] blur-[100px]"></div>
        </div>

        {/* Top Status Bar */}
        <div className="relative z-10 flex justify-start">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">System Online</span>
          </div>
        </div>

        {/* Center Hero: Floating Abstract V */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="relative w-80 h-80 flex items-center justify-center"
          >
            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full animate-pulse-slow"></div>

            {/* Floating Logo Container */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-10"
            >
              {/* Geometric V Logo constructed from SVG */}
              <svg width="180" height="180" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
                <path d="M60 40L100 140L140 40H170L100 190L30 40H60Z" fill="url(#paint0_linear)" stroke="white" strokeOpacity="0.1" />
                <path d="M75 55L100 115L125 55" fill="black" fillOpacity="0.2" />
                <defs>
                  <linearGradient id="paint0_linear" x1="100" y1="40" x2="100" y2="190" gradientUnits="userSpaceOnUse">
                    <stop stopColor="white" />
                    <stop offset="1" stopColor="#52525b" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>

            {/* Orbiting Elements */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border border-white/5 rounded-full border-dashed opacity-50"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute inset-10 border border-white/5 rounded-full opacity-30"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-8 space-y-4"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">
              Visualise the <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-zinc-400 to-zinc-700">impossible.</span>
            </h2>
          </motion.div>
        </div>

        {/* Bottom Card - Glassmorphic Status */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="relative z-10 mx-auto w-full max-w-sm"
        >
          <div className="bg-[#18181b]/80 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl flex items-center gap-4 group hover:border-white/20 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg relative overflow-hidden">
              <SafeIcon icon={FiZap} className="w-6 h-6 text-black z-10" />
              <div className="absolute inset-0 bg-gradient-to-tr from-zinc-200 to-transparent opacity-50"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">New Generation</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <p className="text-xs text-zinc-500 font-mono">PROCESSING_REQUEST...</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 font-bold">0.4s</p>
            </div>
          </div>
        </motion.div>

      </div>

      {/* Form Section - Now on RIGHT */}
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
                    className="flex items-center justify-center gap-2 group w-full py-4 text-lg font-bold bg-black text-white rounded-xl hover:bg-gray-900 disabled:opacity-70 transition-all shadow-lg"
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
                        className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-900 focus:border-black focus:bg-white transition-all outline-none caret-black"
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-4">
                    <button
                      type="submit"
                      disabled={loading || otp.join('').length !== 6}
                      className="py-4 text-lg font-bold bg-black text-white rounded-xl hover:bg-gray-900 disabled:opacity-70 flex items-center justify-center transition-all shadow-lg"
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
                          className="font-bold text-black hover:underline"
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
              By continuing, you agree to Velos's <br />
              <a href="/terms-of-service" className="underline hover:text-gray-600 mx-1 transition-colors">Terms of Service</a> and <a href="/privacy-policy" className="underline hover:text-gray-600 mx-1 transition-colors">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;