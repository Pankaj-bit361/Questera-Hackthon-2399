import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { API_BASE_URL } from '../config';


const { FiZap, FiArrowRight, FiUpload, FiGrid, FiImage, FiLayout, FiEye, FiX } = FiIcons;

const HomePage = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [viewingImage, setViewingImage] = useState(null); // For image preview modal
  const [uploadedImages, setUploadedImages] = useState([]); // For multiple reference images

  // Fetch templates from database on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setIsLoadingTemplates(true);
        const res = await fetch(`${API_BASE_URL}/template`);
        const data = await res.json();
        console.log('📦 Fetched templates:', data.templates);
        // Transform database templates to display format
        const dbTemplates = (data.templates || []).map(t => {
          const image = t.referenceImageUrl || t.variations?.[0]?.generatedImageUrl || '';
          console.log(`Template ${t.name}: referenceImageUrl=${t.referenceImageUrl}, variation0=${t.variations?.[0]?.generatedImageUrl}, using=${image}`);
          return {
            id: t._id,
            title: t.name,
            prompt: t.description || t.variations?.[0]?.prompt || '',
            image,
          };
        });
        setTemplates(dbTemplates);
      } catch (error) {
        console.error('Error fetching templates:', error);
        setTemplates([]);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  const handleGenerate = () => {
    if (!prompt.trim() && uploadedImages.length === 0) return;
    // Navigate to ChatPage with the prompt and images data
    navigate('/chat/new', { state: { prompt, referenceImages: uploadedImages } });
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        const base64Data = base64.split(',')[1];
        setUploadedImages(prev => [...prev, {
          file,
          preview: base64,
          data: base64Data,
          mimeType: file.type || 'image/png'
        }]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeUploadedImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
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

      <main className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-16 transition-all duration-300">

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

              {/* Uploaded Images Preview */}
              {uploadedImages.length > 0 && (
                <div className="px-4 py-2 border-t border-white/10">
                  <div className="flex items-center gap-3 flex-wrap">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={img.preview}
                          alt={`Reference ${index + 1}`}
                          className="w-16 h-16 object-cover rounded-lg border border-white/20"
                        />
                        <button
                          onClick={() => removeUploadedImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                        >
                          <SafeIcon icon={FiX} className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <span className="text-xs text-zinc-400">
                      {uploadedImages.length} reference image{uploadedImages.length > 1 ? 's' : ''} attached
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-4 pb-4 pt-2">
                <div className="flex items-center gap-2">
                  <label className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer" title="Upload Reference Image">
                    <SafeIcon icon={FiUpload} className="w-5 h-5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
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

            {isLoadingTemplates ? (
              <div className="text-center py-12 text-zinc-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                No templates available. Create one in the Templates Manager.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
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
                      {template.image ? (
                        <img
                          src={template.image}
                          alt={template.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                          <SafeIcon icon={FiImage} className="w-8 h-8 text-zinc-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>

                      {/* View Image Button */}
                      {template.image && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingImage(template);
                          }}
                          className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="View Image"
                        >
                          <SafeIcon icon={FiEye} className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="text-xs text-zinc-400 line-clamp-3">
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
            )}
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

      {/* Image Preview Modal */}
      {viewingImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-4 right-4 text-white hover:text-zinc-300 transition-colors"
          >
            <SafeIcon icon={FiX} className="w-8 h-8" />
          </button>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-4xl max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={viewingImage.image}
              alt={viewingImage.title}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-zinc-400 max-w-2xl mx-auto">
                {viewingImage.prompt}
              </p>
              <button
                onClick={() => {
                  setPrompt(viewingImage.prompt);
                  setSelectedTemplate(viewingImage.id);
                  setViewingImage(null);
                }}
                className="mt-4 bg-white text-black px-4 py-2 rounded-lg font-medium text-sm hover:bg-zinc-200 transition-colors"
              >
                Use This Template
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default HomePage;