import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiImage, FiVideo, FiInstagram, FiCalendar, FiCpu, FiTrendingUp, FiZap, FiMessageSquare, FiPlay, FiHexagon, FiMenu, FiX } from 'react-icons/fi';
import Lenis from 'lenis';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../common/SafeIcon';

// Velos Logo Component
const VelosLogo = ({ className = "w-7 h-7" }) => (
    <img src="/velos-logo.svg" alt="Velos" className={className} />
);

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);
    const [activeFeature, setActiveFeature] = useState(0);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const features = ['AI Image Generation', 'Video Creation', 'Instagram Autopilot', 'Smart Scheduling', 'Viral Analytics'];

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

        // Feature rotation interval
        const featureInterval = setInterval(() => {
            setActiveFeature((prev) => (prev + 1) % features.length);
        }, 3000);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            lenis.destroy();
            clearInterval(featureInterval);
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
                        <a href="#creation" className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Creation</a>
                        <a href="#growth" className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Growth</a>
                        <a href="#pricing" className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Pricing</a>
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
                                    { label: 'Creation', href: '#creation', icon: FiImage },
                                    { label: 'Growth', href: '#growth', icon: FiTrendingUp },
                                    { label: 'Pricing', href: '#pricing', icon: FiZap },
                                ].map((item, i) => (
                                    <a
                                        key={i}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                            <item.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <span className="text-white font-medium">{item.label}</span>
                                        <FiArrowRight className="w-4 h-4 text-zinc-500 ml-auto" />
                                    </a>
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
            <section className="relative min-h-[110vh] flex flex-col justify-center px-6 pt-32 pb-20 overflow-hidden z-10">
                <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
                        className="space-y-10"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-white/10 to-white/5 border border-white/10 backdrop-blur-md shadow-lg"
                        >
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.2em] font-medium text-zinc-300">System v2.0 Operational</span>
                        </motion.div>

                        <div className="space-y-2">
                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                className="text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9] text-white"
                            >
                                Create.
                            </motion.h1>
                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.5 }}
                                className="text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9]"
                            >
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-600 animate-gradient">Infinite.</span>
                            </motion.h1>
                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.7 }}
                                className="text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9] text-white"
                            >
                                Reality.
                            </motion.h1>
                        </div>

                        <motion.p
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.9 }}
                            className="max-w-xl text-lg text-zinc-400 leading-relaxed font-light border-l-2 border-white/30 pl-6"
                        >
                            The complete AI operating system for creators.
                            From <span className="text-white font-medium">Concept</span> to <span className="text-white font-medium">Viral</span> at the speed of thought.
                        </motion.p>

                        {/* Rotating Features */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 1.1 }}
                            className="flex items-center gap-3"
                        >
                            <span className="text-sm text-zinc-500">Powered by</span>
                            <div className="h-8 overflow-hidden relative min-w-[200px]">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeFeature}
                                        initial={{ y: 30, opacity: 0, filter: "blur(4px)" }}
                                        animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                                        exit={{ y: -30, opacity: 0, filter: "blur(4px)" }}
                                        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                                        className="text-sm font-medium text-white bg-gradient-to-r from-white/15 to-white/5 px-4 py-1.5 rounded-full border border-white/20 backdrop-blur-sm absolute shadow-lg"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_2px_rgba(74,222,128,0.6)]" />
                                            {features[activeFeature]}
                                        </span>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 1.3 }}
                            className="flex flex-wrap items-center gap-4"
                        >
                            <Link to="/login" className="group px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:shadow-[0_0_40px_-5px_rgba(255,255,255,0.5)] transition-all duration-300 flex items-center gap-2 hover:scale-105">
                                Launch Studio
                                <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Link>

                            <div className="flex items-center -space-x-3 pl-4">
                                {[1, 2, 3, 4].map(i => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.3, delay: 1.5 + (i * 0.1) }}
                                        className="w-10 h-10 rounded-full border-2 border-black bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-bold overflow-hidden hover:scale-110 hover:z-10 transition-transform"
                                    >
                                        <img src={`https://i.pravatar.cc/100?img=${i + 10}`} className="w-full h-full object-cover" alt="User" />
                                    </motion.div>
                                ))}
                            </div>
                            <span className="text-sm text-zinc-500">Used by 10k+ creators</span>
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="relative h-[600px] hidden lg:block perspective-2000"
                    >
                        {/* Abstract UI composition */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
                            {/* Central Hub */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-black rounded-3xl border border-white/10 shadow-2xl z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-xl">
                                <div className="w-20 h-20 bg-gradient-to-br from-white to-zinc-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <FiCpu className="w-10 h-10 text-black" />
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-lg">Velos Core</div>
                                    <div className="text-xs text-zinc-500 font-mono">AI Autopilot Active</div>
                                </div>
                            </div>

                            {/* Orbiting Satellite Cards */}
                            <FloatingCard icon={FiImage} title="Image Gen" delay={0} x={-180} y={-100} />
                            <FloatingCard icon={FiPlay} title="Veo Video" delay={1} x={180} y={-80} />
                            <FloatingCard icon={FiInstagram} title="Auto-Post" delay={2} x={-160} y={120} />
                            <FloatingCard icon={FiTrendingUp} title="Viral AI" delay={3} x={160} y={100} />

                            {/* Connecting Lines */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                                <motion.path d="M 300 300 L 120 200" stroke="white" strokeWidth="1" strokeDasharray="5,5" animate={{ strokeDashoffset: [0, 100] }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} />
                                <motion.path d="M 300 300 L 480 220" stroke="white" strokeWidth="1" strokeDasharray="5,5" animate={{ strokeDashoffset: [0, 100] }} transition={{ repeat: Infinity, duration: 25, ease: "linear" }} />
                                <motion.path d="M 300 300 L 140 420" stroke="white" strokeWidth="1" strokeDasharray="5,5" animate={{ strokeDashoffset: [0, 100] }} transition={{ repeat: Infinity, duration: 22, ease: "linear" }} />
                                <motion.path d="M 300 300 L 460 400" stroke="white" strokeWidth="1" strokeDasharray="5,5" animate={{ strokeDashoffset: [0, 100] }} transition={{ repeat: Infinity, duration: 18, ease: "linear" }} />
                            </svg>
                        </div>
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
                                {['X', 'In', 'YT', 'GH'].map((social, i) => (
                                    <a key={i} href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all hover:scale-110">
                                        {social}
                                    </a>
                                ))}
                            </div>
                        </div>

                        {/* Product */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Product</h4>
                            <ul className="space-y-4 text-sm">
                                <li><a href="#creation" className="text-zinc-500 hover:text-white transition-colors">Image Generation</a></li>
                                <li><a href="#creation" className="text-zinc-500 hover:text-white transition-colors">Video Generation</a></li>
                                <li><a href="#growth" className="text-zinc-500 hover:text-white transition-colors">Instagram Autopilot</a></li>
                                <li><a href="#pricing" className="text-zinc-500 hover:text-white transition-colors">Pricing</a></li>
                            </ul>
                        </div>

                        {/* Resources */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Resources</h4>
                            <ul className="space-y-4 text-sm">
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Documentation</a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">API Reference</a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Tutorials</a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Blog</a></li>
                            </ul>
                        </div>

                        {/* Company */}
                        <div>
                            <h4 className="font-semibold text-white mb-6 text-sm uppercase tracking-wider">Company</h4>
                            <ul className="space-y-4 text-sm">
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">About Us</a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Careers <span className="ml-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full">Hiring</span></a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Contact</a></li>
                                <li><a href="#" className="text-zinc-500 hover:text-white transition-colors">Press Kit</a></li>
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
                            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                            <a href="#" className="hover:text-white transition-colors">Cookie Policy</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Sub-components
const FloatingCard = ({ icon, title, delay, x, y }) => (
    <motion.div
        animate={{
            y: [y, y - 10, y],
            x: [x, x + 5, x]
        }}
        transition={{ repeat: Infinity, duration: 4, delay, ease: "easeInOut" }}
        className="absolute top-1/2 left-1/2 w-40 p-3 bg-zinc-900/80 backdrop-blur rounded-xl border border-white/5 flex items-center gap-3 shadow-xl"
        style={{ marginLeft: -80, marginTop: -30 }} // Center anchor roughly
    >
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center border border-white/10">
            <SafeIcon icon={icon} className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-bold">{title}</span>
    </motion.div>
);



export default LandingPage;
