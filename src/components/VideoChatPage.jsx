import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import '../styles/datepicker.css'; // Import custom premium styles
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { API_BASE_URL } from '../config';
import { getUserId, getUser } from '../lib/velosStorage';
import { videoAPI, instagramAPI, schedulerAPI } from '../lib/api';

const { FiChevronLeft, FiSend, FiVideo, FiImage, FiX, FiLoader, FiPlay, FiPlus, FiFilm, FiChevronDown, FiChevronUp, FiMaximize2, FiDownload, FiCalendar, FiClock, FiInstagram, FiRefreshCw, FiCheck, FiZap } = FiIcons;

// Custom Premium Dropdown Component
const PremiumSelect = ({ options, value, onChange, placeholder = "Select an option", icon: Icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 bg-zinc-900 border ${isOpen ? 'border-white' : 'border-white/10'} rounded-xl text-left flex items-center justify-between transition-all hover:border-white/30`}
      >
        <span className="flex items-center gap-2 text-sm text-white truncate">
          {Icon && <SafeIcon icon={Icon} className="w-4 h-4 text-zinc-400" />}
          {selectedOption ? selectedOption.label : <span className="text-zinc-500">{placeholder}</span>}
        </span>
        <SafeIcon icon={FiChevronDown} className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2 hover:bg-white/5 transition-colors ${value === option.value ? 'bg-white/10 text-white font-medium' : 'text-zinc-400'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Compact pill-style option picker — portal-based to escape any stacking context
const SettingPill = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  const recalc = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, btnHeight: r.height });
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        dropRef.current && !dropRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    recalc();
    setOpen(o => !o);
  };

  // Dropdown rendered via portal — positions above the button
  const dropdown = open ? ReactDOM.createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: pos.top - 8, // will translate up via transform
        left: pos.left,
        zIndex: 99999,
        transform: 'translateY(-100%)',
      }}
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.1 }}
          className="bg-[#1c1c1f] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[80px]"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap ${value === opt.value ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/5'}`}
            >
              {opt.label}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl hover:border-white/25 transition-colors"
      >
        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
        <span className="text-xs font-bold text-white">{value}</span>
        <SafeIcon icon={FiChevronDown} className={`w-3 h-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </div>
  );
};

// Truncated text component with "Read more" toggle
const TruncatedText = ({ text, maxLines = 5, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (textRef.current) {
      // Check if text exceeds maxLines (approx 1.5rem line height = 24px)
      const lineHeight = 20; // text-sm leading-relaxed
      const maxHeight = lineHeight * maxLines;
      setShouldTruncate(textRef.current.scrollHeight > maxHeight + 10);
    }
  }, [text, maxLines]);

  return (
    <div className="relative">
      <p
        ref={textRef}
        className={`text-sm leading-relaxed ${className} ${!isExpanded && shouldTruncate ? 'line-clamp-5' : ''
          }`}
        style={!isExpanded && shouldTruncate ? {
          display: '-webkit-box',
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        } : {}}
      >
        {text}
      </p>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors font-medium border-b border-transparent hover:border-white/50"
        >
          {isExpanded ? (
            <>
              <SafeIcon icon={FiChevronUp} className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <SafeIcon icon={FiChevronDown} className="w-3 h-3" />
              Read more
            </>
          )}
        </button>
      )}
    </div>
  );
};

const VideoChatPage = () => {
  const { chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(chatId);
  const [referenceImages, setReferenceImages] = useState([]);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);
  const [isInputFocused, setInputFocused] = useState(false);
  const [extendingVideo, setExtendingVideo] = useState(null); // Video URL to extend

  // Scheduling state
  const [scheduleModal, setScheduleModal] = useState(null); // { videoUrl, prompt, messageIdx }
  const [scheduleDate, setScheduleDate] = useState(new Date(new Date().setDate(new Date().getDate() + 1))); // Default tomorrow
  const [scheduleTime, setScheduleTime] = useState(new Date().setHours(9, 0, 0, 0)); // Default 9 AM
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [viralContent, setViralContent] = useState(null);
  const [captionTone, setCaptionTone] = useState('brand'); // 'brand', 'creator', 'marketing'
  const [selectedModel, setSelectedModel] = useState(location.state?.videoModel || 'veo'); // 'veo' | 'wan' | 'seedance'

  // KIE model settings
  const [kieSettings, setKieSettings] = useState({
    resolution: '720p',
    aspectRatio: '16:9',
    duration: 8,
    generateAudio: true,
    webSearch: false,
  });

  // Veo settings
  const [veoSettings, setVeoSettings] = useState({
    resolution: '720p',
    aspectRatio: '16:9',
    duration: 8,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [referenceVideos, setReferenceVideos] = useState([]); // { file, preview, url }
  const [referenceAudios, setReferenceAudios] = useState([]); // { file, url }

  const messagesEndRef = useRef(null);
  const hasInitialized = useRef(false);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [prompt]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Initialize
  useEffect(() => {
    if (chatId === 'new' && !hasInitialized.current) {
      hasInitialized.current = true;
      const initialPrompt = location.state?.prompt;
      const initialImages = location.state?.referenceImages || [];
      const initialStartFrame = location.state?.startFrame;
      const initialEndFrame = location.state?.endFrame;

      console.log('[VideoChatPage] Initial state:', { initialPrompt, initialImages, initialStartFrame, initialEndFrame });

      if (initialImages.length > 0) {
        setReferenceImages(initialImages.slice(0, 3));
      }
      if (initialStartFrame) {
        setStartFrame(initialStartFrame);
      }
      if (initialEndFrame) {
        setEndFrame(initialEndFrame);
      }

      if (initialPrompt) {
        setPrompt(initialPrompt);
        // Auto-generate
        setTimeout(() => handleGenerate(initialPrompt, initialImages.slice(0, 3), initialStartFrame, initialEndFrame), 100);
      }
    } else if (chatId !== 'new') {
      loadConversation(chatId);
    }
  }, [chatId, location.state]);

  const loadConversation = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/video/conversation/${id}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
        setCurrentChatId(id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  // Handle extend video
  const handleExtendVideo = (videoUrl) => {
    setExtendingVideo(videoUrl);
    setPrompt('Continue the video with...');
    textareaRef.current?.focus();
    toast.info('Enter a prompt to extend the video');
  };

  // Cancel extending
  const cancelExtend = () => {
    setExtendingVideo(null);
    setPrompt('');
  };

  // Fetch social accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      const userId = getUserId();
      if (!userId) return;
      try {
        const result = await instagramAPI.getSocialAccounts(userId);
        if (result.success) {
          setSocialAccounts(result.accounts || []);
          if (result.accounts?.length > 0) {
            setSelectedAccount(result.accounts[0].accountId);
          }
        }
      } catch (err) {
        console.error('Error loading social accounts:', err);
      }
    };
    loadAccounts();
  }, []);

  // Open schedule modal
  const openScheduleModal = (videoUrl, videoPrompt, idx) => {
    setScheduleModal({ videoUrl, prompt: videoPrompt, messageIdx: idx });

    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow);

    const nineAM = new Date();
    nineAM.setHours(9, 0, 0, 0);
    setScheduleTime(nineAM);

    setScheduleCaption('');
    setViralContent(null);
    setCaptionTone('brand'); // Default to brand tone
    // Auto-generate caption by analyzing the actual video
    generateViralCaption(videoPrompt, videoUrl, 'brand');
  };

  // Generate caption by analyzing actual video with Gemini
  const generateViralCaption = async (videoPrompt, videoUrl = null, tone = 'brand') => {
    setIsGeneratingCaption(true);
    try {
      // Pass videoUrl so Gemini can analyze the actual video content
      const result = await videoAPI.generateCaption({
        prompt: videoPrompt,
        platform: 'instagram',
        videoUrl: videoUrl || scheduleModal?.videoUrl, // Analyze actual video!
        tone: tone || captionTone,
      });
      if (result.success) {
        setViralContent(result);
        const fullCaption = `${result.caption || ''}\n\n${result.hashtags || ''}`.trim();
        setScheduleCaption(fullCaption);
      }
    } catch (err) {
      console.error('Error generating caption:', err);
      toast.error('Failed to generate caption');
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Schedule the video
  const handleScheduleVideo = async () => {
    if (!scheduleModal?.videoUrl || !scheduleDate || !scheduleTime) {
      toast.error('Please select a date and time');
      return;
    }

    const userId = getUserId();
    if (!userId) {
      toast.error('Please log in first');
      return;
    }

    if (!selectedAccount) {
      toast.error('Please connect an Instagram account first');
      return;
    }

    setIsScheduling(true);
    try {
      // Combine date and time
      const scheduledAt = new Date(scheduleDate);
      const timeDate = new Date(scheduleTime);
      scheduledAt.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);

      const result = await videoAPI.schedule({
        userId,
        videoUrl: scheduleModal.videoUrl,
        videoChatId: currentChatId,
        prompt: scheduleModal.prompt,
        platform: 'instagram',
        accountId: selectedAccount,
        scheduledAt: scheduledAt.toISOString(),
        customCaption: scheduleCaption,
        postType: 'reel',
        tone: captionTone, // Pass selected tone
      });

      if (result.success) {
        toast.success('Video scheduled as Reel! 🎬');
        setScheduleModal(null);
      } else {
        toast.error(result.error || 'Failed to schedule video');
      }
    } catch (err) {
      console.error('Error scheduling video:', err);
      toast.error('Failed to schedule video');
    } finally {
      setIsScheduling(false);
    }
  };

  // Convert a File object to base64 string
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Upload a base64 image to S3 and return a public URL (needed for KIE models)
  const uploadImageToS3 = async (imageObj) => {
    if (!imageObj?.data) return null;
    const result = await schedulerAPI.uploadMedia(
      { data: imageObj.data, mimeType: imageObj.mimeType || 'image/png' },
      'image'
    );
    console.log('[uploadImageToS3] result:', result);
    return result?.url || null;
  };

  const handleGenerate = async (inputPrompt = prompt, inputRefs = referenceImages, inputStartFrame = startFrame, inputEndFrame = endFrame, videoToExtend = extendingVideo) => {
    if (!inputPrompt.trim() && inputRefs.length === 0 && !inputStartFrame && !inputEndFrame && !videoToExtend) return;

    const userId = getUserId();
    if (!userId) {
      toast.error('Please log in first');
      return;
    }

    setLoading(true);

    // Add user message optimistically
    const userMsg = {
      role: 'user',
      content: videoToExtend ? `🎬 Extend video: ${inputPrompt}` : inputPrompt,
      referenceImages: inputRefs.map(img => img.preview),
    };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setExtendingVideo(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      let data;

      if (selectedModel === 'wan') {
        // Wan 2.7 needs image URLs — upload to S3 first
        toast.info('Uploading images...', { autoClose: 2000 });
        const firstFrameUrl = inputStartFrame ? await uploadImageToS3(inputStartFrame) : null;
        const lastFrameUrl  = inputEndFrame   ? await uploadImageToS3(inputEndFrame)   : null;

        if (!firstFrameUrl) {
          toast.error('Wan 2.7 requires a Start Frame image');
          setLoading(false);
          return;
        }

        data = await videoAPI.generateWan({
          userId,
          prompt: inputPrompt,
          videoChatId: currentChatId === 'new' ? undefined : currentChatId,
          firstFrameUrl,
          ...(lastFrameUrl && { lastFrameUrl }),
          resolution: kieSettings.resolution,
          duration: kieSettings.duration,
        });

      } else if (selectedModel === 'seedance' || selectedModel === 'seedance-fast') {
        // Seedance 2.0 needs image URLs
        toast.info('Uploading images...', { autoClose: 2000 });
        const firstFrameUrl       = inputStartFrame ? await uploadImageToS3(inputStartFrame) : null;
        const lastFrameUrl        = inputEndFrame   ? await uploadImageToS3(inputEndFrame)   : null;
        const referenceImageUrls  = await Promise.all(inputRefs.map(uploadImageToS3)).then(urls => urls.filter(Boolean));

        data = await (selectedModel === 'seedance-fast' ? videoAPI.generateSeedanceFast : videoAPI.generateSeedance)({
          userId,
          prompt: inputPrompt,
          videoChatId: currentChatId === 'new' ? undefined : currentChatId,
          ...(firstFrameUrl && { firstFrameUrl }),
          ...(lastFrameUrl  && { lastFrameUrl }),
          ...(referenceImageUrls.length && { referenceImageUrls }),
          ...(referenceVideos.length && { referenceVideoUrls: referenceVideos.map(v => v.url) }),
          ...(referenceAudios.length && { referenceAudioUrls: referenceAudios.map(a => a.url) }),
          resolution: kieSettings.resolution,
          aspectRatio: kieSettings.aspectRatio,
          duration: kieSettings.duration,
          generateAudio: kieSettings.generateAudio,
          webSearch: kieSettings.webSearch,
        });

      } else {
        // Default: Google Veo
        const body = {
          userId,
          prompt: inputPrompt,
          videoChatId: currentChatId === 'new' ? undefined : currentChatId,
          referenceImages: inputRefs.map(img => ({ data: img.data, mimeType: img.mimeType || 'image/png' })),
          resolution: veoSettings.resolution,
          aspectRatio: veoSettings.aspectRatio,
          durationSeconds: (veoSettings.resolution === '1080p' || veoSettings.resolution === '4k') ? 8 : veoSettings.duration,
        };
        if (inputStartFrame?.data) body.startFrame = { data: inputStartFrame.data, mimeType: inputStartFrame.mimeType || 'image/png' };
        if (inputEndFrame?.data)   body.endFrame   = { data: inputEndFrame.data,   mimeType: inputEndFrame.mimeType   || 'image/png' };
        if (videoToExtend)         body.lastVideoUrl = videoToExtend;

        const res = await fetch(`${API_BASE_URL}/video/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        data = await res.json();
      }

      if (data.success) {
        if (currentChatId === 'new' && data.videoChatId) {
          setCurrentChatId(data.videoChatId);
          navigate(`/video/${data.videoChatId}`, { replace: true });
        }
        setMessages(prev => [...prev, data.message]);
        toast.success('Video generated!');
      } else {
        toast.error(data.error || 'Failed to generate video');
        console.error('[VideoChatPage] Error:', data.error);
      }
    } catch (error) {
      toast.error('Failed to generate video');
      console.error('[VideoChatPage] Exception:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e, type = 'reference') => {
    if (!e.target.files?.length) return;

    const files = Array.from(e.target.files);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        const base64Data = base64.split(',')[1];

        const newImage = {
          file,
          preview: base64,
          data: base64Data,
          mimeType: file.type || 'image/png'
        };

        if (type === 'start') {
          setStartFrame(newImage);
        } else if (type === 'end') {
          setEndFrame(newImage);
        } else {
          setReferenceImages(prev => [...prev, newImage].slice(0, 3));
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = ''; // Reset input
  };

  const removeImage = (index, type = 'reference') => {
    if (type === 'start') setStartFrame(null);
    else if (type === 'end') setEndFrame(null);
    else setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-black text-white flex overflow-hidden font-sans selection:bg-white/20">
      {/* Sidebar Trigger */}
      <div
        className="fixed top-0 left-0 w-6 h-full z-40"
        onMouseEnter={() => setSidebarOpen(true)}
      />
      <Sidebar
        isOpen={isSidebarOpen}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen relative bg-[#09090b]">

        {/* Header */}
        <header className="absolute top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-zinc-900/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
            </button>
            {/* Model Selector */}
            <div className="w-44">
              <PremiumSelect
                options={[
                  { value: 'veo', label: 'Veo 3.1' },
                  { value: 'seedance', label: 'Seedance 2.0' },
                  { value: 'seedance-fast', label: 'Seedance Fast' },
                ]}
                value={selectedModel}
                onChange={setSelectedModel}
                icon={FiVideo}
                placeholder="Select Model"
              />
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-24 scrollbar-hide">
          <div className="max-w-4xl mx-auto space-y-8">
            <AnimatePresence mode="popLayout">
              {messages.length === 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-6">
                    <SafeIcon icon={FiVideo} className="w-6 h-6 text-zinc-500" />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
                    Motion from Imagination
                  </h2>
                  <p className="text-zinc-500 max-w-sm text-sm leading-relaxed">
                    Generate cinematic videos. Use reference images or frames to guide the motion.
                  </p>
                </motion.div>
              )}

              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    max-w-2xl rounded-2xl p-5 relative overflow-hidden
                    ${msg.role === 'user'
                      ? 'bg-zinc-800 text-white'
                      : 'bg-zinc-900 border border-white/5'
                    }
                  `}>
                    <div className="relative z-10 space-y-3">
                      <TruncatedText
                        text={msg.content}
                        maxLines={msg.role === 'user' ? 8 : 3}
                        className={msg.role === 'user' ? 'text-zinc-100' : 'text-zinc-300'}
                      />

                      {msg.videoUrl && (
                        <div className="relative group">
                          <div className="rounded-xl overflow-hidden bg-black border border-white/10">
                            <video
                              src={msg.videoUrl}
                              controls
                              className="w-full h-auto max-h-[400px]"
                            />
                          </div>
                          {/* Video action buttons */}
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            {(() => {
                              const canExtend = !msg.videoResolution || msg.videoResolution === '720p';
                              return (
                                <button
                                  onClick={() => handleExtendVideo(msg.videoUrl)}
                                  disabled={loading || !canExtend}
                                  title={!canExtend ? `Extension only works on 720p videos (this is ${msg.videoResolution})` : 'Extend video'}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-black bg-white hover:bg-zinc-200 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-400"
                                >
                                  <SafeIcon icon={FiMaximize2} className="w-3 h-3" />
                                  Extend{!canExtend && ` (720p only)`}
                                </button>
                              );
                            })()}

                            <button
                              onClick={() => openScheduleModal(msg.videoUrl, msg.content, idx)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg transition-all"
                            >
                              <SafeIcon icon={FiCalendar} className="w-3 h-3" />
                              Schedule
                            </button>
                            <a
                              href={msg.videoUrl}
                              download
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-400 bg-transparent hover:text-white border border-white/10 rounded-lg transition-all"
                            >
                              <SafeIcon icon={FiDownload} className="w-3 h-3" />
                              Download
                            </a>
                          </div>
                        </div>
                      )}

                      {msg.status === 'processing' && (
                        <div className="flex items-center gap-2 text-zinc-400 bg-zinc-900 px-3 py-2 rounded-lg border border-white/5 mt-2">
                          <SafeIcon icon={FiLoader} className="w-3 h-3 animate-spin" />
                          <span className="text-xs font-medium">Generating...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-zinc-900 border border-white/5 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative w-4 h-4">
                        <span className="absolute inset-0 rounded-full border border-zinc-700"></span>
                        <span className="absolute inset-0 rounded-full border-t border-white animate-spin"></span>
                      </div>
                      <span className="text-xs text-zinc-500 font-medium">Processing video...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className="relative z-40 bg-[#09090b] pt-4 pb-6">
          <div className="w-full max-w-3xl mx-auto px-4">
            <div className={`
                relative bg-[#18181b] border transition-all duration-300 rounded-3xl overflow-visible
                ${isInputFocused ? 'border-zinc-600 shadow-2xl' : 'border-white/10 shadow-lg'}
              `}>

              {/* Veo Settings Panel */}
              <AnimatePresence>
                {selectedModel === 'veo' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-visible"
                  >
                    <div className="px-4 pt-3 pb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mr-1">Veo 3.1</span>
                        <div className="w-px h-3 bg-white/10 mr-1" />
                        <SettingPill
                          label="Resolution"
                          value={veoSettings.resolution}
                          onChange={v => setVeoSettings(s => ({ ...s, resolution: v, duration: (v === '1080p' || v === '4k') ? 8 : s.duration }))}
                          options={[
                            { value: '720p', label: '720p' },
                            { value: '1080p', label: '1080p' },
                            { value: '4k', label: '4K' },
                          ]}
                        />
                        <SettingPill
                          label="Aspect"
                          value={veoSettings.aspectRatio}
                          onChange={v => setVeoSettings(s => ({ ...s, aspectRatio: v }))}
                          options={[
                            { value: '16:9', label: '16:9' },
                            { value: '9:16', label: '9:16' },
                          ]}
                        />
                        <SettingPill
                          label="Duration"
                          value={`${veoSettings.duration}s`}
                          onChange={v => setVeoSettings(s => ({ ...s, duration: parseInt(v) }))}
                          options={
                            (veoSettings.resolution === '1080p' || veoSettings.resolution === '4k')
                              ? [{ value: '8', label: '8s' }]
                              : [
                                  { value: '4', label: '4s' },
                                  { value: '6', label: '6s' },
                                  { value: '8', label: '8s' },
                                ]
                          }
                        />
                        {(veoSettings.resolution === '1080p' || veoSettings.resolution === '4k') && (
                          <span className="text-[10px] text-amber-400/80 font-medium">· 8s required for {veoSettings.resolution}</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* KIE Model Settings Panel */}
              <AnimatePresence>
                {(selectedModel === 'seedance' || selectedModel === 'seedance-fast') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-visible"
                  >
                    <div className="px-4 pt-3 pb-1 space-y-2">

                      {/* Row 1: model label + settings pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mr-1">
                          {selectedModel === 'seedance-fast' ? 'Seedance Fast' : 'Seedance 2.0'}
                        </span>
                        <div className="w-px h-3 bg-white/10 mr-1" />
                        <SettingPill
                          label="Resolution"
                          value={kieSettings.resolution}
                          onChange={v => setKieSettings(s => ({ ...s, resolution: v }))}
                          options={[
                            { value: '480p', label: '480p' },
                            { value: '720p', label: '720p' },
                          ]}
                        />
                        <SettingPill
                          label="Aspect"
                          value={kieSettings.aspectRatio}
                          onChange={v => setKieSettings(s => ({ ...s, aspectRatio: v }))}
                          options={['16:9','9:16','1:1','4:3','3:4','21:9'].map(r => ({ value: r, label: r }))}
                        />
                        <SettingPill
                          label="Duration"
                          value={`${kieSettings.duration}s`}
                          onChange={v => setKieSettings(s => ({ ...s, duration: Number(v) }))}
                          options={[4,5,6,7,8,10,12,15].map(d => ({ value: d, label: `${d}s` }))}
                        />
                        <div className="w-px h-3 bg-white/10 mx-0.5" />
                        {/* Audio toggle */}
                        <button
                          onClick={() => setKieSettings(s => ({ ...s, generateAudio: !s.generateAudio }))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                            kieSettings.generateAudio
                              ? 'bg-white text-black border-white'
                              : 'bg-transparent text-zinc-500 border-white/10 hover:border-white/25 hover:text-zinc-300'
                          }`}
                        >
                          🔊 Audio
                        </button>
                      </div>

                      {/* Row 2: Reference media uploads */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Reference Videos */}
                        {referenceVideos.map((v, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
                            <SafeIcon icon={FiFilm} className="w-3 h-3 text-violet-400" />
                            <span className="text-xs text-zinc-300 max-w-[72px] truncate">{v.file.name}</span>
                            <span className="text-[10px] text-zinc-600">{Math.round(v.duration)}s</span>
                            <button onClick={() => setReferenceVideos(p => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 ml-0.5">
                              <SafeIcon icon={FiX} className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {referenceVideos.length < 1 && (
                          <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-white/10 rounded-xl text-[11px] font-medium text-zinc-500 hover:text-white hover:border-white/25 cursor-pointer transition-all">
                            <SafeIcon icon={FiFilm} className="w-3 h-3" />
                            Ref Video
                            <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const duration = await new Promise(resolve => {
                                const video = document.createElement('video');
                                video.preload = 'metadata';
                                video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
                                video.src = URL.createObjectURL(file);
                              });
                              const totalExisting = referenceVideos.reduce((sum, v) => sum + (v.duration || 0), 0);
                              if (duration > 15) { toast.error(`Video is ${Math.round(duration)}s — max 15s`); e.target.value = ''; return; }
                              if (totalExisting + duration > 15) { toast.error(`Total reference video duration cannot exceed 15s`); e.target.value = ''; return; }
                              const result = await schedulerAPI.uploadMedia({ data: await fileToBase64(file), mimeType: file.type }, 'video');
                              if (result?.url) setReferenceVideos(p => [...p, { file, url: result.url, duration }]);
                              e.target.value = '';
                            }} />
                          </label>
                        )}

                        {/* Reference Audios */}
                        {referenceAudios.map((a, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
                            <span className="text-xs">🎵</span>
                            <span className="text-xs text-zinc-300 max-w-[72px] truncate">{a.file.name}</span>
                            <button onClick={() => setReferenceAudios(p => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 ml-0.5">
                              <SafeIcon icon={FiX} className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {referenceAudios.length < 1 && (
                          <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-white/10 rounded-xl text-[11px] font-medium text-zinc-500 hover:text-white hover:border-white/25 cursor-pointer transition-all">
                            🎵 Ref Audio
                            <input type="file" accept="audio/mpeg,audio/wav" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const result = await schedulerAPI.uploadMedia({ data: await fileToBase64(file), mimeType: file.type }, 'audio');
                              if (result?.url) setReferenceAudios(p => [...p, { file, url: result.url }]);
                              e.target.value = '';
                            }} />
                          </label>
                        )}
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Extending Video Indicator */}
              {extendingVideo && (
                <div className="px-3 pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-2">
                      <SafeIcon icon={FiMaximize2} className="w-4 h-4 text-white" />
                      <span className="text-xs text-zinc-400 font-medium">Extending video...</span>
                    </div>
                    <button
                      onClick={cancelExtend}
                      className="p-1 text-zinc-500 hover:text-white rounded transition-colors"
                    >
                      <SafeIcon icon={FiX} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Active References Preview Bar */}
              {(referenceImages.length > 0 || startFrame || endFrame) && (
                <div className="px-4 pt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {startFrame && (
                    <div className="relative flex-shrink-0 group">
                      <div className="absolute -top-2 left-0 z-10 bg-black text-white border border-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded">Start</div>
                      <img src={startFrame.preview} className="w-14 h-14 object-cover rounded-xl border border-white/10" />
                      <button onClick={() => removeImage(0, 'start')} className="absolute -top-1 -right-1 bg-black text-white hover:text-red-400 rounded-full p-0.5 border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {endFrame && (
                    <div className="relative flex-shrink-0 group">
                      <div className="absolute -top-2 left-0 z-10 bg-black text-white border border-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded">End</div>
                      <img src={endFrame.preview} className="w-14 h-14 object-cover rounded-xl border border-white/10" />
                      <button onClick={() => removeImage(0, 'end')} className="absolute -top-1 -right-1 bg-black text-white hover:text-red-400 rounded-full p-0.5 border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {referenceImages.map((img, i) => (
                    <div key={i} className="relative flex-shrink-0 group">
                      <img src={img.preview} className="w-14 h-14 object-cover rounded-xl border border-white/10" />
                      <button onClick={() => removeImage(i)} className="absolute -top-1 -right-1 bg-black text-white hover:text-red-400 rounded-full p-0.5 border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-3 p-3">
                <div className="flex gap-1 pb-1">
                  <label className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors group relative" title="Add References">
                    <SafeIcon icon={FiImage} className="w-5 h-5" />
                    <input type="file" multiple accept="image/*" onChange={(e) => handleImageUpload(e, 'reference')} className="hidden" />
                  </label>
                </div>

                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerate())}
                  placeholder="Describe your video idea..."
                  className="flex-1 bg-transparent max-h-[140px] min-h-[44px] py-2.5 text-sm text-white placeholder-zinc-500 resize-none outline-none scrollbar-hide leading-relaxed"
                  rows={1}
                />

                <div className="flex gap-1 pb-1">
                  {/* Frame Controls */}
                  <label className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 cursor-pointer transition-colors" title="Start Frame">
                    <span className="text-[10px] font-bold border border-zinc-700 px-1.5 py-0.5 rounded hover:border-white transition-colors">Start</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'start')} className="hidden" />
                  </label>
                  <label className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 cursor-pointer transition-colors" title="End Frame">
                    <span className="text-[10px] font-bold border border-zinc-700 px-1.5 py-0.5 rounded hover:border-white transition-colors">End</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'end')} className="hidden" />
                  </label>
                </div>

                <div className="pb-0.5">
                  <button
                    onClick={() => handleGenerate()}
                    disabled={loading || (!prompt.trim() && referenceImages.length === 0)}
                    className={`
                      w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                      ${loading || (!prompt.trim() && referenceImages.length === 0)
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/10'
                      }
                    `}
                  >
                    {loading ? (
                      <SafeIcon icon={FiLoader} className="w-5 h-5 animate-spin" />
                    ) : (
                      <SafeIcon icon={FiSend} className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Video Modal */}
      <AnimatePresence>
        {scheduleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setScheduleModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Scrollable Content */}
              <div className="overflow-y-auto scrollbar-hide flex-1 -mr-4 pr-4">

                {/* Header */}
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#09090b] z-10 pb-4 border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                      <SafeIcon icon={FiVideo} className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Schedule Reel</h3>
                      <p className="text-xs text-zinc-400 font-medium">Post to Instagram as a Reel</p>
                    </div>
                  </div>
                  <button onClick={() => setScheduleModal(null)} className="p-2 text-zinc-500 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                    <SafeIcon icon={FiX} className="w-5 h-5" />
                  </button>
                </div>

                {/* Account Selection */}
                <div className="mb-6">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">
                    Instagram Account
                  </label>
                  {socialAccounts.length > 0 ? (
                    <PremiumSelect
                      options={socialAccounts.map(acc => ({ value: acc.accountId, label: `@${acc.instagramUsername || acc.pageName}` }))}
                      value={selectedAccount}
                      onChange={setSelectedAccount}
                      icon={FiInstagram}
                      placeholder="Select Account"
                    />
                  ) : (
                    <p className="text-xs text-amber-400 bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-500/20">
                      No Instagram accounts connected. Go to Settings to connect.
                    </p>
                  )}
                </div>

                {/* Caption Tone Selector */}
                <div className="mb-6">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Caption Tone</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'brand', label: 'Brand', desc: 'Minimal' },
                      { value: 'creator', label: 'Creator', desc: 'Engaging' },
                      { value: 'marketing', label: 'Marketing', desc: 'CTA-Heavy' },
                    ].map((t) => (
                      <button
                        key={t.value}
                        onClick={() => {
                          setCaptionTone(t.value);
                          generateViralCaption(scheduleModal?.prompt, scheduleModal?.videoUrl, t.value);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${captionTone === t.value
                          ? 'border-white bg-white text-black'
                          : 'border-white/10 bg-zinc-900 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                          }`}
                      >
                        <div className="text-xs font-bold mb-0.5">{t.label}</div>
                        <div className={`text-[10px] ${captionTone === t.value ? 'opacity-70' : 'opacity-50'}`}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">
                      Date
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={scheduleDate}
                        onChange={(date) => setScheduleDate(date)}
                        className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:border-white/30 focus:outline-none transition-colors cursor-pointer"
                        dateFormat="MMMM d, yyyy"
                        minDate={new Date()}
                        placeholderText="Select Date"
                        wrapperClassName="w-full"
                        popperProps={{
                          strategy: 'fixed'
                        }}
                      />
                      <SafeIcon icon={FiCalendar} className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">
                      Time
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={scheduleTime}
                        onChange={(date) => setScheduleTime(date)}
                        showTimeSelect
                        showTimeSelectOnly
                        timeIntervals={15}
                        timeCaption="Time"
                        dateFormat="h:mm aa"
                        className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:border-white/30 focus:outline-none transition-colors cursor-pointer"
                        wrapperClassName="w-full"
                        popperProps={{
                          strategy: 'fixed'
                        }}
                      />
                      <SafeIcon icon={FiClock} className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Caption */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      Caption & Hashtags
                      {viralContent?.viralScore && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-white text-black font-bold rounded">
                          Score: {viralContent.viralScore}/10
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => generateViralCaption(scheduleModal?.prompt)}
                      disabled={isGeneratingCaption}
                      className="text-[10px] font-bold text-white hover:text-zinc-300 flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider"
                    >
                      <SafeIcon icon={isGeneratingCaption ? FiLoader : FiRefreshCw} className={`w-3 h-3 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                      {isGeneratingCaption ? 'Generating' : 'Regenerate'}
                    </button>
                  </div>
                  <textarea
                    value={scheduleCaption}
                    onChange={(e) => setScheduleCaption(e.target.value)}
                    placeholder={isGeneratingCaption ? 'Generating viral caption...' : 'Caption for your Reel'}
                    rows={4}
                    className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm resize-none focus:border-white/30 focus:outline-none placeholder:text-zinc-600 leading-relaxed"
                  />
                  {viralContent?.tips && (
                    <div className="mt-3 p-3 bg-zinc-900/50 rounded-xl border border-white/5">
                      <p className="text-[10px] text-white font-bold uppercase mb-2 flex items-center gap-1.5">
                        <SafeIcon icon={FiZap} className="w-3 h-3" /> Viral Tips
                      </p>
                      <ul className="text-xs text-zinc-400 space-y-1">
                        {viralContent.tips.slice(0, 3).map((tip, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-white">•</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-white/5 mt-auto bg-[#09090b]">
                <button
                  onClick={() => setScheduleModal(null)}
                  className="flex-1 px-6 py-4 bg-zinc-900 text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-800 hover:text-white transition-colors border border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleVideo}
                  disabled={isScheduling || !socialAccounts.length}
                  className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 bg-white text-black rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]"
                >
                  {isScheduling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <SafeIcon icon={FiCheck} className="w-3.5 h-3.5" />
                      Schedule Reel
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoChatPage;
