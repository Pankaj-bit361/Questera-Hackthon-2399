import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { imageAPI } from '../lib/api';

// Components
import Sidebar from './Sidebar';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import ProjectSettings from './chat/ProjectSettings';
import { DEFAULT_PROJECT_SETTINGS } from './chat/constants';

const { FiMenu, FiSettings, FiShare2, FiCheck, FiChevronLeft } = FiIcons;

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
  const [chatTitle, setChatTitle] = useState('New Creation');
  const [shareCopied, setShareCopied] = useState(false);

  // Project settings
  const [projectSettings, setProjectSettings] = useState({ ...DEFAULT_PROJECT_SETTINGS });
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-message overrides
  const [messageOverrides, setMessageOverrides] = useState({
    aspectRatio: null,
    imageSize: null,
    style: null,
  });

  const [referenceImages, setReferenceImages] = useState([]);
  const hasInitialized = useRef(false);

  // Initialize Chat
  useEffect(() => {
    if (chatId === 'new' && !hasInitialized.current) {
      const initialPrompt = location.state?.prompt;
      if (initialPrompt) {
        hasInitialized.current = true;
        setLoadingChat(false);
        generateImage(initialPrompt, null);
      } else {
        setLoadingChat(false);
      }
    } else if (chatId && chatId !== 'new') {
      fetchConversation();
    } else {
      setLoadingChat(false);
    }
  }, [chatId]);

  const fetchConversation = async () => {
    try {
      setLoadingChat(true);
      const data = await imageAPI.getConversation(chatId);
      setMessages(data.messages || []);
      setChatTitle(data.name || data.title || 'Untitled Creation');
      setCurrentChatId(chatId);

      if (data.imageSettings) {
        setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, ...data.imageSettings });
      }
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
    } finally {
      setLoadingChat(false);
    }
  };

  const generateImage = async (userPrompt, existingChatId) => {
    setLoading(true);

    // Prepare overrides
    const overrides = {};
    if (messageOverrides.aspectRatio) overrides.aspectRatio = messageOverrides.aspectRatio;
    if (messageOverrides.imageSize) overrides.imageSize = messageOverrides.imageSize;
    if (messageOverrides.style) overrides.style = messageOverrides.style;

    if (referenceImages.length > 0) {
      overrides.images = referenceImages.map(img => ({
        data: img.data,
        mimeType: img.mimeType
      }));
    }

    const tempUserMsg = { role: 'user', content: userPrompt, referenceImages: referenceImages.map(r => r.preview) };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.userId) throw new Error('User not logged in');

      const data = await imageAPI.generate({
        prompt: userPrompt,
        userId: user.userId,
        imageChatId: existingChatId,
        ...overrides,
      });

      if (!existingChatId && data.imageChatId) {
        setCurrentChatId(data.imageChatId);
        setChatTitle(userPrompt.slice(0, 30) + '...');
        navigate(`/chat/${data.imageChatId}`, { replace: true });
      }

      const aiMsg = {
        role: 'assistant',
        content: data.textResponse || (data.images?.length > 0 ? "Here is your generated image." : "I couldn't generate that."),
        imageUrl: data.imageUrl || (data.images && data.images[0]?.url),
      };
      setMessages(prev => [...prev, aiMsg]);

      setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
      setReferenceImages([]);
    } catch (error) {
      console.error('Failed to generate:', error);
      const errorMsg = { role: 'assistant', content: "Sorry, I encountered an error while generating the image. Please try again." };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!prompt.trim() || loading) return;
    const userPrompt = prompt.trim();
    setPrompt('');
    generateImage(userPrompt, currentChatId !== 'new' ? currentChatId : null);
  };

  const saveProjectSettings = async () => {
    if (!currentChatId || currentChatId === 'new') {
      alert('Please generate an image first to create a project.');
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

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden relative selection:bg-white/20">
      
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
      <div className="flex-1 flex flex-col relative h-full w-full max-w-[2000px] mx-auto">
        
        {/* Header - Floating & Premium */}
        <header className="absolute top-0 left-0 right-0 z-30 px-6 py-5 flex items-center justify-between pointer-events-none bg-gradient-to-b from-[#050505] via-[#050505]/80 to-transparent">
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
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md border border-white/5 hover:border-white/10"
            >
              <SafeIcon icon={shareCopied ? FiCheck : FiShare2} className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{shareCopied ? 'Copied' : 'Share'}</span>
            </button>
            <button
              onClick={() => setShowProjectSettings(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-lg shadow-white/5"
            >
              <SafeIcon icon={FiSettings} className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden relative bg-[#050505]">
          {/* Subtle Ambient Background */}
          <div className="absolute top-[10%] left-[30%] w-[40%] h-[40%] bg-indigo-900/5 rounded-full blur-[150px] pointer-events-none"></div>
          
          <MessageList messages={messages} loading={loading} />
        </div>

        {/* Input Area - Fixed Bottom with Gradient Fade */}
        <div className="relative z-30 px-4 sm:px-6 md:px-8 pb-6 pt-12 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              prompt={prompt}
              setPrompt={setPrompt}
              onSend={handleSend}
              loading={loading}
              overrides={messageOverrides}
              onUpdateOverride={(key, val) => setMessageOverrides(p => ({ ...p, [key]: val }))}
              referenceImages={referenceImages}
              onAddImage={(img) => setReferenceImages(p => [...p, img])}
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
        
      </div>
    </div>
  );
};

export default ChatPage;