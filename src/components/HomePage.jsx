import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { 
  FiSearch, FiImage, FiZap, FiLayout, FiGithub, FiTwitter, 
  FiMenu, FiX, FiCommand, FiArrowRight, FiUpload, FiGrid 
} = FiIcons;

const HomePage = () => {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-x-hidden font-sans selection:bg-white/20">
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-black">
              <SafeIcon icon={FiZap} className="w-4 h-4 fill-current" />
            </div>
            <span className="text-xl font-bold tracking-tight">Velos</span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#" className="hover:text-white transition-colors">Gallery</a>
            <a href="#" className="hover:text-white transition-colors">Models</a>
            <a href="#" className="hover:text-white transition-colors">Pricing</a>
            <a href="#" className="hover:text-white transition-colors">Docs</a>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-3 text-zinc-400">
                <a href="#" className="hover:text-white transition-colors"><SafeIcon icon={FiTwitter} /></a>
                <a href="#" className="hover:text-white transition-colors"><SafeIcon icon={FiGithub} /></a>
             </div>
             <div className="w-px h-6 bg-white/10 hidden sm:block"></div>
             <button className="text-sm font-medium bg-white text-black px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
               Sign In
             </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative pt-32 pb-20 px-6 min-h-screen flex flex-col items-center justify-center -mt-16">
        
        {/* Hero Section */}
        <div className="relative z-10 w-full max-w-4xl mx-auto text-center space-y-8">
          
          {/* Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300 mx-auto"
          >
            <SafeIcon icon={FiZap} className="w-3 h-3" />
            <span>Introducing Velos v2.0 Model</span>
          </motion.div>

          {/* Headline */}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight leading-tight"
          >
            What will you <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500 italic pr-2">visualize</span> today?
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-zinc-400 max-w-2xl mx-auto"
          >
            Generate stunning ultra-realistic images and design assets by chatting with AI.
          </motion.p>

          {/* Central Input Box (The "Bolt" Box) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className={`
              relative w-full max-w-3xl mx-auto mt-12 group transition-all duration-300
              ${isFocused ? 'scale-[1.01]' : ''}
            `}
          >
            {/* Input Container */}
            <div className="relative bg-[#18181B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-white/20 transition-colors">
              
              {/* Text Area */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Describe your imagination... e.g., A futuristic Tokyo street with neon rain, cinematic lighting, 8k..."
                className="w-full h-32 bg-transparent text-lg p-6 resize-none outline-none placeholder-zinc-600 text-white"
              />

              {/* Bottom Actions Bar */}
              <div className="flex items-center justify-between px-4 pb-4 pt-2">
                
                {/* Left Actions */}
                <div className="flex items-center gap-2">
                  <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Upload Reference">
                    <SafeIcon icon={FiUpload} className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Select Model">
                    <SafeIcon icon={FiGrid} className="w-5 h-5" />
                  </button>
                  <div className="h-4 w-px bg-white/10 mx-1"></div>
                  <span className="text-xs text-zinc-500 font-mono">Velos XL 1.0</span>
                </div>

                {/* Generate Button */}
                <div className="flex items-center gap-3">
                   <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
                      <SafeIcon icon={FiZap} className="w-3 h-3" />
                      <span>2 tokens</span>
                   </div>
                   <button className="bg-white text-black px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-zinc-200 transition-colors">
                     <span>Generate</span>
                     <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                   </button>
                </div>
              </div>
            </div>

            {/* Glow Effect behind box */}
            <div className="absolute -inset-1 bg-gradient-to-r from-white/20 via-white/10 to-white/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-500 -z-10"></div>
          </motion.div>

          {/* Secondary Actions */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-6 text-sm text-zinc-500"
          >
            <span>or start with</span>
            <button className="flex items-center gap-2 hover:text-white transition-colors border border-white/5 bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10">
              <SafeIcon icon={FiImage} className="w-4 h-4" />
              Upload Image
            </button>
            <button className="flex items-center gap-2 hover:text-white transition-colors border border-white/5 bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10">
              <SafeIcon icon={FiLayout} className="w-4 h-4" />
              Browse Templates
            </button>
          </motion.div>

        </div>

        {/* The "Bolt" Horizon Glow Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 flex items-end justify-center overflow-hidden">
           {/* The Curve */}
           <div className="w-[150%] h-[100%] bg-gradient-to-t from-white/10 via-transparent to-transparent rounded-[100%] blur-[100px] translate-y-[50%]"></div>
           {/* The Sharp Line */}
           <div className="absolute bottom-0 w-[80%] h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
        </div>

      </main>

      {/* Footer */}
      <footer className="fixed bottom-4 left-6 right-6 flex justify-between items-center text-xs text-zinc-600 z-50 pointer-events-none">
         <div className="pointer-events-auto">
            © 2024 Velos AI Inc.
         </div>
         <div className="flex gap-4 pointer-events-auto">
            <a href="#" className="hover:text-zinc-400">Privacy</a>
            <a href="#" className="hover:text-zinc-400">Terms</a>
         </div>
      </footer>

    </div>
  );
};

export default HomePage;