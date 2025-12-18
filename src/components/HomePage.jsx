import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { API_BASE_URL } from '../config';


const { FiArrowRight, FiUpload, FiGrid, FiImage, FiEye, FiX, FiVideo, FiZap } = FiIcons;

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
  const [mode, setMode] = useState('image'); // 'image' or 'video'

  // Video-specific state
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);

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
    if (!prompt.trim() && uploadedImages.length === 0 && !startFrame && !endFrame) return;

    console.log('[HomePage] handleGenerate:', {
      mode,
      hasStartFrame: !!startFrame,
      startFrameDataLen: startFrame?.data?.length,
      hasEndFrame: !!endFrame,
      refsCount: uploadedImages.length,
    });

    if (mode === 'video') {
      // Navigate to video chat
      navigate('/video/new', {
        state: {
          prompt: prompt.trim(),
          referenceImages: uploadedImages.slice(0, 3), // Max 3 for video
          startFrame,
          endFrame,
        }
      });
    } else {
      // Navigate to image chat
      navigate('/chat/new', {
        state: {
          prompt: prompt.trim(),
          referenceImages: uploadedImages
        }
      });
    }
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
      // Limit to 3 images for video mode
      if (mode === 'video' && uploadedImages.length >= 3) {
        return;
      }
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
    e.target.value = '';
  };

  const handleFrameUpload = (e, frameType) => {
    const file = e.target.files[0];
    console.log('[HomePage] handleFrameUpload called:', { frameType, hasFile: !!file });
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        const base64Data = base64.split(',')[1];
        const frameData = {
          file,
          preview: base64,
          data: base64Data,
          mimeType: file.type || 'image/png'
        };
        console.log('[HomePage] Setting frame:', frameType, 'dataLength:', base64Data.length);
        if (frameType === 'start') setStartFrame(frameData);
        else if (frameType === 'end') setEndFrame(frameData);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removeUploadedImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Clear video-specific state when switching away from video
    if (newMode !== 'video') {
      setStartFrame(null);
      setEndFrame(null);
    }
    // Trim to 3 images when switching to video
    if (newMode === 'video' && uploadedImages.length > 3) {
      setUploadedImages(prev => prev.slice(0, 3));
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-hidden font-sans selection:bg-white/20 relative">

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

      <main className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-16 transition-all duration-300 z-10">

        <div className="relative z-10 w-full max-w-3xl mx-auto text-center space-y-8">

          {/* Mode Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1 p-1 rounded-full border border-white/5 bg-[#18181b]"
          >
            <button
              onClick={() => handleModeSwitch('image')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${mode === 'image'
                ? 'bg-white text-black shadow-lg'
                : 'text-zinc-500 hover:text-white'
                }`}
            >
              <SafeIcon icon={FiImage} className="w-4 h-4" />
              Image
            </button>
            <button
              onClick={() => handleModeSwitch('video')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${mode === 'video'
                ? 'bg-white text-black shadow-lg'
                : 'text-zinc-500 hover:text-white'
                }`}
            >
              <SafeIcon icon={FiVideo} className="w-4 h-4" />
              Video
            </button>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight"
          >
            What will you <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-zinc-500">{mode === 'video' ? 'create' : 'visualize'}</span> today?
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed"
          >
            {mode === 'video'
              ? 'Generate stunning AI videos from text prompts or images.'
              : 'Generate stunning ultra-realistic images and design assets by chatting with AI.'}
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
            <div className={`relative bg-[#18181B] border transition-all duration-300 rounded-3xl overflow-hidden shadow-2xl ${isFocused ? 'border-white/20 shadow-white/5' : 'border-white/10'}`}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={mode === 'video'
                  ? "Describe your video... e.g., A drone shot flying over a tropical island at sunset, cinematic..."
                  : "Describe your imagination... e.g., A futuristic Tokyo street with neon rain, cinematic lighting, 8k..."}
                className="w-full h-36 bg-transparent text-lg p-6 resize-none outline-none placeholder-zinc-600 text-white custom-scrollbar leading-relaxed"
              />

              {/* Uploaded Images Preview */}
              {(uploadedImages.length > 0 || startFrame || endFrame) && (
                <div className="px-6 py-3 border-t border-white/5 bg-[#09090b]/50">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Start Frame - Video only */}
                    {startFrame && (
                      <div className="relative">
                        <span className="absolute -top-2 left-1 text-[10px] bg-green-900 text-green-100 px-1.5 py-0.5 rounded z-10 border border-green-700">Start</span>
                        <img
                          src={startFrame.preview}
                          alt="Start Frame"
                          className="w-16 h-16 object-cover rounded-xl border border-white/10"
                        />
                        <button
                          onClick={() => setStartFrame(null)}
                          className="absolute -top-2 -right-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1 transition-colors z-10 border border-white/10"
                        >
                          <SafeIcon icon={FiX} className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {/* End Frame - Video only */}
                    {endFrame && (
                      <div className="relative">
                        <span className="absolute -top-2 left-1 text-[10px] bg-blue-900 text-blue-100 px-1.5 py-0.5 rounded z-10 border border-blue-700">End</span>
                        <img
                          src={endFrame.preview}
                          alt="End Frame"
                          className="w-16 h-16 object-cover rounded-xl border border-white/10"
                        />
                        <button
                          onClick={() => setEndFrame(null)}
                          className="absolute -top-2 -right-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1 transition-colors z-10 border border-white/10"
                        >
                          <SafeIcon icon={FiX} className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {/* Reference Images */}
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={img.preview}
                          alt={`Reference ${index + 1}`}
                          className="w-16 h-16 object-cover rounded-xl border border-white/10"
                        />
                        <button
                          onClick={() => removeUploadedImage(index)}
                          className="absolute -top-2 -right-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1 transition-colors border border-white/10"
                        >
                          <SafeIcon icon={FiX} className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <span className="text-xs text-zinc-500 font-bold ml-2">
                      {mode === 'video'
                        ? `${uploadedImages.length}/3`
                        : `${uploadedImages.length}`
                      }
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-6 pb-6 pt-2">
                <div className="flex items-center gap-2">
                  {/* Reference Image Upload */}
                  <label
                    className={`p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer ${mode === 'video' && uploadedImages.length >= 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={mode === 'video' ? `Reference Images (${uploadedImages.length}/3)` : 'Upload Reference Image'}
                  >
                    <SafeIcon icon={FiUpload} className="w-5 h-5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={mode === 'video' && uploadedImages.length >= 3}
                    />
                  </label>

                  {/* Video-specific: Start Frame */}
                  {mode === 'video' && (
                    <label
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-xl transition-colors cursor-pointer ${startFrame ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-500 hover:text-white hover:bg-white/5 border border-transparent'}`}
                      title="Upload Start Frame"
                    >
                      <span>Start</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFrameUpload(e, 'start')}
                        className="hidden"
                      />
                    </label>
                  )}

                  {/* Video-specific: End Frame */}
                  {mode === 'video' && (
                    <label
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-xl transition-colors cursor-pointer ${endFrame ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-zinc-500 hover:text-white hover:bg-white/5 border border-transparent'}`}
                      title="Upload End Frame"
                    >
                      <span>End</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFrameUpload(e, 'end')}
                        className="hidden"
                      />
                    </label>
                  )}

                  <div className="h-5 w-px bg-white/5 mx-2"></div>
                  <span className="text-xs text-zinc-600 font-bold uppercase tracking-widest">{mode === 'video' ? 'Veo 3.1' : 'Velos XL 1.0'}</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerate}
                    className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5 hover:shadow-white/10 hover:scale-105 active:scale-95"
                  >
                    <span>{mode === 'video' ? 'Generate Video' : 'Generate'}</span>
                    <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Templates Section - Only show for image mode */}
          {mode === 'image' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="w-full mt-20"
            >
              <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <SafeIcon icon={FiZap} className="w-4 h-4" />
                  Start with a Template
                </h3>
              </div>

              {isLoadingTemplates ? (
                <div className="text-center py-12 text-zinc-600 font-mono text-xs">LOADING_ASSETS...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  No templates available.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {templates.map((template) => (
                    <motion.div
                      key={template.id}
                      whileHover={{ scale: 1.02, y: -5 }}
                      onClick={() => handleTemplateClick(template)}
                      className={`
                      cursor-pointer group relative overflow-hidden rounded-3xl transition-all duration-500
                      ${selectedTemplate === template.id
                          ? 'ring-2 ring-white shadow-2xl shadow-white/10'
                          : 'border border-white/5 bg-[#18181b] hover:border-white/20 hover:shadow-2xl hover:shadow-black'
                        }
                    `}
                    >
                      <div className="relative h-48 overflow-hidden">
                        {template.image ? (
                          <img
                            src={template.image}
                            alt={template.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                            <SafeIcon icon={FiImage} className="w-8 h-8 text-zinc-700" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-transparent to-transparent opacity-80"></div>

                        {/* Prompt Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform">
                          <p className="text-sm font-medium text-white line-clamp-2 leading-relaxed drop-shadow-md">
                            {template.prompt}
                          </p>
                        </div>

                        {/* View Image Button */}
                        {template.image && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingImage(template);
                            }}
                            className="absolute top-3 right-3 bg-black/40 backdrop-blur-md hover:bg-black/60 text-white rounded-full p-2.5 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 border border-white/10"
                            title="View Full"
                          >
                            <SafeIcon icon={FiEye} className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </div>
      </main>

      <footer className="fixed bottom-6 right-8 text-[10px] font-bold tracking-widest text-zinc-800 z-30 pointer-events-none uppercase">
        <div className="pointer-events-auto flex gap-6">
          <a href="/privacy-policy" className="hover:text-zinc-500 transition-colors">Privacy</a>
          <a href="/terms-of-service" className="hover:text-zinc-500 transition-colors">Terms</a>
        </div>
      </footer>

      {/* Image Preview Modal */}
      {viewingImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-6"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors p-2 bg-white/5 rounded-full"
          >
            <SafeIcon icon={FiX} className="w-6 h-6" />
          </button>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-5xl w-full flex flex-col items-center gap-8"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={viewingImage.image}
              alt={viewingImage.title}
              className="max-h-[70vh] w-auto object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <div className="text-center max-w-2xl bg-[#18181b] p-6 rounded-3xl border border-white/10">
              <p className="text-base text-zinc-300 leading-relaxed font-light">
                {viewingImage.prompt}
              </p>
              <button
                onClick={() => {
                  setPrompt(viewingImage.prompt);
                  setSelectedTemplate(viewingImage.id);
                  setViewingImage(null);
                }}
                className="mt-6 bg-white text-black px-8 py-3 rounded-xl font-bold text-sm hover:bg-zinc-200 transition-colors shadow-lg"
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