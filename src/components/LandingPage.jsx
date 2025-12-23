import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiImage, FiVideo, FiInstagram, FiCalendar, FiCpu, FiTrendingUp, FiZap, FiMessageSquare, FiPlay, FiHexagon, FiMenu, FiX } from 'react-icons/fi';
import Lenis from 'lenis';
import { motion, AnimatePresence } from 'framer-motion';

// Velos Logo Component
const VelosLogo = ({ className = "w-7 h-7" }) => (
    <img src="/velos-logo.svg" alt="Velos" className={className} />
);

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        // Initialize Lenis smooth scroll
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        // Scroll handler
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            lenis.destroy();
        };
    }, []);

    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20">

            {/* Subtle Grid Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            {/* Navigation - Desktop */}
            <nav className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 hidden md:block ${scrolled ? 'top-3' : 'top-5'}`}>
                <div className={`flex items-center gap-1 px-2 py-2 rounded-2xl border transition-all duration-500 ${scrolled ? 'bg-zinc-900/80 backdrop-blur-xl border-white/10 shadow-2xl shadow-black/50' : 'bg-zinc-900/60 backdrop-blur-md border-white/5'}`}>
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors">
                        <VelosLogo className="w-6 h-6" />
                        <span className="font-semibold text-white text-sm">Velos</span>
                    </Link>

                    {/* Divider */}
                    <div className="w-px h-6 bg-white/10 mx-1" />

                    {/* Nav Links */}
                    <div className="flex items-center">
                        <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Pricing</button>
                    </div>

                    {/* Divider */}
                    <div className="w-px h-6 bg-white/10 mx-1" />

                    {/* Auth Buttons */}
                    <div className="flex items-center gap-1">
                        <Link to="/login" className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                            Log in
                        </Link>
                        <Link to="/login" className="px-4 py-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-zinc-200 transition-colors">
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Navigation - Mobile */}
            <nav className="fixed top-0 left-0 right-0 z-50 md:hidden">
                {/* Mobile Header */}
                <div className={`flex items-center justify-between px-4 py-3 transition-all duration-300 ${scrolled || mobileMenuOpen ? 'bg-black/90 backdrop-blur-xl border-b border-white/10' : 'bg-transparent'}`}>
                    <Link to="/" className="flex items-center gap-2">
                        <VelosLogo className="w-7 h-7" />
                        <span className="font-semibold text-white">Velos</span>
                    </Link>

                    <div className="flex items-center gap-3">
                        <Link to="/login" className="px-4 py-2 text-sm font-medium bg-white text-black rounded-xl">
                            Start
                        </Link>
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 border border-white/10"
                        >
                            {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="bg-black/95 backdrop-blur-xl border-b border-white/10 overflow-hidden"
                        >
                            <div className="px-4 py-6 space-y-2">
                                {[
                                    { label: 'Pricing', targetId: 'pricing', icon: FiZap },
                                ].map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setMobileMenuOpen(false);
                                            document.getElementById(item.targetId)?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors w-full text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                            <item.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <span className="text-white font-medium">{item.label}</span>
                                        <FiArrowRight className="w-4 h-4 text-zinc-500 ml-auto" />
                                    </button>
                                ))}

                                {/* Divider */}
                                <div className="h-px bg-white/10 my-4" />

                                {/* Login Link */}
                                <Link
                                    to="/login"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    Log in to your account
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Hero Section */}
            <section className="relative min-h-screen flex flex-col justify-center px-6 pt-28 pb-16 overflow-hidden z-10">
                <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center">
                    {/* Left Side - Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                        className="space-y-8"
                    >
                        {/* Headline */}
                        <div>
                            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]">
                                <span className="text-white">Create.</span>
                                <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-400 to-zinc-600">Infinite.</span>
                                <br />
                                <span className="text-white">Reality.</span>
                            </h1>
                        </div>

                        {/* Description */}
                        <p className="max-w-md text-base sm:text-lg text-zinc-500 leading-relaxed">
                            The AI operating system for creators. Generate images, videos, and grow your Instagram — all on autopilot.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-wrap items-center gap-3">
                            <Link to="/login" className="group px-6 py-3 bg-white text-black rounded-full font-semibold hover:bg-zinc-100 transition-all flex items-center gap-2">
                                Get Started
                                <FiArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                            <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="px-6 py-3 rounded-full border border-white/20 text-white hover:bg-white/5 transition-colors font-medium">
                                View Pricing
                            </button>
                        </div>

                        {/* Social Proof */}
                        <div className="flex items-center gap-3 pt-4">
                            <div className="flex -space-x-2">
                                {[1, 2, 3].map(i => (
                                    <div
                                        key={i}
                                        className="w-8 h-8 rounded-full border-2 border-black bg-zinc-800 overflow-hidden"
                                    >
                                        <img src={`https://i.pravatar.cc/80?img=${i + 10}`} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                            <span className="text-sm text-zinc-500">10,000+ creators</span>
                        </div>

                        {/* Mobile Circuit Visual - Only visible on mobile/tablet */}
                        <div className="lg:hidden relative mt-8">
                            {/* Circuit Board SVG Background */}
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" fill="none" preserveAspectRatio="xMidYMid slice">
                                {/* Left circuits */}
                                <path d="M -20 60 H 40 V 90 H 80" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M -20 100 H 30 V 140 H 70" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M -20 180 H 50 V 220 H 90" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M -20 240 H 40 V 270 H 80" stroke="white" strokeOpacity="0.12" strokeWidth="1" />

                                {/* Right circuits */}
                                <path d="M 420 50 H 360 V 80 H 320" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M 420 120 H 370 V 150 H 330" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M 420 190 H 350 V 220 H 310" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                                <path d="M 420 260 H 360 V 280 H 320" stroke="white" strokeOpacity="0.12" strokeWidth="1" />

                                {/* Center connections */}
                                <path d="M 80 90 H 120 V 130 H 150" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
                                <path d="M 320 150 H 280 V 170 H 250" stroke="white" strokeOpacity="0.15" strokeWidth="1" />

                                {/* Animated current flows */}
                                <motion.path
                                    d="M -20 100 H 30 V 140 H 120 V 150"
                                    stroke="white"
                                    strokeOpacity="0.4"
                                    strokeWidth="1.5"
                                    strokeDasharray="6 10"
                                    initial={{ strokeDashoffset: 0 }}
                                    animate={{ strokeDashoffset: -80 }}
                                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                                />
                                <motion.path
                                    d="M 420 120 H 370 V 150 H 280 V 150"
                                    stroke="white"
                                    strokeOpacity="0.4"
                                    strokeWidth="1.5"
                                    strokeDasharray="6 10"
                                    initial={{ strokeDashoffset: 0 }}
                                    animate={{ strokeDashoffset: 80 }}
                                    transition={{ repeat: Infinity, duration: 3.5, ease: "linear", delay: 0.5 }}
                                />

                                {/* Circuit dots */}
                                <circle cx="40" cy="60" r="2" fill="white" fillOpacity="0.25" />
                                <circle cx="30" cy="100" r="2" fill="white" fillOpacity="0.25" />
                                <circle cx="50" cy="180" r="2" fill="white" fillOpacity="0.25" />
                                <circle cx="360" cy="50" r="2" fill="white" fillOpacity="0.25" />
                                <circle cx="370" cy="120" r="2" fill="white" fillOpacity="0.25" />
                                <circle cx="350" cy="190" r="2" fill="white" fillOpacity="0.25" />

                                {/* Pulsing center dots */}
                                <motion.circle
                                    cx="120" cy="130" r="3" fill="white"
                                    animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                />
                                <motion.circle
                                    cx="280" cy="170" r="3" fill="white"
                                    animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 1 }}
                                />
                            </svg>

                            {/* Glow effect */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-white/10 rounded-full blur-[80px]" />

                            {/* Central Velos Core Card */}
                            <div className="relative flex justify-center py-8">
                                <div className="w-40 h-40 bg-zinc-900/95 rounded-2xl border border-white/20 shadow-2xl flex flex-col items-center justify-center gap-2 backdrop-blur-xl">
                                    <div className="w-12 h-12 bg-gradient-to-br from-white to-zinc-400 rounded-xl flex items-center justify-center shadow-lg">
                                        <FiCpu className="w-6 h-6 text-black" />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-sm text-white">Velos Core</div>
                                        <div className="text-[10px] text-zinc-500">AI Autopilot Active</div>
                                    </div>
                                </div>
                            </div>

                            {/* Floating Feature Pills */}
                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                <motion.div
                                    className="bg-zinc-900/80 backdrop-blur-sm rounded-full border border-white/10 px-3 py-1.5 flex items-center gap-1.5"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                                >
                                    <FiImage className="w-3 h-3 text-white" />
                                    <span className="text-xs font-medium text-white">Image Gen</span>
                                </motion.div>
                                <motion.div
                                    className="bg-zinc-900/80 backdrop-blur-sm rounded-full border border-white/10 px-3 py-1.5 flex items-center gap-1.5"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.3 }}
                                >
                                    <FiPlay className="w-3 h-3 text-white" />
                                    <span className="text-xs font-medium text-white">Veo Video</span>
                                </motion.div>
                                <motion.div
                                    className="bg-zinc-900/80 backdrop-blur-sm rounded-full border border-white/10 px-3 py-1.5 flex items-center gap-1.5"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut", delay: 0.6 }}
                                >
                                    <FiInstagram className="w-3 h-3 text-white" />
                                    <span className="text-xs font-medium text-white">Auto-Post</span>
                                </motion.div>
                                <motion.div
                                    className="bg-zinc-900/80 backdrop-blur-sm rounded-full border border-white/10 px-3 py-1.5 flex items-center gap-1.5"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", delay: 0.9 }}
                                >
                                    <FiTrendingUp className="w-3 h-3 text-white" />
                                    <span className="text-xs font-medium text-white">Viral AI</span>
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Side - Circuit Board Visual (Desktop only) */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.3 }}
                        className="relative h-[550px] hidden lg:block"
                    >
                        {/* Full Circuit Board Pattern SVG with Animated Current */}
                        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 600 600" fill="none" preserveAspectRatio="xMidYMid slice">
                            <defs>
                                {/* Gradient for glowing current effect */}
                                <linearGradient id="currentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                                    <stop offset="50%" stopColor="white" stopOpacity="0.8" />
                                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                                </linearGradient>
                            </defs>

                            {/* LEFT SIDE CIRCUITS - Base traces */}
                            <path d="M -50 80 H 60 V 120 H 100" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 120 H 40 V 160 H 80 V 200" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 160 H 20 V 220 H 60" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 200 H 30 V 280 H 70 V 320 H 120" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 280 H 50 V 340 H 100 V 380" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 340 H 30 V 400 H 80" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 400 H 40 V 460 H 90 V 500" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M -50 460 H 60 V 520 H 110" stroke="white" strokeOpacity="0.12" strokeWidth="1" />

                            {/* RIGHT SIDE CIRCUITS - Base traces */}
                            <path d="M 650 100 H 540 V 140 H 500" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 140 H 560 V 180 H 520 V 220" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 180 H 580 V 240 H 540" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 220 H 570 V 300 H 530 V 340 H 480" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 300 H 550 V 360 H 500 V 400" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 360 H 570 V 420 H 520" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 420 H 560 V 480 H 510 V 520" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 650 480 H 540 V 540 H 490" stroke="white" strokeOpacity="0.12" strokeWidth="1" />

                            {/* TOP & BOTTOM CIRCUITS */}
                            <path d="M 180 -30 V 50 H 220 V 100" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 260 -30 V 40 H 300 V 80 H 340" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 340 -30 V 60 H 380 V 100" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 420 -30 V 50 H 460 V 90" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 160 630 V 540 H 200 V 500" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 240 630 V 560 H 280 V 520 H 320" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 360 630 V 550 H 400 V 510" stroke="white" strokeOpacity="0.12" strokeWidth="1" />
                            <path d="M 440 630 V 540 H 480 V 500" stroke="white" strokeOpacity="0.12" strokeWidth="1" />

                            {/* CENTER CONNECTIONS */}
                            <path d="M 120 320 H 180 V 280 H 220" stroke="white" strokeOpacity="0.2" strokeWidth="1" />
                            <path d="M 100 380 H 160 V 340 H 210" stroke="white" strokeOpacity="0.2" strokeWidth="1" />
                            <path d="M 480 280 H 420 V 300 H 380" stroke="white" strokeOpacity="0.2" strokeWidth="1" />
                            <path d="M 500 360 H 440 V 320 H 390" stroke="white" strokeOpacity="0.2" strokeWidth="1" />

                            {/* ANIMATED CURRENT FLOWS - Dashed lines with animation */}
                            {/* Left to center currents */}
                            <motion.path
                                d="M -50 200 H 30 V 280 H 70 V 320 H 120"
                                stroke="white"
                                strokeOpacity="0.4"
                                strokeWidth="1.5"
                                strokeDasharray="8 12"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: -100 }}
                                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                            />
                            <motion.path
                                d="M -50 280 H 50 V 340 H 100 V 380"
                                stroke="white"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                                strokeDasharray="6 10"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: -80 }}
                                transition={{ repeat: Infinity, duration: 4, ease: "linear", delay: 0.5 }}
                            />

                            {/* Right to center currents */}
                            <motion.path
                                d="M 650 220 H 570 V 300 H 530 V 340 H 480"
                                stroke="white"
                                strokeOpacity="0.4"
                                strokeWidth="1.5"
                                strokeDasharray="8 12"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: 100 }}
                                transition={{ repeat: Infinity, duration: 3.5, ease: "linear", delay: 0.3 }}
                            />
                            <motion.path
                                d="M 650 300 H 550 V 360 H 500 V 400"
                                stroke="white"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                                strokeDasharray="6 10"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: 80 }}
                                transition={{ repeat: Infinity, duration: 4.5, ease: "linear", delay: 1 }}
                            />

                            {/* Top to center currents */}
                            <motion.path
                                d="M 260 -30 V 40 H 300 V 80 H 340"
                                stroke="white"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                                strokeDasharray="6 10"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: -60 }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: "linear", delay: 0.7 }}
                            />

                            {/* Bottom to center currents */}
                            <motion.path
                                d="M 240 630 V 560 H 280 V 520 H 320"
                                stroke="white"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                                strokeDasharray="6 10"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: 60 }}
                                transition={{ repeat: Infinity, duration: 3, ease: "linear", delay: 1.2 }}
                            />

                            {/* CIRCUIT DOTS */}
                            <circle cx="60" cy="80" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="60" cy="120" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="40" cy="160" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="30" cy="280" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="50" cy="340" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="30" cy="400" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="90" cy="500" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="540" cy="100" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="540" cy="140" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="560" cy="180" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="530" cy="340" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="550" cy="360" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="510" cy="520" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="490" cy="540" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="180" cy="50" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="300" cy="80" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="380" cy="100" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="460" cy="90" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="200" cy="500" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="320" cy="520" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="400" cy="510" r="2.5" fill="white" fillOpacity="0.25" />
                            <circle cx="480" cy="500" r="2.5" fill="white" fillOpacity="0.25" />

                            {/* Pulsing center dots */}
                            <motion.circle
                                cx="180" cy="280" r="3" fill="white"
                                animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                            />
                            <motion.circle
                                cx="160" cy="340" r="3" fill="white"
                                animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.5 }}
                            />
                            <motion.circle
                                cx="420" cy="300" r="3" fill="white"
                                animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 1 }}
                            />
                            <motion.circle
                                cx="440" cy="320" r="3" fill="white"
                                animate={{ fillOpacity: [0.2, 0.6, 0.2] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 1.5 }}
                            />
                        </svg>

                        {/* Glow Effect Behind Central Card */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/15 rounded-full blur-[120px]" />

                        {/* Central Velos Core Card */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-zinc-900/95 rounded-3xl border border-white/20 shadow-2xl z-20 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
                            <div className="w-14 h-14 bg-gradient-to-br from-white to-zinc-400 rounded-xl flex items-center justify-center shadow-lg">
                                <FiCpu className="w-7 h-7 text-black" />
                            </div>
                            <div className="text-center">
                                <div className="font-bold text-base text-white">Velos Core</div>
                                <div className="text-xs text-zinc-500">AI Autopilot Active</div>
                            </div>
                        </div>

                        {/* Floating Feature Cards with Animation */}
                        {/* Image Gen - Left middle */}
                        <motion.div
                            className="absolute top-[38%] left-[0%] z-30 bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-white/15 px-4 py-2.5 flex items-center gap-2.5 shadow-xl"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        >
                            <div className="w-7 h-7 bg-zinc-800 rounded-lg flex items-center justify-center border border-white/10">
                                <FiImage className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-medium text-white">Image Gen</span>
                        </motion.div>

                        {/* Veo Video - Right upper */}
                        <motion.div
                            className="absolute top-[32%] right-[-5%] z-30 bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-white/15 px-4 py-2.5 flex items-center gap-2.5 shadow-xl"
                            animate={{ y: [0, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", delay: 0.5 }}
                        >
                            <span className="text-zinc-600 mr-1">&gt;</span>
                            <span className="text-sm font-medium text-white">Veo Video</span>
                        </motion.div>

                        {/* Auto-Post - Left lower */}
                        <motion.div
                            className="absolute top-[58%] left-[0%] z-30 bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-white/15 px-4 py-2.5 flex items-center gap-2.5 shadow-xl"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 1 }}
                        >
                            <div className="w-7 h-7 bg-zinc-800 rounded-lg flex items-center justify-center border border-white/10">
                                <FiInstagram className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-medium text-white">Auto-Post</span>
                        </motion.div>

                        {/* Viral AI - Right lower */}
                        <motion.div
                            className="absolute top-[54%] right-[-5%] z-30 bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-white/15 px-4 py-2.5 flex items-center gap-2.5 shadow-xl"
                            animate={{ y: [0, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", delay: 1.5 }}
                        >
                            <span className="text-sm font-medium text-white">Viral AI</span>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* Marquee - Infinite Feature List */}
            <div className="py-8 bg-white/5 border-y border-white/5 overflow-hidden">
                <div className="flex gap-16 animate-scroll w-max text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {["Text-to-Video", "Veo 3.1", "Instagram Auto-Pilot", "Viral Prediction", "Competitor Analysis", "Smart Scheduling", "4K Upscaling", "Brand Learning", "Deep Research"].map((tag, i) => (
                        <span key={i} className="flex items-center gap-2">
                            <FiHexagon className="w-3 h-3 text-white" /> {tag}
                        </span>
                    ))}
                    {["Text-to-Video", "Veo 3.1", "Instagram Auto-Pilot", "Viral Prediction", "Competitor Analysis", "Smart Scheduling", "4K Upscaling", "Brand Learning", "Deep Research"].map((tag, i) => (
                        <span key={i} className="flex items-center gap-2">
                            <FiHexagon className="w-3 h-3 text-white" /> {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* SECTIONS */}

            {/* 1. CREATION SUITE */}
            <section id="creation" className="py-32 px-6 relative z-10">
                <div className="max-w-7xl mx-auto mb-20">
                    <h2 className="text-4xl md:text-6xl font-bold mb-6">The Creation Suite.</h2>
                    <p className="text-xl text-zinc-400 max-w-2xl">Unbound creative power. Generate cinema-grade assets from simple text.</p>
                </div>

                <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8">
                    {/* Image Gen Card */}
                    <div className="group relative h-[500px] bg-[#0a0a0c] rounded-[2rem] border border-white/10 overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center opacity-40 transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                        <div className="absolute inset-0 p-10 flex flex-col justify-end">
                            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center mb-6 border border-white/20">
                                <FiImage className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-3xl font-bold mb-3">Velos Image XL</h3>
                            <p className="text-zinc-400 mb-6">
                                Photorealistic generative engine. Supports reference images, in-painting, and style transfer.
                            </p>
                            <div className="flex gap-3 text-xs font-mono text-zinc-500 uppercase">
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">Ref Images</span>
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">Remix</span>
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">4K Upscale</span>
                            </div>
                        </div>
                    </div>

                    {/* Video Gen Card */}
                    <div className="group relative h-[500px] bg-[#0a0a0c] rounded-[2rem] border border-white/10 overflow-hidden">
                        {/* Video Background */}
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500"
                        >
                            <source src="https://instapixelapi.s3.us-east-2.amazonaws.com/videos/12daa221-fa97-4626-8ba2-7fb077296aa6.mp4" type="video/mp4" />
                        </video>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

                        <div className="absolute inset-0 p-10 flex flex-col justify-end">
                            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center mb-6 border border-white/20">
                                <FiPlay className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-3xl font-bold mb-3">Veo 3.1 Cinematic</h3>
                            <p className="text-zinc-400 mb-6">
                                The world's most advanced video model. Generate 60s clips with consistent characters and physics.
                            </p>
                            <div className="flex gap-3 text-xs font-mono text-zinc-500 uppercase">
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">Start Frames</span>
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">Extensions</span>
                                <span className="bg-white/5 px-2 py-1 rounded inline-block border border-white/5">Director Mode</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>


            {/* 2. GROWTH ENGINE - Bento */}
            <section id="growth" className="py-32 px-6 bg-zinc-900/20 border-y border-white/5 relative z-10">
                <div className="max-w-7xl mx-auto mb-20 flex md:flex-row flex-col items-end justify-between gap-8">
                    <div>
                        <h2 className="text-4xl md:text-6xl font-bold mb-6">Growth Autopilot.</h2>
                        <p className="text-xl text-zinc-400 max-w-xl">Don't just create. Dominate the feed with AI-driven social intelligence.</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                </div>

                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-6 h-auto md:h-[600px]">

                    {/* Instagram Integration */}
                    <div className="md:col-span-2 md:row-span-2 bg-black border border-white/10 rounded-3xl p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                            <FiInstagram className="w-32 h-32 -rotate-12" />
                        </div>
                        <div className="relative z-10 h-full flex flex-col">
                            <h3 className="text-2xl font-bold mb-2">Instagram Deep Integration</h3>
                            <p className="text-zinc-500 mb-4 max-w-sm">Direct OAuth connection. Auto-publish Reels, Carousels, and Stories without touching your phone.</p>

                            {/* Feature Pills */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                {['Auto-Publish', 'Reels', 'Carousels', 'Stories', 'First Comment'].map((feature, i) => (
                                    <span key={i} className="px-3 py-1 text-xs bg-white/5 border border-white/10 rounded-full text-zinc-400">
                                        {feature}
                                    </span>
                                ))}
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-white">24</div>
                                    <div className="text-xs text-zinc-500">Posts Queued</div>
                                </div>
                                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-green-400">+127%</div>
                                    <div className="text-xs text-zinc-500">Engagement</div>
                                </div>
                                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-white">12K</div>
                                    <div className="text-xs text-zinc-500">Followers</div>
                                </div>
                            </div>

                            {/* Post Preview */}
                            <div className="mt-auto bg-zinc-900/50 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 to-purple-500 p-0.5">
                                    <div className="w-full h-full bg-black rounded-full p-0.5">
                                        <img src="https://i.pravatar.cc/100?img=5" className="w-full h-full rounded-full" alt="Profile" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <div className="h-2 bg-zinc-700 rounded w-24 mb-2" />
                                    <div className="h-2 bg-zinc-800 rounded w-16" />
                                </div>
                                <div className="bg-blue-500 text-white text-xs px-3 py-1 rounded-full">Scheduled</div>
                            </div>
                        </div>
                    </div>

                    {/* Viral Prediction */}
                    <div className="bg-black border border-white/10 rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/5 transition-colors">
                        <FiTrendingUp className="w-8 h-8 text-green-400 mb-4" />
                        <div>
                            <h3 className="text-xl font-bold">Viral Hunter</h3>
                            <p className="text-zinc-500 text-sm mt-2">AI scans trending content in your niche to generate high-probability viral ideas.</p>
                        </div>
                    </div>

                    {/* Scheduler */}
                    <div className="bg-black border border-white/10 rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/5 transition-colors">
                        <FiCalendar className="w-8 h-8 text-blue-400 mb-4" />
                        <div>
                            <h3 className="text-xl font-bold">Smart Schedule</h3>
                            <p className="text-zinc-500 text-sm mt-2">Buffer-style calendar view. AI suggests the best posting times for max engagement.</p>
                        </div>
                    </div>

                </div>
            </section>

            {/* 3. INTELLIGENCE AGENT */}
            <section id="agent" className="py-32 px-6 relative z-10">
                <div className="max-w-7xl mx-auto bg-gradient-to-br from-zinc-900 via-zinc-900 to-black border border-white/10 rounded-[3rem] p-8 md:p-16 relative overflow-hidden">
                    {/* Background Effects */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                    {/* Grid Layout */}
                    <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                        {/* Left - Content */}
                        <div className="text-left space-y-6">
                            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                                <div className="w-10 h-10 bg-gradient-to-br from-white to-zinc-400 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiCpu className="w-5 h-5 text-black" />
                                </div>
                                <span className="text-sm font-medium text-zinc-300">Velos Agent</span>
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            </div>

                            <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                                Meet Your<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-300 to-zinc-500">AI Co-Pilot.</span>
                            </h2>

                            <p className="text-lg text-zinc-500 max-w-md">
                                Talk to Velos like a creative partner. It researches, analyzes, and creates - all from natural conversation.
                            </p>

                            {/* Capabilities */}
                            <div className="flex flex-wrap gap-2 pt-4">
                                {['Competitor Analysis', 'Script Writing', 'Trend Research', 'Content Ideas'].map((cap, i) => (
                                    <span key={i} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-zinc-400 flex items-center gap-2">
                                        <FiCheck className="w-3 h-3 text-green-400" /> {cap}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Right - Terminal */}
                        <div className="relative">
                            {/* Glow behind terminal */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-white/5 to-transparent rounded-3xl blur-2xl" />

                            <div className="relative bg-black border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                                {/* Terminal Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50">
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                    </div>
                                    <span className="text-[10px] text-zinc-500 font-mono">velos-agent</span>
                                    <div className="w-12" />
                                </div>

                                {/* Terminal Content */}
                                <div className="p-6 font-mono text-sm space-y-4">
                                    {/* User Input */}
                                    <div className="flex gap-3 items-start">
                                        <span className="text-blue-400 font-bold">you:</span>
                                        <span className="text-zinc-300">"Look at @tech_daily, analyze their top 5 posts, generate 3 viral reel ideas"</span>
                                    </div>

                                    {/* Agent Response */}
                                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 space-y-3">
                                        <div className="flex gap-2 items-center text-green-400">
                                            <FiCheck className="w-4 h-4" />
                                            <span>Analyzing competitor data...</span>
                                        </div>
                                        <div className="flex gap-2 items-center text-green-400">
                                            <FiCheck className="w-4 h-4" />
                                            <span>Identified 3 viral hooks</span>
                                        </div>
                                        <div className="flex gap-2 items-center text-white">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span className="animate-pulse">Generating scripts...</span>
                                        </div>
                                    </div>

                                    {/* Output Preview */}
                                    <div className="pt-2 border-t border-white/5">
                                        <div className="text-zinc-500 text-xs mb-2">Output Preview:</div>
                                        <div className="flex gap-2">
                                            {['Reel 1', 'Reel 2', 'Reel 3'].map((r, i) => (
                                                <div key={i} className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                                                    <FiPlay className="w-4 h-4 mx-auto mb-1 text-zinc-400" />
                                                    <span className="text-[10px] text-zinc-500">{r}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>



            {/* Premium Footer */}
            <footer className="relative border-t border-white/5 bg-black overflow-hidden">
                {/* Gradient glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                {/* Main Footer Content */}
                <div className="max-w-7xl mx-auto px-6 pt-20 pb-12">
                    {/* Top Section - CTA */}
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to create?</h2>
                        <p className="text-zinc-500 mb-8 max-w-md mx-auto">Join 10,000+ creators using Velos AI to generate stunning content.</p>
                        <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:shadow-[0_0_40px_-5px_rgba(255,255,255,0.5)] transition-all duration-300 hover:scale-105">
                            Start Free <FiArrowRight className="w-5 h-5" />
                        </Link>
                    </div>

                    {/* Links Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-16">
                        {/* Brand */}
                        <div className="col-span-2">
                            <div className="flex items-center gap-3 mb-6">
                                <VelosLogo className="w-8 h-8" />
                                <span className="font-bold text-xl">Velos AI</span>
                            </div>
                            <p className="text-zinc-500 text-sm max-w-xs mb-6 leading-relaxed">
                                The AI operating system for modern creators. Transform ideas into viral content at the speed of thought.
                            </p>
                            {/* Social Icons */}
                            <div className="flex gap-4">
                                {[
                                    { label: 'X', url: 'https://twitter.com' },
                                    { label: 'In', url: 'https://linkedin.com' },
                                    { label: 'YT', url: 'https://youtube.com' },
                                    { label: 'GH', url: 'https://github.com' }
                                ].map((social, i) => (
                                    <a key={i} href={social.url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all hover:scale-110">
                                        {social.label}
                                    </a>
                                ))}
                            </div>
                        </div>

                        {/* Product */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Product</h4>
                            <ul className="space-y-4 text-sm">
                                <li><button onClick={() => document.getElementById('creation')?.scrollIntoView({ behavior: 'smooth' })} className="text-zinc-500 hover:text-white transition-colors">Image Generation</button></li>
                                <li><button onClick={() => document.getElementById('creation')?.scrollIntoView({ behavior: 'smooth' })} className="text-zinc-500 hover:text-white transition-colors">Video Generation</button></li>
                                <li><button onClick={() => document.getElementById('growth')?.scrollIntoView({ behavior: 'smooth' })} className="text-zinc-500 hover:text-white transition-colors">Instagram Autopilot</button></li>
                                <li><button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="text-zinc-500 hover:text-white transition-colors">Pricing</button></li>
                            </ul>
                        </div>

                        {/* Resources */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Resources</h4>
                            <ul className="space-y-4 text-sm">
                                <li><span className="text-zinc-500 cursor-default">Documentation</span></li>
                                <li><span className="text-zinc-500 cursor-default">API Reference</span></li>
                                <li><span className="text-zinc-500 cursor-default">Tutorials</span></li>
                                <li><span className="text-zinc-500 cursor-default">Blog</span></li>
                            </ul>
                        </div>

                        {/* Company */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Company</h4>
                            <ul className="space-y-4 text-sm">
                                <li><span className="text-zinc-500 cursor-default">About Us</span></li>
                                <li><span className="text-zinc-500 cursor-default">Careers <span className="ml-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full">Hiring</span></span></li>
                                <li><span className="text-zinc-500 cursor-default">Contact</span></li>
                                <li><span className="text-zinc-500 cursor-default">Press Kit</span></li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom Bar */}
                    <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-6 text-xs text-zinc-600">
                            <p>© 2024 Velos AI. All rights reserved.</p>
                            <span className="hidden md:block">•</span>
                            <span className="hidden md:flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                All systems operational
                            </span>
                        </div>
                        <div className="flex gap-8 text-xs text-zinc-600">
                            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
                            <Link to="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link>
                            <span className="cursor-default">Cookie Policy</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
