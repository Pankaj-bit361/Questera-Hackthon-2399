import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { API_BASE_URL } from '../config';
import { getUserId, getUser } from '../lib/velosStorage';
import { videoAPI, instagramAPI } from '../lib/api';

const { FiChevronLeft, FiSend, FiVideo, FiImage, FiX, FiLoader, FiPlay, FiPlus, FiFilm, FiChevronDown, FiChevronUp, FiMaximize2, FiDownload, FiCalendar, FiClock, FiInstagram, FiRefreshCw, FiCheck, FiZap } = FiIcons;

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
          className="mt-2 flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
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
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [viralContent, setViralContent] = useState(null);
  const [captionTone, setCaptionTone] = useState('brand'); // 'brand', 'creator', 'marketing'

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
    setScheduleDate(tomorrow.toISOString().split('T')[0]);
    setScheduleTime('09:00');
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
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
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
    setExtendingVideo(null); // Clear extending state

    // Reset inputs
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    console.log('[VideoChatPage] Generating video with:', {
      prompt: inputPrompt,
      refsCount: inputRefs.length,
      hasStartFrame: !!inputStartFrame,
      hasEndFrame: !!inputEndFrame,
      extendingFrom: videoToExtend ? 'yes' : 'no',
    });

    try {
      // Prepare body - send base64 data directly
      const body = {
        userId,
        prompt: inputPrompt,
        videoChatId: currentChatId === 'new' ? undefined : currentChatId,
        // Send base64 data for images
        referenceImages: inputRefs.map(img => ({
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        })),
      };

      // Add start frame with base64 data
      if (inputStartFrame?.data) {
        body.startFrame = {
          data: inputStartFrame.data,
          mimeType: inputStartFrame.mimeType || 'image/png',
        };
      }

      // Add end frame with base64 data
      if (inputEndFrame?.data) {
        body.endFrame = {
          data: inputEndFrame.data,
          mimeType: inputEndFrame.mimeType || 'image/png',
        };
      }

      // Add video to extend
      if (videoToExtend) {
        body.lastVideoUrl = videoToExtend;
      }

      const res = await fetch(`${API_BASE_URL}/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        if (currentChatId === 'new' && data.videoChatId) {
          setCurrentChatId(data.videoChatId);
          navigate(`/video/${data.videoChatId}`, { replace: true });
        }

        // Add assistant message
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
    <div className="min-h-screen bg-[#09090b] text-white flex overflow-hidden font-sans selection:bg-purple-500/30">
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
      <div className="flex-1 flex flex-col h-screen relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/20 via-[#09090b] to-[#09090b]">

        {/* Header */}
        <header className="absolute top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <SafeIcon icon={FiFilm} className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h1 className="text-sm font-medium text-white tracking-wide">Video Gen</h1>
                <p className="text-[10px] text-zinc-500 font-mono">Veo 3.1 Model</p>
              </div>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-20 scrollbar-hide">
          <div className="max-w-4xl mx-auto space-y-6">
            <AnimatePresence mode="popLayout">
              {messages.length === 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/5">
                    <SafeIcon icon={FiVideo} className="w-6 h-6 text-zinc-400" />
                  </div>
                  <h2 className="text-3xl font-semibold text-white mb-3 tracking-tight">
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
                    max-w-2xl rounded-2xl p-4 relative overflow-hidden
                    ${msg.role === 'user'
                      ? 'bg-zinc-800/80 text-white'
                      : 'bg-zinc-900/50 border border-white/5 backdrop-blur-sm'
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
                          <div className="rounded-lg overflow-hidden bg-black/50 border border-white/5">
                            <video
                              src={msg.videoUrl}
                              controls
                              className="w-full h-auto rounded-lg max-h-[400px]"
                            />
                          </div>
                          {/* Video action buttons */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <button
                              onClick={() => handleExtendVideo(msg.videoUrl)}
                              disabled={loading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <SafeIcon icon={FiMaximize2} className="w-3 h-3" />
                              Extend
                            </button>
                            <button
                              onClick={() => openScheduleModal(msg.videoUrl, msg.content, idx)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg transition-all"
                            >
                              <SafeIcon icon={FiCalendar} className="w-3 h-3" />
                              Schedule
                            </button>
                            <a
                              href={msg.videoUrl}
                              download
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/20 rounded-lg transition-all"
                            >
                              <SafeIcon icon={FiDownload} className="w-3 h-3" />
                              Download
                            </a>
                          </div>
                        </div>
                      )}

                      {msg.status === 'processing' && (
                        <div className="flex items-center gap-2 text-purple-400 bg-purple-500/5 px-3 py-2 rounded-lg border border-purple-500/10 mt-2">
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
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl px-4 py-3 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <div className="relative w-4 h-4">
                        <span className="absolute inset-0 rounded-full border border-zinc-600"></span>
                        <span className="absolute inset-0 rounded-full border-t border-white animate-spin"></span>
                      </div>
                      <span className="text-xs text-zinc-400">Processing video...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className="relative z-40">
          {/* Floating Input Container */}
          <div className="w-full max-w-3xl mx-auto px-4 pb-8 pt-0">
            <div className={`
                relative bg-[#18181b] border transition-all duration-300 rounded-[20px] overflow-hidden shadow-2xl
                ${isInputFocused ? 'border-zinc-700 shadow-xl' : 'border-white/5 shadow-lg'}
              `}>

              {/* Extending Video Indicator */}
              {extendingVideo && (
                <div className="px-3 pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <SafeIcon icon={FiMaximize2} className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-purple-300 font-medium">Extending video...</span>
                    </div>
                    <button
                      onClick={cancelExtend}
                      className="p-1 text-purple-400 hover:text-purple-200 hover:bg-purple-500/20 rounded transition-colors"
                    >
                      <SafeIcon icon={FiX} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Active References Preview Bar */}
              {(referenceImages.length > 0 || startFrame || endFrame) && (
                <div className="px-3 pt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {startFrame && (
                    <div className="relative flex-shrink-0 group">
                      <div className="absolute -top-1.5 left-0 z-10 bg-green-900/80 text-green-200 border border-green-700 text-[9px] font-medium px-1.5 py-0.5 rounded tracking-wide">Start</div>
                      <img src={startFrame.preview} className="w-12 h-12 object-cover rounded-md border border-white/10" />
                      <button onClick={() => removeImage(0, 'start')} className="absolute -top-1 -right-1 bg-zinc-800 text-zinc-400 hover:text-white rounded-full p-0.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {endFrame && (
                    <div className="relative flex-shrink-0 group">
                      <div className="absolute -top-1.5 left-0 z-10 bg-blue-900/80 text-blue-200 border border-blue-700 text-[9px] font-medium px-1.5 py-0.5 rounded tracking-wide">End</div>
                      <img src={endFrame.preview} className="w-12 h-12 object-cover rounded-md border border-white/10" />
                      <button onClick={() => removeImage(0, 'end')} className="absolute -top-1 -right-1 bg-zinc-800 text-zinc-400 hover:text-white rounded-full p-0.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {referenceImages.map((img, i) => (
                    <div key={i} className="relative flex-shrink-0 group">
                      <img src={img.preview} className="w-12 h-12 object-cover rounded-md border border-white/10" />
                      <button onClick={() => removeImage(i)} className="absolute -top-1 -right-1 bg-zinc-800 text-zinc-400 hover:text-white rounded-full p-0.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 p-2">
                <div className="flex gap-0.5 pb-1">
                  <label className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors group relative" title="Add References">
                    <SafeIcon icon={FiImage} className="w-4 h-4" />
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
                  placeholder="Describe your video..."
                  className="flex-1 bg-transparent max-h-[120px] min-h-[40px] py-2.5 text-sm text-white placeholder-zinc-500 resize-none outline-none scrollbar-hide"
                  rows={1}
                />

                <div className="flex gap-0.5 pb-1">
                  {/* Frame Controls */}
                  <label className="p-2 rounded-lg text-zinc-400 hover:text-green-400 hover:bg-white/5 cursor-pointer transition-colors" title="Start Frame">
                    <span className="text-[10px] font-medium border border-zinc-700 px-1 rounded hover:border-green-500/50 transition-colors">Start</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'start')} className="hidden" />
                  </label>
                  <label className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-white/5 cursor-pointer transition-colors" title="End Frame">
                    <span className="text-[10px] font-medium border border-zinc-700 px-1 rounded hover:border-blue-500/50 transition-colors">End</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'end')} className="hidden" />
                  </label>
                </div>

                <div className="pb-0.5">
                  <button
                    onClick={() => handleGenerate()}
                    disabled={loading || (!prompt.trim() && referenceImages.length === 0)}
                    className={`
                      w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200
                      ${loading || (!prompt.trim() && referenceImages.length === 0)
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-zinc-200'
                      }
                    `}
                  >
                    {loading ? (
                      <SafeIcon icon={FiLoader} className="w-4 h-4 animate-spin" />
                    ) : (
                      <SafeIcon icon={FiSend} className="w-4 h-4" />
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
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setScheduleModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-white/5 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-[50px] pointer-events-none" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <SafeIcon icon={FiVideo} className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Schedule Reel</h3>
                    <p className="text-xs text-zinc-500">Post to Instagram as a Reel</p>
                  </div>
                </div>
                <button onClick={() => setScheduleModal(null)} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <SafeIcon icon={FiX} className="w-5 h-5" />
                </button>
              </div>

              {/* Account Selection */}
              <div className="mb-4">
                <label className="text-xs text-zinc-400 mb-2 flex items-center gap-1">
                  <SafeIcon icon={FiInstagram} className="w-3 h-3" />
                  Instagram Account
                </label>
                {socialAccounts.length > 0 ? (
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none"
                  >
                    {socialAccounts.map(acc => (
                      <option key={acc.accountId} value={acc.accountId}>
                        @{acc.instagramUsername || acc.pageName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
                    No Instagram accounts connected. Go to Settings to connect.
                  </p>
                )}
              </div>

              {/* Caption Tone Selector */}
              <div className="mb-4">
                <label className="text-xs text-zinc-400 mb-2 block">Caption Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'brand', label: '🏢 Brand', desc: 'Professional, minimal' },
                    { value: 'creator', label: '🎨 Creator', desc: 'Casual, engaging' },
                    { value: 'marketing', label: '📢 Marketing', desc: 'CTA-focused' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setCaptionTone(t.value);
                        generateViralCaption(scheduleModal?.prompt, scheduleModal?.videoUrl, t.value);
                      }}
                      className={`p-2 rounded-xl border text-left transition-all ${captionTone === t.value
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/20'
                        }`}
                    >
                      <div className="text-xs font-medium">{t.label}</div>
                      <div className="text-[10px] opacity-60">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-2 flex items-center gap-1">
                    <SafeIcon icon={FiCalendar} className="w-3 h-3" />
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-2 flex items-center gap-1">
                    <SafeIcon icon={FiClock} className="w-3 h-3" />
                    Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Caption */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-400 flex items-center gap-1">
                    Caption & Hashtags
                    {viralContent?.viralScore && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded">
                        Viral Score: {viralContent.viralScore}/10
                      </span>
                    )}
                  </label>
                  <button
                    onClick={() => generateViralCaption(scheduleModal?.prompt)}
                    disabled={isGeneratingCaption}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <SafeIcon icon={isGeneratingCaption ? FiLoader : FiRefreshCw} className={`w-3 h-3 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                    {isGeneratingCaption ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>
                <textarea
                  value={scheduleCaption}
                  onChange={(e) => setScheduleCaption(e.target.value)}
                  placeholder={isGeneratingCaption ? 'Generating viral caption...' : 'Caption for your Reel'}
                  rows={5}
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm resize-none focus:border-cyan-500/50 focus:outline-none placeholder:text-zinc-600"
                />
                {viralContent?.tips && (
                  <div className="mt-2 p-2 bg-zinc-900/50 rounded-lg border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 flex items-center gap-1">
                      <SafeIcon icon={FiZap} className="w-3 h-3" /> Viral Tips
                    </p>
                    <ul className="text-xs text-zinc-400 space-y-0.5">
                      {viralContent.tips.slice(0, 3).map((tip, i) => (
                        <li key={i}>• {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setScheduleModal(null)}
                  className="flex-1 px-4 py-3 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleVideo}
                  disabled={isScheduling || !socialAccounts.length}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  {isScheduling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
