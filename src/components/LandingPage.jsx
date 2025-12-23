import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiImage, FiVideo, FiInstagram, FiCalendar, FiCpu, FiTrendingUp } from 'react-icons/fi';

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20">

            {/* Subtle Grid Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            {/* Navigation */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-black/90 backdrop-blur-sm border-b border-white/5' : 'bg-transparent'}`}>
                <div className="max-w-6xl mx-auto px-6 h-16 flex justify-between items-center">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
                            <span className="font-bold text-black text-lg">V</span>
                        </div>
                        <span className="font-semibold text-white">Velos</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-4 py-2">Log in</Link>
                        <Link to="/login" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-8">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-xs text-zinc-400">Now with Veo 3.1 Video Generation</span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                        AI for
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500"> creators</span>
                    </h1>

                    <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Generate images, create videos, schedule posts, and grow on Instagram.
                        All powered by AI that learns your brand.
                    </p>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                        <Link to="/login" className="w-full sm:w-auto px-8 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                            Start Creating <FiArrowRight className="w-4 h-4" />
                        </Link>
                        <a href="#how-it-works" className="w-full sm:w-auto px-8 py-3 border border-white/10 rounded-lg text-zinc-300 hover:bg-white/5 transition-colors">
                            See how it works
                        </a>
                    </div>

                    {/* Terminal Preview */}
                    <div className="max-w-2xl mx-auto">
                        <div className="rounded-xl border border-white/10 bg-zinc-950 overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                                <span className="ml-2 text-xs text-zinc-500 font-mono">velos-ai</span>
                            </div>
                            <div className="p-6 font-mono text-sm text-left">
                                <div className="text-zinc-500 mb-2"># Generate and schedule a post</div>
                                <div className="text-emerald-400 mb-4">→ "Create a sunset beach photo, schedule for 7pm"</div>
                                <div className="text-zinc-400 space-y-1">
                                    <div><span className="text-zinc-600">→</span> Generating image...</div>
                                    <div><span className="text-zinc-600">→</span> Optimizing for Instagram...</div>
                                    <div><span className="text-white">✓</span> Scheduled for 7:00 PM today</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Bar */}
            <section className="py-12 border-y border-white/5">
                <div className="max-w-6xl mx-auto px-6">
                    <p className="text-center text-xs text-zinc-600 uppercase tracking-widest mb-8">Powered by</p>
                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-zinc-500">
                        <span className="text-sm font-medium">Google Veo 3.1</span>
                        <span className="text-sm font-medium">Gemini AI</span>
                        <span className="text-sm font-medium">Instagram Graph API</span>
                        <span className="text-sm font-medium">GPT-4</span>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to create and grow</h2>
                        <p className="text-zinc-400 max-w-xl mx-auto">One platform for AI generation, scheduling, and analytics.</p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <FeatureCard
                            icon={<FiImage className="w-5 h-5" />}
                            title="AI Image Generation"
                            description="Generate stunning images from text. Use reference photos for personalized results."
                        />
                        <FeatureCard
                            icon={<FiVideo className="w-5 h-5" />}
                            title="Video Generation"
                            description="Create videos with Veo 3.1. Support for start frames, end frames, and extensions."
                        />
                        <FeatureCard
                            icon={<FiInstagram className="w-5 h-5" />}
                            title="Instagram Integration"
                            description="Direct connection to Instagram. Publish posts, carousels, reels, and stories."
                        />
                        <FeatureCard
                            icon={<FiCalendar className="w-5 h-5" />}
                            title="Smart Scheduling"
                            description="Buffer-style calendar. Schedule posts for optimal engagement times."
                        />
                        <FeatureCard
                            icon={<FiCpu className="w-5 h-5" />}
                            title="AI Autopilot"
                            description="Set it and forget it. AI learns your brand and creates content automatically."
                        />
                        <FeatureCard
                            icon={<FiTrendingUp className="w-5 h-5" />}
                            title="Viral Content"
                            description="Analyze competitors, find trending content, and generate viral ideas."
                        />
                    </div>
                </div>
            </section>

            {/* How it Works */}
            <section id="how-it-works" className="py-24 px-6 border-y border-white/5">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
                        <p className="text-zinc-400">Three simple steps to transform your content workflow.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <StepCard
                            number="01"
                            title="Describe your vision"
                            description="Tell Velos what you want to create in natural language. Add reference images for personalization."
                        />
                        <StepCard
                            number="02"
                            title="AI generates content"
                            description="Our AI creates images or videos based on your description. Edit and refine as needed."
                        />
                        <StepCard
                            number="03"
                            title="Schedule & publish"
                            description="Schedule posts to Instagram with optimal timing. Track performance with analytics."
                        />
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple pricing</h2>
                        <p className="text-zinc-400">Start free, scale as you grow.</p>
                    </div>

                    <div className="grid md:grid-cols-4 gap-4">
                        <PricingCard title="Free" price="$0" features={["10 Credits", "1K Resolution", "Standard Speed", "Basic Styles"]} />
                        <PricingCard title="Growth" price="$29" features={["100 Credits", "2K Resolution", "Fast Speed", "No Watermarks"]} highlight />
                        <PricingCard title="Pro" price="$79" features={["500 Credits", "4K Resolution", "Video Generation", "Commercial Use"]} />
                        <PricingCard title="Business" price="Custom" features={["Unlimited", "API Access", "Custom Models", "Team Seats"]} />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 px-6 border-t border-white/5">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to start creating?</h2>
                    <p className="text-zinc-400 mb-8">Join thousands of creators using Velos AI to produce content faster.</p>
                    <Link to="/login" className="inline-flex items-center gap-2 px-8 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 transition-colors">
                        Get Started Free <FiArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
                                <span className="font-bold text-black text-xs">V</span>
                            </div>
                            <span className="font-medium text-zinc-400">Velos AI</span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-zinc-500">
                            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
                            <a href="#features" className="hover:text-white transition-colors">Features</a>
                            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                        </div>
                        <p className="text-xs text-zinc-600">© 2024 Questera Inc.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Sub-components
const FeatureCard = ({ icon, title, description }) => (
    <div className="p-6 rounded-xl border border-white/10 bg-zinc-950 hover:bg-zinc-900 transition-colors">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 text-white">
            {icon}
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
);

const StepCard = ({ number, title, description }) => (
    <div className="text-center">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 text-zinc-500 font-mono text-sm">
            {number}
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
);

const PricingCard = ({ title, price, features, highlight }) => (
    <div className={`p-6 rounded-xl flex flex-col ${highlight ? 'bg-white text-black' : 'border border-white/10 bg-zinc-950'}`}>
        <h3 className={`font-medium text-sm mb-1 ${highlight ? 'text-zinc-600' : 'text-zinc-500'}`}>{title}</h3>
        <div className="text-2xl font-bold mb-4">{price}<span className="text-sm font-normal opacity-50">/mo</span></div>
        <div className="space-y-2 mb-6 flex-1">
            {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <FiCheck className={`w-4 h-4 ${highlight ? 'text-black' : 'text-zinc-500'}`} />
                    <span>{f}</span>
                </div>
            ))}
        </div>
        <Link to="/login" className={`w-full py-2.5 rounded-lg font-medium text-sm text-center transition-colors ${highlight ? 'bg-black text-white hover:bg-zinc-800' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
            Get Started
        </Link>
    </div>
);

export default LandingPage;
