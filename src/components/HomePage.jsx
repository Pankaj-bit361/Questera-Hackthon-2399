import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';

const { FiZap, FiArrowRight, FiUpload, FiGrid, FiImage, FiLayout } = FiIcons;

const TEMPLATE_VARIATIONS = [
  {
    id: 1,
    title: "Cinematic Portrait – White Flower & Bubbles",
    prompt: "Create a cinematic portrait photo of a young woman with long dark hair styled in loose waves, wearing a pale green knitted sweater. She gently holds a single white flower in both hands, gazing calmly toward the camera with a serene, natural expression. The background is softly blurred, filled with floating soap bubbles, creating a dreamy atmosphere. The diffused luminous lighting adds a fresh airy feel with soft bokeh in greens, silvers, and pastels.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop"
  },
  {
    id: 2,
    title: "Golden Hour Garden Portrait",
    prompt: "Create a warm golden hour portrait of a young woman in a mustard-yellow silk saree with golden motifs. Her hair is tied in a jasmine-decorated bun with silver jhumkas. Soft sunlight enhances rich textures and a modern traditional aesthetic.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop"
  },
  {
    id: 3,
    title: "Sunset Palm Vibe",
    prompt: "Create a peaceful beach portrait of a young woman standing by the shore during a pastel sunset. She wears a black wrap top and high-waisted orange trousers with white palm leaf patterns. Breezy hair, gold jewelry, warm reflective light on wet sand.",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop"
  },
];

const HomePage = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

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

  const handleTemplateClick = (template) => {
    setPrompt(template.prompt);
    setSelectedTemplate(template.id);
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

          {/* Templates Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="w-full mt-12"
          >
            <h3 className="text-sm font-semibold text-zinc-400 mb-4 text-left">✨ Try a Template</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATE_VARIATIONS.map((template) => (
                <motion.div
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleTemplateClick(template)}
                  className={`
                    cursor-pointer group relative overflow-hidden rounded-xl border transition-all duration-300
                    ${selectedTemplate === template.id
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                    }
                  `}
                >
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={template.image}
                      alt={template.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  </div>

                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                      {template.title}
                    </h4>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {template.prompt}
                    </p>
                  </div>

                  {selectedTemplate === template.id && (
                    <div className="absolute top-2 right-2 bg-white text-black rounded-full p-1">
                      <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500 pt-8"
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