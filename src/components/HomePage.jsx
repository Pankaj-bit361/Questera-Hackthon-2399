import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';

const { FiZap, FiArrowRight, FiUpload, FiGrid, FiImage, FiLayout } = FiIcons;

const HomePage = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    // Navigate to ChatPage with the prompt data
    navigate('/chat/new', { state: { prompt } });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-hidden font-sans selection:bg-white/20 relative">
      
      {/* Sidebar Trigger Zone */}
      <div 
        className="fixed top-0 left-0 w-6 h-full z-40 bg-transparent hover:bg-white/0 transition-colors"
        onMouseEnter={() => setSidebarOpen(true)}
      />

      <Sidebar 
        isOpen={isSidebarOpen} 
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      />

      <main className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 transition-all duration-300">
        
        <div className="relative z-10 w-full max-w-3xl mx-auto text-center space-y-8">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300 mx-auto"
          >
            <SafeIcon icon={FiZap} className="w-3 h-3" />
            <span>Introducing Velos v2.0 Model</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight"
          >
            What will you <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500 italic pr-1">visualize</span> today?
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-xl mx-auto"
          >
            Generate stunning ultra-realistic images and design assets by chatting with AI.
          </motion.p>

          {/* Input Box */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ delay: 0.3 }}
            className={`
              relative w-full mt-10 group transition-all duration-300 
              ${isFocused ? 'scale-[1.01]' : ''}
            `}
          >
            <div className="relative bg-[#18181B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-white/20 transition-colors">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Describe your imagination... e.g., A futuristic Tokyo street with neon rain, cinematic lighting, 8k..."
                className="w-full h-32 bg-transparent text-lg p-5 resize-none outline-none placeholder-zinc-600 text-white custom-scrollbar"
              />
              
              <div className="flex items-center justify-between px-4 pb-4 pt-2">
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

                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleGenerate}
                    className="bg-white text-black px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-zinc-200 transition-colors"
                  >
                    <span>Generate</span>
                    <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="absolute -inset-1 bg-gradient-to-r from-white/20 via-white/10 to-white/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-500 -z-10"></div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500 pt-4"
          >
            <span>or start with</span>
            <button className="flex items-center gap-2 hover:text-white transition-colors border border-white/5 bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10">
              <SafeIcon icon={FiImage} className="w-4 h-4" />
              Upload Image
            </button>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 flex items-end justify-center overflow-hidden">
          <div className="w-[150%] h-[100%] bg-gradient-to-t from-white/5 via-transparent to-transparent rounded-[100%] blur-[100px] translate-y-[50%]"></div>
        </div>
      </main>

      <footer className="fixed bottom-4 right-6 text-xs text-zinc-700 z-30 pointer-events-none">
        <div className="pointer-events-auto flex gap-4">
          <a href="#" className="hover:text-zinc-500 transition-colors">Privacy</a>
          <a href="#" className="hover:text-zinc-500 transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;