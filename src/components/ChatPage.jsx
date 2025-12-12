import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import { toast } from 'react-toastify';
import SafeIcon from '../common/SafeIcon';
import { imageAPI, agentAPI, creditsAPI } from '../lib/api';

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

  // Selected image for editing - user can click an image to select it for the next edit
  const [selectedImageForEdit, setSelectedImageForEdit] = useState(null); // { url, idx }

  // Credits state
  const [credits, setCredits] = useState({ balance: 0, plan: 'free', planName: 'Free' });

  // Fetch user's credits
  const fetchCredits = async () => {
    try {
      const userId = localStorage.getItem('userId');
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
        // Use Agent for all generation - unified path to avoid duplicate scheduling
        if (initialPrompt) {
          generateWithAgent(initialPrompt, null, initialImages);
        }
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

  const generateImage = async (userPrompt, existingChatId, initialImages = null) => {
    setLoading(true);

    // Prepare overrides
    const overrides = {};
    if (messageOverrides.aspectRatio) overrides.aspectRatio = messageOverrides.aspectRatio;
    if (messageOverrides.imageSize) overrides.imageSize = messageOverrides.imageSize;
    if (messageOverrides.style) overrides.style = messageOverrides.style;

    // Use initialImages if provided (from handleSend or HomePage navigation), otherwise use referenceImages state
    // IMPORTANT: If initialImages is an array (even empty), use it. Only fall back to state if null/undefined.
    const imagesToUse = initialImages !== null && initialImages !== undefined ? initialImages : referenceImages;
    const refImagesForApi = imagesToUse.map(img => ({
      data: img.data,
      mimeType: img.mimeType
    }));

    console.log('🔍 [GENERATE-START] initialImages:', initialImages?.length ?? 'null/undefined');
    console.log('🔍 [GENERATE-START] referenceImages state:', referenceImages.length);
    console.log('🔍 [GENERATE-START] imagesToUse:', imagesToUse.length);
    console.log('🔍 [GENERATE-START] refImagesForApi:', refImagesForApi);
    if (refImagesForApi.length > 0) {
      console.log('🔍 [GENERATE-START] First image data length:', refImagesForApi[0]?.data?.length);
    }

    // Use selected image if available, otherwise fall back to last generated image
    // IMPORTANT: Find the last image BEFORE adding the new user message to state
    let imageUrlForEdit = selectedImageForEdit?.url || null;
    if (!imageUrlForEdit) {
      // Fall back to last generated image - search in reverse
      const assistantMessages = messages.filter(m => m.role === 'assistant' && m.imageUrl);
      if (assistantMessages.length > 0) {
        imageUrlForEdit = assistantMessages[assistantMessages.length - 1].imageUrl;
      }
    }

    // Debug logging
    console.log('🔍 [EDIT-DEBUG] Messages count:', messages.length);
    console.log('🔍 [EDIT-DEBUG] Selected image for edit:', selectedImageForEdit?.url);
    console.log('🔍 [EDIT-DEBUG] Found last image URL:', imageUrlForEdit);
    console.log('🔍 [EDIT-DEBUG] Assistant messages with images:', messages.filter(m => m.role === 'assistant' && m.imageUrl).map(m => m.imageUrl));

    // If user selected an image for edit and no new reference images uploaded,
    // pass the selected image URL as a reference image
    let finalRefImagesForApi = refImagesForApi;
    if (selectedImageForEdit?.url && refImagesForApi.length === 0) {
      console.log('📸 [SMART-CHAT] Adding selected image as reference:', selectedImageForEdit.url);
      finalRefImagesForApi = [{ data: selectedImageForEdit.url, mimeType: 'image/jpeg' }];
    }

    const tempUserMsg = { role: 'user', content: userPrompt, referenceImages: imagesToUse.map(r => r.preview) };
    setMessages(prev => [...prev, tempUserMsg]);

    // Clear selected image after use
    setSelectedImageForEdit(null);

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.userId) throw new Error('User not logged in');

      // Step 1: Use smart chat API to understand intent and get prompts
      const chatResponse = await chatAPI.chat({
        userId: user.userId,
        message: userPrompt,
        imageChatId: existingChatId,
        referenceImages: finalRefImagesForApi,
        lastImageUrl: imageUrlForEdit, // Pass selected or last image for edit/remix operations
      });

      // Handle conversation-only responses (no image generation)
      if (chatResponse.intent === 'conversation' || chatResponse.intent === 'question') {
        const aiMsg = {
          role: 'assistant',
          content: chatResponse.message,
        };
        setMessages(prev => [...prev, aiMsg]);
        setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
        setReferenceImages([]);
        setLoading(false);
        return;
      }

      // Handle schedule intent - just show the message, don't generate new images
      if (chatResponse.intent === 'schedule' || chatResponse.type === 'scheduled') {
        const aiMsg = {
          role: 'assistant',
          content: chatResponse.message,
          isScheduled: true,
          scheduledPost: chatResponse.post,
        };
        setMessages(prev => [...prev, aiMsg]);
        setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
        setReferenceImages([]);
        setLoading(false);
        return;
      }

      // Handle edit/remix - needs to pass the previous image as reference
      if (chatResponse.intent === 'edit' || chatResponse.intent === 'remix') {
        // Add AI acknowledgment message
        if (chatResponse.message) {
          const ackMsg = { role: 'assistant', content: chatResponse.message };
          setMessages(prev => [...prev, ackMsg]);
        }

        // If needs image but doesn't have one, stop here
        if (chatResponse.needsImage) {
          setLoading(false);
          return;
        }

        // Use the edit prompt with the last image as reference
        const promptToUse = chatResponse.prompt || userPrompt;

        // Prepare images for edit - prioritize user-uploaded reference images
        let imagesToSend = refImagesForApi;

        console.log('🖼️ [EDIT] refImagesForApi length:', refImagesForApi.length);
        console.log('🖼️ [EDIT] imagesToUse length:', imagesToUse.length);
        console.log('🖼️ [EDIT] referenceImages state length:', referenceImages.length);

        // Only use last generated image if user didn't upload a reference image
        if (imagesToSend.length === 0 && chatResponse.useLastImage && chatResponse.lastImageUrl) {
          // Pass the URL directly to the backend - it will fetch the image server-side
          // This is more reliable than fetching in the browser (avoids CORS/network issues)
          console.log('🖼️ [EDIT] No reference image uploaded, using last generated image:', chatResponse.lastImageUrl);
          imagesToSend = [{
            data: chatResponse.lastImageUrl, // Backend will detect URL and fetch it
            mimeType: 'image/jpeg',
          }];
        } else if (refImagesForApi.length > 0) {
          console.log('🖼️ [EDIT] Using user-uploaded reference image for edit');
        }

        // If edit was requested but no image URL available, inform user
        if (chatResponse.useLastImage && !chatResponse.lastImageUrl && imagesToSend.length === 0) {
          console.warn('⚠️ [EDIT] No image available for edit operation');
          const errorMsg = {
            role: 'assistant',
            content: "I need an image to edit! Please click on an image in the chat or upload the image you want me to modify.",
          };
          setMessages(prev => [...prev, errorMsg]);
          setLoading(false);
          return;
        }

        console.log('🖼️ [EDIT] Final imagesToSend length:', imagesToSend.length);
        console.log('🖼️ [EDIT] Sending to /image/generate with images:', imagesToSend.length > 0 ? 'YES' : 'NO');

        // Generate edited image
        const data = await imageAPI.generate({
          prompt: promptToUse,
          originalMessage: userPrompt, // Keep original user message for UI display
          userId: user.userId,
          imageChatId: existingChatId || chatResponse.imageChatId,
          isEdit: true, // Tell backend this is an edit operation
          ...overrides,
          images: imagesToSend.length > 0 ? imagesToSend : undefined,
        });

        if (!existingChatId && data.imageChatId) {
          setCurrentChatId(data.imageChatId);
          setChatTitle(userPrompt.slice(0, 30) + '...');
          navigate(`/chat/${data.imageChatId}`, { replace: true });
        }

        // Handle insufficient credits error
        if (data.code === 'INSUFFICIENT_CREDITS' || data.error === 'Insufficient credits') {
          const errorMsg = {
            role: 'assistant',
            content: "⚡ You've run out of credits! Please upgrade your plan to continue generating images.",
            isError: true
          };
          setMessages(prev => [...prev, errorMsg]);
          setLoading(false);
          return;
        }

        const aiMsg = {
          role: 'assistant',
          content: data.textResponse || 'Here\'s your edited image!',
          imageUrl: data.imageUrl || (data.images && data.images[0]?.url),
        };
        setMessages(prev => [...prev, aiMsg]);
        setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
        setReferenceImages([]);

        // Update credits after successful edit
        if (data.creditsRemaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: data.creditsRemaining }));
        } else {
          fetchCredits();
        }

        setLoading(false);
        return;
      }

      // Step 2: For image generation, use the generated prompt with the image API
      if (chatResponse.contentJob || chatResponse.prompt) {
        // Add AI acknowledgment message
        if (chatResponse.message) {
          const ackMsg = { role: 'assistant', content: chatResponse.message };
          setMessages(prev => [...prev, ackMsg]);
        }

        // Use the enhanced prompt from the orchestrator
        const promptToUse = chatResponse.prompt || chatResponse.contentJob?.prompts?.[0] || userPrompt;

        // Generate image using the existing image API
        const data = await imageAPI.generate({
          prompt: promptToUse,
          originalMessage: userPrompt, // Keep original user message for UI display
          userId: user.userId,
          imageChatId: existingChatId || chatResponse.imageChatId,
          viralContent: chatResponse.viralContent, // Pass viral content for saving
          ...overrides,
          images: refImagesForApi.length > 0 ? refImagesForApi : undefined,
        });

        // Handle insufficient credits error
        if (data.code === 'INSUFFICIENT_CREDITS' || data.error === 'Insufficient credits') {
          const errorMsg = {
            role: 'assistant',
            content: "⚡ You've run out of credits! Please upgrade your plan to continue generating images.",
            isError: true
          };
          setMessages(prev => [...prev, errorMsg]);
          setLoading(false);
          return;
        }

        if (!existingChatId && data.imageChatId) {
          setCurrentChatId(data.imageChatId);
          setChatTitle(userPrompt.slice(0, 30) + '...');
          navigate(`/chat/${data.imageChatId}`, { replace: true });
        }

        const aiMsg = {
          role: 'assistant',
          content: data.textResponse || '',
          imageUrl: data.imageUrl || (data.images && data.images[0]?.url),
          // Store job info for campaign/batch tracking
          contentJob: chatResponse.contentJob,
          // Include viral content for posts
          viralContent: chatResponse.viralContent,
        };
        setMessages(prev => [...prev, aiMsg]);

        // Update credits after successful generation (Moved inside the block where data is defined)
        if (data.creditsRemaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: data.creditsRemaining }));
        } else {
          fetchCredits(); // Fallback: fetch fresh credits
        }
      }

      setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
      setReferenceImages([]);

    } catch (error) {
      console.error('Failed to generate:', error);
      // Fallback to direct image generation if smart chat fails
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const data = await imageAPI.generate({
          prompt: userPrompt,
          userId: user.userId,
          imageChatId: existingChatId,
          ...overrides,
          images: referenceImages.length > 0 ? referenceImages.map(img => ({ data: img.data, mimeType: img.mimeType })) : undefined,
        });

        // Handle insufficient credits error
        if (data.code === 'INSUFFICIENT_CREDITS' || data.error === 'Insufficient credits') {
          const errorMsg = {
            role: 'assistant',
            content: "⚡ You've run out of credits! Please upgrade your plan to continue generating images.",
            isError: true
          };
          setMessages(prev => [...prev, errorMsg]);
          return;
        }

        if (!existingChatId && data.imageChatId) {
          setCurrentChatId(data.imageChatId);
          setChatTitle(userPrompt.slice(0, 30) + '...');
          navigate(`/chat/${data.imageChatId}`, { replace: true });
        }

        const aiMsg = {
          role: 'assistant',
          content: data.textResponse || "Here is your generated image.",
          imageUrl: data.imageUrl || (data.images && data.images[0]?.url),
        };
        setMessages(prev => [...prev, aiMsg]);
        setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
        setReferenceImages([]);

        // Update credits after successful fallback generation
        if (data.creditsRemaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: data.creditsRemaining }));
        } else {
          fetchCredits();
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        const errorMsg = { role: 'assistant', content: "Sorry, I encountered an error while generating the image. Please try again." };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Ref to prevent duplicate requests
  const requestInFlightRef = useRef(false);

  const generateWithAgent = async (userPrompt, existingChatId, initialImages = null) => {
    // Prevent duplicate requests
    if (requestInFlightRef.current) {
      console.log('⚠️ [AGENT] Request already in flight, skipping duplicate');
      return;
    }
    requestInFlightRef.current = true;
    setLoading(true);

    const imagesToUse = initialImages !== null && initialImages !== undefined ? initialImages : referenceImages;
    let refImagesForApi = imagesToUse.map(img => ({ data: img.data, mimeType: img.mimeType }));

    let imageUrlForEdit = selectedImageForEdit?.url || null;
    if (!imageUrlForEdit) {
      const assistantMessages = messages.filter(m => m.role === 'assistant' && m.imageUrl);
      if (assistantMessages.length > 0) {
        imageUrlForEdit = assistantMessages[assistantMessages.length - 1].imageUrl;
      }
    }

    // Filter out reference images that match the image being edited (avoid duplicates)
    if (imageUrlForEdit) {
      refImagesForApi = refImagesForApi.filter(ref => ref.data !== imageUrlForEdit);
    }

    const tempUserMsg = { role: 'user', content: userPrompt, referenceImages: imagesToUse.map(r => r.preview) };
    setMessages(prev => [...prev, tempUserMsg]);
    setSelectedImageForEdit(null);

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.userId) throw new Error('User not logged in');

      const response = await agentAPI.chat({
        userId: user.userId,
        message: userPrompt,
        imageChatId: existingChatId,
        referenceImages: refImagesForApi,
        lastImageUrl: imageUrlForEdit,
      });

      // Update chatId for new chats (any intent)
      if (!existingChatId && response.imageChatId) {
        setCurrentChatId(response.imageChatId);
        setChatTitle(userPrompt.slice(0, 30) + '...');
        navigate(`/chat/${response.imageChatId}`, { replace: true });
      }

      if (response.intent === 'conversation' || response.intent === 'accounts') {
        setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);
      } else if (response.intent === 'image_generation') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.message || 'Here is your image!',
          imageUrl: response.imageUrl || (response.images && response.images[0]?.url),
        }]);
        if (response.creditsRemaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: response.creditsRemaining }));
        } else {
          fetchCredits();
        }
      } else if (response.intent === 'schedule') {
        setMessages(prev => [...prev, { role: 'assistant', content: response.message, isScheduled: true }]);
      } else if (response.intent === 'variations') {
        // Handle multiple variations - each variation as a separate message or all in one
        if (response.variations && response.variations.length > 0) {
          // Add all variations as messages
          const variationMessages = response.variations.map((v, idx) => ({
            role: 'assistant',
            content: `Variation ${idx + 1}: ${v.variant}`,
            imageUrl: v.imageUrl,
          }));
          setMessages(prev => [...prev, ...variationMessages]);
          if (response.creditsRemaining !== undefined) {
            setCredits(prev => ({ ...prev, balance: response.creditsRemaining }));
          } else {
            fetchCredits();
          }
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: response.message || 'Variations created!' }]);
        }
      } else if (response.intent === 'error') {
        if (response.message?.includes('credit')) {
          setMessages(prev => [...prev, { role: 'assistant', content: "⚡ You've run out of credits!", isError: true }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: response.message || 'Something went wrong' }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.message || 'Done!' }]);
      }

      setMessageOverrides({ aspectRatio: null, imageSize: null, style: null });
      setReferenceImages([]);
    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
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

    generateWithAgent(userPrompt, currentChatId !== 'new' ? currentChatId : null, currentRefImages);
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

          <MessageList
            messages={messages}
            loading={loading}
            onDeleteMessage={handleDeleteMessage}
            selectedImageForEdit={selectedImageForEdit}
            onSelectImageForEdit={(url, idx) => setSelectedImageForEdit({ url, idx })}
            onClearSelectedImage={() => setSelectedImageForEdit(null)}
          />
        </div>

        {/* Input Area - Fixed Bottom with Gradient Fade */}
        <div className="relative z-30 px-4 sm:px-6 md:px-8 pb-4 pt-12 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
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

      </div>
    </div>
  );
};

export default ChatPage;