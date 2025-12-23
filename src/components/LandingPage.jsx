import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiArrowRight, FiPlay, FiImage, FiZap, FiLayout, FiTrendingUp, FiInstagram, FiCheck } = FiIcons;

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);
    const { scrollY } = useScroll();
    const headerOpacity = useTransform(scrollY, [0, 100], [0, 1]);
    const headerY = useTransform(scrollY, [0, 100], [-20, 0]);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#09090b] text-white selection:bg-white/20 font-sans overflow-x-hidden">

            {/* Navigation */}
            <motion.nav
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5 py-4' : 'bg-transparent py-6'
                    }`}
            >
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-tr from-white to-zinc-500 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-black text-xl">Q</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight">Questera</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#showcase" className="hover:text-white transition-colors">Showcase</a>
                        <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link
                            to="/login"
                            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors hidden sm:block"
                        >
                            Sign In
                        </Link>
                        <Link
                            to="/login"
                            className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-bold hover:bg-zinc-200 transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-white/5"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </motion.nav>

            {/* Hero Section */}
            <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-6 overflow-hidden">

                {/* Abstract Background Elements */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px]" />
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/[0.05] rounded-full blur-[100px]" />
                    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/[0.05] rounded-full blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto text-center space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm"
                    >
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-medium tracking-wide uppercase text-zinc-300">New: Video Generation 3.0</span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.1]"
                    >
                        Create the <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-zinc-500">
                            Unimaginable
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed"
                    >
                        The all-in-one AI platform for content creators. Generate stunning images, cinematic videos, and manage your social presence with next-gen intelligence.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8"
                    >
                        <Link
                            to="/login"
                            className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-zinc-200 transition-all transform hover:scale-105 shadow-xl shadow-white/10 flex items-center justify-center gap-2"
                        >
                            Start Creating Free
                            <SafeIcon icon={FiArrowRight} className="w-5 h-5" />
                        </Link>
                        <button className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium text-lg backdrop-blur-sm transition-all flex items-center justify-center gap-2">
                            <SafeIcon icon={FiPlay} className="w-5 h-5 fill-current" />
                            Watch Demo
                        </button>
                    </motion.div>
                </div>

                {/* Hero Visual */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 40 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="relative mt-20 w-full max-w-6xl mx-auto"
                >
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-500/10 bg-[#18181b] aspect-[16/9] md:aspect-[21/9]">
                        {/* Abstract UI Representation */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#18181b] to-[#09090b]">
                            <div className="absolute top-0 left-0 right-0 h-12 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                                <div className="flex gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500/20" />
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                                    <div className="w-3 h-3 rounded-full bg-green-500/20" />
                                </div>
                                <div className="flex-1 text-center text-xs font-mono text-zinc-600">questera_studio.app</div>
                            </div>
                            <div className="p-8 md:p-12 flex h-full items-center justify-center">
                                <div className="text-center space-y-6">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-mono mb-4 border border-blue-500/20">
                                        Processing: "Futuristic city with neon rain..."
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 opacity-50 blur-sm scale-95 origin-center">
                                        <div className="h-32 bg-zinc-800 rounded-lg animate-pulse" />
                                        <div className="h-32 bg-zinc-800 rounded-lg animate-pulse delay-75" />
                                        <div className="h-32 bg-zinc-800 rounded-lg animate-pulse delay-150" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent" />
                    </div>
                </motion.div>
            </section>

            {/* Features Grid */}
            <section id="features" className="py-24 px-6 relative bg-[#0c0c0e]">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold">Power beyond measure</h2>
                        <p className="text-zinc-400 max-w-2xl mx-auto">Everything you need to dominate the digital landscape, all in one dashboard.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FeatureCard
                            icon={FiImage}
                            title="Velos XL 1.0"
                            description="Generate photorealistic images with our proprietary state-of-the-art model. Unmatched detail and adherence to prompts."
                            delay={0}
                        />
                        <FeatureCard
                            icon={FiLayout}
                            title="Veo 3.1 Video"
                            description="Turn text into cinematic video sequences. Control camera movement, lighting, and style with precision."
                            delay={0.1}
                        />
                        <FeatureCard
                            icon={FiInstagram}
                            title="Social Suite"
                            description="Direct integration with Instagram. Schedule posts, analyze performance, and automate your growth."
                            delay={0.2}
                        />
                        <FeatureCard
                            icon={FiZap}
                            title="Smart Templates"
                            description="Jumpstart your creativity with thousands of community-curated templates for any niche."
                            delay={0.3}
                        />
                        <FeatureCard
                            icon={FiTrendingUp}
                            title="Deep Analytics"
                            description="Track engagement, reach, and conversion. Let AI suggest the best times to post."
                            delay={0.4}
                        />
                        <FeatureCard
                            icon={FiCheck}
                            title="Safe & Secure"
                            description="Enterprise-grade security for your assets. Your creativity belongs to you, always."
                            delay={0.5}
                        />
                    </div>
                </div>
            </section>

            {/* Showcase Section */}
            <section id="showcase" className="py-24 bg-[#09090b] overflow-hidden">
                <div className="max-w-7xl mx-auto px-6 mb-12">
                    <h2 className="text-3xl md:text-5xl font-bold text-center">Made with Questera</h2>
                </div>

                <div className="flex gap-6 animate-scroll overflow-x-auto pb-8 custom-scrollbar">
                    {/* Placeholder Showcase Items */}
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="min-w-[300px] h-[400px] rounded-3xl overflow-hidden relative group border border-white/5 bg-[#18181b]">
                            <div className={`w-full h-full bg-gradient-to-br ${i % 2 === 0 ? 'from-purple-500/20 to-blue-500/20' : 'from-green-500/20 to-yellow-500/20'} group-hover:scale-110 transition-transform duration-700`} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
                                <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                    <p className="text-white font-medium">Artistic Creation #{i + 1}</p>
                                    <p className="text-zinc-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity delay-75">Generated with Velos XL</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Call to Action */}
            <section className="py-24 px-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c0e] to-[#09090b]" />

                <div className="relative z-10 max-w-4xl mx-auto text-center bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-12 md:p-20 overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent opacity-50" />

                    <div className="relative z-10 space-y-8">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Ready to shape the future?</h2>
                        <p className="text-xl text-zinc-400 max-w-xl mx-auto">
                            Join thousands of creators using Questera to push the boundaries of what's possible.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/login"
                                className="w-full sm:w-auto px-10 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-zinc-200 transition-all shadow-xl shadow-white/10 hover:scale-105"
                            >
                                Get Started Now
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-white/5 bg-[#09090b]">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-zinc-800 rounded-md flex items-center justify-center">
                            <span className="font-bold text-white text-xs">Q</span>
                        </div>
                        <span className="text-sm font-semibold text-zinc-400">Questera Inc.</span>
                    </div>

                    <div className="flex gap-8 text-sm text-zinc-500">
                        <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                        <a href="#" className="hover:text-white transition-colors">Twitter</a>
                        <a href="#" className="hover:text-white transition-colors">Instagram</a>
                    </div>

                    <div className="text-xs text-zinc-600">
                        © 2024 Questera. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard = ({ icon, title, description, delay }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay }}
            className="group p-8 rounded-3xl bg-[#18181b] border border-white/5 hover:border-white/10 hover:bg-[#202024] transition-all duration-300"
        >
            <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-white/5">
                <SafeIcon icon={icon} className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-white">{title}</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
                {description}
            </p>
        </motion.div>
    );
};

export default LandingPage;
