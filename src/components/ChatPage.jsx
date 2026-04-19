import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import { toast } from 'react-toastify';
import SafeIcon from '../common/SafeIcon';
import { imageAPI, geminiAPI, creditsAPI } from '../lib/api';
import { getUserId, getUser } from '../lib/velosStorage';

// Components
import Sidebar from './Sidebar';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import ProjectSettings from './chat/ProjectSettings';
import AutopilotSettings from './chat/AutopilotSettings';
import { DEFAULT_PROJECT_SETTINGS } from './chat/constants';

const { FiMenu, FiSettings, FiShare2, FiCheck, FiChevronLeft, FiZap } = FiIcons;

const ChatPage = () => {
  const { chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // State
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(true);
  const [currentChatId, setCurrentChatId] = useState(chatId);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showAutopilotSettings, setShowAutopilotSettings] = useState(false);
  const [chatTitle, setChatTitle] = useState('New Creation');
  const [shareCopied, setShareCopied] = useState(false);

  // Project settings
  const [projectSettings, setProjectSettings] = useState({ ...DEFAULT_PROJECT_SETTINGS });
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-message overrides (nulls mean "use project setting")
  const [messageOverrides, setMessageOverrides] = useState({
    aspectRatio: null,
    imageSize: null,
    style: null,
    useGoogleSearch: null,
    useImageSearch: null,
  });

  const [referenceImages, setReferenceImages] = useState([]);
  const hasInitialized = useRef(false);
  const skipNextFetch = useRef(false); // Set to true after navigating from 'new' to avoid re-fetching

  // Selected image for editing - user can click an image to select it for the next edit
  const [selectedImageForEdit, setSelectedImageForEdit] = useState(null); // { url, idx }

  // Credits state
  const [credits, setCredits] = useState({ balance: 0, plan: 'free', planName: 'Free' });

  // Agent history — text-only turns for the routing agent (grows every turn)
  const [agentHistory, setAgentHistory] = useState([]);
  // Gemini history — full image turns with inlineData + thoughtSignature (grows on image turns only)
  const [geminiHistory, setGeminiHistory] = useState([]);

  // Loading status for UI feedback (passed to MessageList fallback)
  const [streamingStatus] = useState(null);

  // Fetch user's credits
  const fetchCredits = async () => {
    try {
      const userId = getUserId();
      if (!userId) return;
      const data = await creditsAPI.getCredits(userId);
      if (data.success) {
        setCredits({ balance: data.credits.balance, plan: data.credits.plan, planName: data.credits.planName });
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  // Initialize Chat
  useEffect(() => {
    fetchCredits(); // Fetch credits on mount
    if (chatId === 'new' && !hasInitialized.current) {
      const initialPrompt = location.state?.prompt;
      const initialImages = location.state?.referenceImages || [];

      // Set reference images if passed from HomePage
      if (initialImages.length > 0) {
        setReferenceImages(initialImages);
      }

      if (initialPrompt || initialImages.length > 0) {
        hasInitialized.current = true;
        setLoadingChat(false);
        if (initialPrompt) {
          generateDirect(initialPrompt, null, initialImages);
        }
      } else {
        setLoadingChat(false);
      }
    } else if (chatId && chatId !== 'new') {
      if (skipNextFetch.current) {
        skipNextFetch.current = false;
        setLoadingChat(false);
      } else {
        fetchConversation();
      }
    } else {
      setLoadingChat(false);
    }
  }, [chatId]);

  const fetchConversation = async () => {
    try {
      setLoadingChat(true);
      const data = await imageAPI.getConversation(chatId);
      const msgs = data.messages || [];
      setMessages(msgs);
      setChatTitle(data.name || data.title || 'Untitled Creation');
      setCurrentChatId(chatId);

      // Restore agentHistory from saved messages (text-only, for routing context)
      const restored = msgs
        .filter(m => m.content?.trim())
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      setAgentHistory(restored);

      if (data.imageSettings) {
        setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, ...data.imageSettings });
      }
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
    } finally {
      setLoadingChat(false);
    }
  };

  // Ref to prevent duplicate requests
  const requestInFlightRef = useRef(false);

  const generateDirect = async (userPrompt, existingChatId, initialImages = null) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true);

    const imagesToUse = initialImages !== null && initialImages !== undefined ? initialImages : referenceImages;
    const refImagesForApi = imagesToUse.map(img => ({ data: img.data, mimeType: img.mimeType }));

    // Find last image URL BEFORE adding temp user message (edit fallback)
    const lastImageUrl = selectedImageForEdit?.url ||
      messages.filter(m => m.role === 'assistant' && m.imageUrl).at(-1)?.imageUrl || null;

    const tempUserMsg = { role: 'user', content: userPrompt, referenceImages: imagesToUse.map(r => r.preview) };
    setMessages(prev => [...prev, tempUserMsg]);
    setSelectedImageForEdit(null);

    const placeholderId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true,
      streamingId: placeholderId,
      streamingMessage: 'Thinking...',
    }]);

    // Progressive status stages — cycles through messages while waiting
    const stages = [
      { delay: 1500, message: 'Understanding your request...' },
      { delay: 3500, message: 'Generating image...' },
      { delay: 8000, message: 'Refining details...' },
      { delay: 16000, message: 'Almost there...' },
      { delay: 28000, message: 'Finalizing...' },
    ];
    const stageTimers = stages.map(({ delay, message }) =>
      setTimeout(() => {
        setMessages(prev => prev.map(m =>
          m.streamingId === placeholderId ? { ...m, streamingMessage: message } : m
        ));
      }, delay)
    );
    const clearStages = () => stageTimers.forEach(clearTimeout);

    try {
      const user = getUser();
      if (!user?.userId) throw new Error('User not logged in');

      const data = await geminiAPI.agent({
        message: userPrompt,
        userId: user.userId,
        imageChatId: existingChatId || null,
        agentHistory: agentHistory.slice(-30),    // last 15 turns (intent context)
        geminiHistory: geminiHistory.slice(-14),  // last 7 image turns (user + model pairs)
        images: refImagesForApi,
        lastImageUrl,
        model: projectSettings.model || 'flash',
        thinkingLevel: projectSettings.thinkingLevel || 'minimal',
        aspectRatio: messageOverrides.aspectRatio || (projectSettings.aspectRatio !== 'auto' ? projectSettings.aspectRatio : undefined),
        imageSize: messageOverrides.imageSize || projectSettings.imageSize || '2K',
        useGoogleSearch: messageOverrides.useGoogleSearch || false,
        useImageSearch: messageOverrides.useImageSearch || false,
      });

      if (data.error) throw new Error(data.error);

      if (!existingChatId && data.imageChatId) {
        setCurrentChatId(data.imageChatId);
        setChatTitle(userPrompt.slice(0, 30) + '...');
        skipNextFetch.current = true;
        navigate(`/chat/${data.imageChatId}`, { replace: true });
      }

      // Always update agentHistory (text turns — every interaction)
      if (data.agentTurn) {
        setAgentHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: userPrompt }] },
          data.agentTurn,
        ]);
      }

      // Only update geminiHistory when an image was generated/edited
      if (data.geminiTurn) {
        setGeminiHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: userPrompt }] },
          data.geminiTurn,  // full parts with inlineData + thoughtSignature
        ]);
      }

      clearStages();

      // Replace placeholder with final message
      setMessages(prev => prev.map(m =>
        m.streamingId === placeholderId
          ? {
              role: 'assistant',
              content: data.text || (data.imageUrl ? 'Here is your image!' : 'How can I help you?'),
              imageUrl: data.imageUrl || null,
              variations: data.intent === 'create_variations' ? data.variations : null,
              isScheduled: data.intent === 'schedule_post',
              // Account picker for multi-account scheduling
              selectAccount: data.intent === 'select_account' ? {
                accounts: data.accounts,
                pendingPost: data.pendingPost,
              } : null,
              isStreaming: false,
            }
          : m
      ));

      setMessageOverrides({ aspectRatio: null, imageSize: null, style: null, useGoogleSearch: null, useImageSearch: null });
      setReferenceImages([]);
      fetchCredits();
    } catch (error) {
      clearStages();
      console.error('Agent error:', error);
      const isCredits = error.code === 'INSUFFICIENT_CREDITS';
      const errorMsg = isCredits
        ? error.message
        : 'Sorry, something went wrong. Please try again.';
      if (isCredits) toast.error(error.message);
      setMessages(prev => prev.map(m =>
        m.streamingId === placeholderId
          ? { role: 'assistant', content: errorMsg, isStreaming: false, isError: true }
          : m
      ));
      setMessageOverrides({ aspectRatio: null, imageSize: null, style: null, useGoogleSearch: null, useImageSearch: null });
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  };


  const handleSend = () => {
    if (!prompt.trim() || loading) return;
    const userPrompt = prompt.trim();
    setPrompt('');

    const currentRefImages = [...referenceImages];
    console.log('📤 [HANDLE-SEND] Sending with referenceImages:', currentRefImages.length, currentRefImages);

    generateDirect(userPrompt, currentChatId !== 'new' ? currentChatId : null, currentRefImages);
  };

  // Handle Quick Action suggestion clicks
  const handleSuggestionClick = (suggestion) => {
    if (loading) return;
    generateDirect(suggestion, currentChatId !== 'new' ? currentChatId : null, []);
  };

  const saveProjectSettings = async () => {
    if (!currentChatId || currentChatId === 'new') {
      toast.warning('Please generate an image first to create a project.');
      return;
    }
    setSavingSettings(true);
    try {
      await imageAPI.updateProjectSettings(currentChatId, projectSettings);
      setShowProjectSettings(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleDeleteMessage = async (messageId, idx) => {
    if (!confirm('Delete this message?')) return;

    try {
      const result = await imageAPI.deleteMessage(messageId);
      if (result.success) {
        // Remove the message from local state
        setMessages(prev => prev.filter((_, i) => i !== idx));
      } else {
        toast.error('Failed to delete message: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message');
    }
  };

  return (
    <div className="flex h-screen bg-[#000000] text-white font-sans overflow-hidden relative selection:bg-white/20">

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

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full w-full max-w-[2000px] mx-auto bg-[#09090b]">

        {/* Header - Floating & Premium */}
        <header className="absolute top-0 left-0 right-0 z-30 px-6 py-5 flex items-center justify-between pointer-events-none bg-gradient-to-b from-[#09090b] via-[#09090b]/90 to-transparent">
          <div className="flex items-center gap-4 pointer-events-auto">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="lg:hidden text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
              <SafeIcon icon={FiMenu} className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <button onClick={() => navigate('/home')} className="lg:hidden text-zinc-500 hover:text-white transition-colors">
                  <SafeIcon icon={FiChevronLeft} className="w-4 h-4" />
                </button>
                <h1 className="text-sm font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-md cursor-default">
                  {chatTitle}
                </h1>
              </div>
              <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest pl-6 lg:pl-0 mt-0.5">
                Velos XL 1.0 • {projectSettings.aspectRatio === 'auto' ? 'Auto Ratio' : projectSettings.aspectRatio}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-white hover:border-white/20 transition-all backdrop-blur-md shadow-lg shadow-black/20"
            >
              <SafeIcon icon={shareCopied ? FiCheck : FiShare2} className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{shareCopied ? 'Copied' : 'Share'}</span>
            </button>
            <button
              onClick={() => setShowAutopilotSettings(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs font-bold text-white hover:bg-white hover:text-black transition-all group shadow-lg shadow-black/20"
            >
              <SafeIcon icon={FiZap} className="w-3.5 h-3.5 group-hover:text-black transition-colors" />
              <span className="hidden sm:inline">Autopilot</span>
            </button>
            <button
              onClick={() => setShowProjectSettings(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]"
            >
              <SafeIcon icon={FiSettings} className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden relative bg-[#09090b]">
          <MessageList
            messages={messages}
            loading={loading}
            streamingStatus={streamingStatus}
            onDeleteMessage={handleDeleteMessage}
            selectedImageForEdit={selectedImageForEdit}
            onSelectImageForEdit={(url, idx) => setSelectedImageForEdit({ url, idx })}
            onClearSelectedImage={() => setSelectedImageForEdit(null)}
            onSuggestionClick={handleSuggestionClick}
            onScheduleConfirmed={(username, scheduledAt, imageUrl) => {
              const time = new Date(scheduledAt).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
              });
              const summary = `[schedule_post] Scheduled image (${imageUrl}) to @${username} for ${time}`;
              setAgentHistory(prev => [...prev, { role: 'model', parts: [{ text: summary }] }]);
            }}
          />
        </div>

        {/* Input Area - Fixed Bottom with Gradient Fade */}
        <div className="relative z-30 px-4 sm:px-6 md:px-8 pb-6 pt-2 bg-[#09090b]">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              prompt={prompt}
              setPrompt={setPrompt}
              onSend={handleSend}
              loading={loading}
              overrides={messageOverrides}
              onUpdateOverride={(key, val) => setMessageOverrides(p => ({ ...p, [key]: val }))}
              referenceImages={referenceImages}
              onAddImage={(img) => {
                console.log('📎 [ADD-IMAGE] User uploaded image, mimeType:', img.mimeType, 'dataLength:', img.data?.length);
                setReferenceImages(prev => [...prev, img]);
              }}
              onRemoveImage={(idx) => setReferenceImages(p => p.filter((_, i) => i !== idx))}
            />
          </div>
        </div>

        {/* Settings Sidebar */}
        <ProjectSettings
          isOpen={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
          settings={projectSettings}
          onUpdate={(key, val) => setProjectSettings(p => ({ ...p, [key]: val }))}
          onSave={saveProjectSettings}
          saving={savingSettings}
        />

        {/* Autopilot Settings */}
        <AutopilotSettings
          isOpen={showAutopilotSettings}
          onClose={() => setShowAutopilotSettings(false)}
          chatId={currentChatId}
        />

      </div>
    </div>
  );
};

export default ChatPage;