import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import '../../styles/datepicker.css';
import SafeIcon from '../../common/SafeIcon';
import { schedulerAPI } from '../../lib/api';
import { getUser } from '../../lib/velosStorage';
import ThinkingSteps from './ThinkingSteps';

import { API_BASE_URL } from '../../config';

const { FiUser, FiZap, FiDownload, FiRefreshCw, FiCheck, FiX, FiChevronDown, FiTrash2, FiCopy, FiCalendar, FiClock, FiInstagram, FiMaximize2 } = FiIcons;

const MessageList = ({ messages, loading, streamingStatus, onDeleteMessage, selectedImageForEdit, onSelectImageForEdit, onClearSelectedImage, onSuggestionClick }) => {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const [publishingIdx, setPublishingIdx] = useState(null);
  const [publishStatus, setPublishStatus] = useState({}); // { idx: 'success' | 'error' | 'publishing' }
  const [instagramAccounts, setInstagramAccounts] = useState([]);
  const [showAccountPicker, setShowAccountPicker] = useState(null); // idx of image showing picker
  const [selectedAccount, setSelectedAccount] = useState(null); // selected account ID
  const [selectedAccountPerImage, setSelectedAccountPerImage] = useState({}); // { idx: accountId } - tracks selection per image

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(null); // idx of image being scheduled
  const [scheduleDate, setScheduleDate] = useState(new Date(new Date().setDate(new Date().getDate() + 1))); // Default tomorrow
  const [scheduleTime, setScheduleTime] = useState(new Date().setHours(9, 0, 0, 0)); // Default 9 AM
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [schedulingStatus, setSchedulingStatus] = useState({}); // { idx: 'scheduling' | 'success' | 'error' }

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Fetch Instagram accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      const user = getUser();
      if (!user?.userId) return;

      try {
        const response = await fetch(`${API_BASE_URL}/instagram/info/${user.userId}`);
        const data = await response.json();
        if (data.success && data.accounts) {
          setInstagramAccounts(data.accounts);
          if (data.accounts.length > 0) {
            setSelectedAccount(data.accounts[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching Instagram accounts:', err);
      }
    };
    fetchAccounts();
  }, []);

  const handleDownload = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `velos-generated-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(url, '_blank');
    }
  };

  const handlePublish = async (imageUrl, idx, accountId = null) => {
    const user = getUser();
    if (!user?.userId) {
      alert('Please log in to publish');
      return;
    }

    if (instagramAccounts.length === 0) {
      alert('Please connect an Instagram account first in Settings');
      return;
    }

    setPublishingIdx(idx);
    setPublishStatus(prev => ({ ...prev, [idx]: 'publishing' }));
    setShowAccountPicker(null);

    try {
      const response = await fetch(`${API_BASE_URL}/instagram/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          imageUrl: imageUrl,
          caption: 'Created with Velos AI ✨ #AI #AIArt #VelosAI',
          accountId: accountId || selectedAccount,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPublishStatus(prev => ({ ...prev, [idx]: 'success' }));
        setTimeout(() => {
          setPublishStatus(prev => ({ ...prev, [idx]: null }));
        }, 3000);
      } else {
        setPublishStatus(prev => ({ ...prev, [idx]: 'error' }));
        alert(`Failed to publish: ${data.error}`);
        setTimeout(() => {
          setPublishStatus(prev => ({ ...prev, [idx]: null }));
        }, 3000);
      }
    } catch (error) {
      setPublishStatus(prev => ({ ...prev, [idx]: 'error' }));
      alert(`Error: ${error.message}`);
      setTimeout(() => {
        setPublishStatus(prev => ({ ...prev, [idx]: null }));
      }, 3000);
    } finally {
      setPublishingIdx(null);
    }
  };

  const toggleAccountPicker = (idx) => {
    setShowAccountPicker(prev => prev === idx ? null : idx);
  };

  const handleSelectAccount = (idx, accountId) => {
    setSelectedAccountPerImage(prev => ({ ...prev, [idx]: accountId }));
    setShowAccountPicker(null);
  };

  const getSelectedAccountForImage = (idx) => {
    return selectedAccountPerImage[idx] || (instagramAccounts.length > 0 ? instagramAccounts[0].id : null);
  };

  const getAccountById = (accountId) => {
    return instagramAccounts.find(acc => acc.id === accountId);
  };

  const openScheduleModal = (idx, viralContent) => {
    setShowScheduleModal(idx);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow);

    const nineAM = new Date();
    nineAM.setHours(9, 0, 0, 0);
    setScheduleTime(nineAM);

    const caption = viralContent?.description || '';
    const hashtags = viralContent?.hashtagString || '';
    setScheduleCaption(caption + (hashtags ? '\n\n' + hashtags : ''));
  };

  const handleSchedulePost = async (imageUrl, idx) => {
    const user = getUser();
    if (!user?.userId) {
      alert('Please log in to schedule');
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      alert('Please select a date and time');
      return;
    }

    // Combine date and time
    const scheduledAt = new Date(scheduleDate);
    const timeDate = new Date(scheduleTime);
    scheduledAt.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);

    if (scheduledAt <= new Date()) {
      alert('Scheduled time must be in the future');
      return;
    }

    setSchedulingStatus(prev => ({ ...prev, [idx]: 'scheduling' }));

    try {
      const selectedId = getSelectedAccountForImage(idx);
      const result = await schedulerAPI.createPost({
        userId: user.userId,
        imageUrl,
        caption: scheduleCaption,
        hashtags: '',
        platform: 'instagram',
        accountId: selectedId,
        scheduledAt: scheduledAt.toISOString(),
      });

      if (result.success) {
        setSchedulingStatus(prev => ({ ...prev, [idx]: 'success' }));
        setShowScheduleModal(null);
        setTimeout(() => {
          setSchedulingStatus(prev => ({ ...prev, [idx]: null }));
        }, 3000);
      } else {
        setSchedulingStatus(prev => ({ ...prev, [idx]: 'error' }));
        alert(`Failed to schedule: ${result.error}`);
      }
    } catch (error) {
      setSchedulingStatus(prev => ({ ...prev, [idx]: 'error' }));
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto hidden-scrollbar px-4 sm:px-8 py-10" ref={scrollRef}>
      <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-32">

        {/* Empty State */}
        {messages.length === 0 && !loading && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 opacity-60">
            <div className="relative">
              <div className="absolute inset-0 bg-white/5 blur-xl rounded-full"></div>
              <div className="relative w-20 h-20 rounded-3xl bg-[#18181b] flex items-center justify-center border border-white/10 shadow-2xl">
                <SafeIcon icon={FiZap} className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Velos Canvas</h3>
              <p className="text-zinc-500 text-base mt-2 max-w-sm mx-auto">
                Ready to visualize your ideas. Type a prompt below to start creating.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`flex gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg mt-1 ${msg.role === 'user'
              ? 'bg-zinc-800 text-zinc-400 border border-white/5'
              : 'bg-white text-black border border-white'
              }`}>
              {msg.role === 'user' ? <SafeIcon icon={FiUser} className="w-4 h-4" /> : <SafeIcon icon={FiZap} className="w-4 h-4" />}
            </div>

            {/* Content Container */}
            <div className={`flex flex-col gap-3 max-w-[85%] lg:max-w-[70%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

              {/* Cognitive Layer - Thinking Steps (Assistant only) */}
              {msg.role === 'assistant' && msg.cognitive && (
                <ThinkingSteps
                  steps={msg.cognitive.thinkingSteps}
                  decisions={msg.cognitive.decisions}
                  suggestions={msg.cognitive.suggestions}
                  persona={msg.cognitive.persona}
                  onSuggestionClick={onSuggestionClick}
                />
              )}

              {/* Streaming Status */}
              {msg.isStreaming && msg.streamingMessage && !msg.content && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 rounded-2xl border border-white/10"
                >
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{msg.streamingMessage}</span>
                </motion.div>
              )}

              {/* Text Bubble */}
              {(msg.content || (msg.isStreaming && !msg.streamingMessage)) && (
                <div className={`relative px-6 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm backdrop-blur-sm group/bubble ${msg.role === 'user'
                  ? 'bg-zinc-800 text-zinc-100 border border-white/5 rounded-tr-sm'
                  : 'bg-transparent text-zinc-300 pl-0 pt-1 border-none shadow-none'
                  }`}>
                  {msg.content}
                  {msg.isStreaming && msg.content && (
                    <span className="inline-block w-2 h-4 bg-white/80 ml-0.5 animate-pulse rounded-sm" />
                  )}
                  {/* Delete Button */}
                  {onDeleteMessage && msg.messageId && !msg.isStreaming && (
                    <button
                      onClick={() => onDeleteMessage(msg.messageId, idx)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-900/80 hover:bg-red-800 text-white rounded-full opacity-0 group-hover/bubble:opacity-100 transition-opacity shadow-lg border border-red-700/50"
                      title="Delete message"
                    >
                      <SafeIcon icon={FiTrash2} className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Reference Images (User) */}
              {msg.role === 'user' && msg.referenceImages && msg.referenceImages.length > 0 && (
                <div className="flex gap-2 p-1.5 bg-[#18181b] rounded-2xl border border-white/5">
                  {msg.referenceImages.map((img, i) => (
                    <div key={i} className="w-16 h-16 rounded-xl overflow-hidden border border-white/5 relative group/img">
                      <img src={img} alt="Ref" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}

              {/* Generated Image (Assistant) */}
              {msg.role === 'assistant' && msg.imageUrl && (
                <div className="flex flex-col mt-2">
                  <div className={`relative group/image rounded-3xl overflow-hidden shadow-2xl bg-[#09090b] transition-all duration-500 ${selectedImageForEdit?.url === msg.imageUrl
                    ? 'border border-white ring-1 ring-white/20 shadow-white/10'
                    : 'border border-white/10'
                    }`}>

                    {/* Selected Badge */}
                    {selectedImageForEdit?.url === msg.imageUrl && (
                      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-full text-[10px] font-bold shadow-lg">
                        <SafeIcon icon={FiCheck} className="w-3 h-3" />
                        SELECTED FOR EDIT
                        <button
                          onClick={(e) => { e.stopPropagation(); onClearSelectedImage?.(); }}
                          className="ml-1 hover:bg-zinc-200 rounded-full p-0.5"
                        >
                          <SafeIcon icon={FiX} className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Image */}
                    <img
                      src={msg.imageUrl}
                      alt="Generated by Velos"
                      className="max-w-[280px] sm:max-w-[320px] h-auto object-cover block w-full"
                      loading="lazy"
                    />

                    {/* Hover Effect: View/Expand only */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity duration-300 flex items-center justify-center cursor-pointer" onClick={() => window.open(msg.imageUrl, '_blank')}>
                      <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 transform scale-90 group-hover/image:scale-100 transition-transform">
                        <SafeIcon icon={FiMaximize2} className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Action Bar - Below Image */}
                  <div className="mt-3 flex items-center justify-between max-w-[280px] sm:max-w-[320px]">
                    <div className="flex gap-2">
                      {/* Edit Button */}
                      <button
                        align="left"
                        onClick={() => onSelectImageForEdit?.(msg.imageUrl, idx)}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border ${selectedImageForEdit?.url === msg.imageUrl
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 text-zinc-400 border-white/5 hover:text-white hover:border-white/20'
                          }`}
                        title="Edit Image"
                      >
                        <SafeIcon icon={FiRefreshCw} className="w-4 h-4" />
                      </button>

                      {/* Download Button */}
                      <button
                        onClick={() => handleDownload(msg.imageUrl)}
                        className="p-2 rounded-xl bg-zinc-900 text-zinc-400 border border-white/5 hover:text-white hover:border-white/20 transition-all"
                        title="Download Image"
                      >
                        <SafeIcon icon={FiDownload} className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      {/* Schedule Button */}
                      <button
                        onClick={() => openScheduleModal(idx, msg.viralContent)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all border flex items-center gap-1.5 ${schedulingStatus[idx] === 'success'
                          ? 'bg-emerald-500 text-white border-transparent'
                          : 'bg-zinc-900 text-zinc-400 border-white/5 hover:text-white hover:border-white/20'
                          }`}
                      >
                        <SafeIcon icon={FiCalendar} className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Schedule</span>
                      </button>

                      {/* Publish Dropdown Group */}
                      <div className="relative">
                        {(() => {
                          const selectedId = getSelectedAccountForImage(idx);
                          const hasMultiple = instagramAccounts.length > 1;

                          return (
                            <>
                              <div className="flex items-center rounded-xl overflow-hidden border border-white/5 bg-zinc-900 group/publish hover:border-white/20 transition-colors">
                                <button
                                  onClick={() => handlePublish(msg.imageUrl, idx, selectedId)}
                                  disabled={publishingIdx === idx}
                                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-1.5 ${publishStatus[idx] === 'success' ? 'text-emerald-500' : publishStatus[idx] === 'error' ? 'text-red-500' : 'text-zinc-300 group-hover/publish:text-white'}`}
                                >
                                  {publishStatus[idx] === 'publishing' ? (
                                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <SafeIcon icon={publishStatus[idx] === 'success' ? FiCheck : publishStatus[idx] === 'error' ? FiX : FiZap} className="w-3.5 h-3.5" />
                                  )}
                                  <span className="hidden sm:inline">Publish</span>
                                </button>

                                {hasMultiple && (
                                  <button
                                    onClick={() => toggleAccountPicker(idx)}
                                    className="px-1.5 py-2 hover:bg-white/5 text-zinc-500 hover:text-white transition-colors border-l border-white/5 flex items-center"
                                  >
                                    <SafeIcon icon={FiChevronDown} className={`w-3 h-3 transition-transform ${showAccountPicker === idx ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {/* Account Picker Dropdown */}
                              <AnimatePresence>
                                {showAccountPicker === idx && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 right-0 w-56 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                                  >
                                    <div className="p-2.5 border-b border-white/5 bg-zinc-900/50">
                                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest px-1">Post to account</p>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto hidden-scrollbar py-1">
                                      {instagramAccounts.map((account) => (
                                        <button
                                          key={account.id}
                                          onClick={() => handleSelectAccount(idx, account.id)}
                                          className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left ${selectedId === account.id ? 'bg-white/5' : ''}`}
                                        >
                                          {account.profilePictureUrl ? (
                                            <img
                                              src={account.profilePictureUrl}
                                              alt={account.username}
                                              className="w-8 h-8 rounded-full ring-1 ring-white/10 object-cover"
                                            />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center ring-1 ring-white/10 shrink-0">
                                              <span className="text-white text-[10px] font-bold">
                                                {account.username?.[0]?.toUpperCase()}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium truncate ${selectedId === account.id ? 'text-white' : 'text-zinc-400'}`}>@{account.username}</p>
                                          </div>
                                          {selectedId === account.id && (
                                            <SafeIcon icon={FiCheck} className="w-3.5 h-3.5 text-emerald-500" />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Viral Content - Clean Dark Theme */}
              {msg.role === 'assistant' && msg.viralContent && (msg.viralContent.description || msg.viralContent.hashtagString || msg.viralContent.callToAction) && (
                <div className="mt-2 p-4 bg-[#18181b] rounded-2xl border border-white/5 group/viral hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1 rounded bg-white text-black">
                      <SafeIcon icon={FiZap} className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Viral Caption</span>
                    {msg.viralContent.viralScore && (
                      <span className="ml-auto text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-white/5 px-2 py-0.5 rounded">
                        SCORE: {msg.viralContent.viralScore}/10
                      </span>
                    )}
                  </div>

                  {msg.viralContent.description && (
                    <div className="mb-3">
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{msg.viralContent.description}</p>
                    </div>
                  )}

                  {msg.viralContent.hashtagString && (
                    <div className="mb-3 p-3 bg-zinc-900 rounded-xl border border-white/5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-zinc-400 flex-1 leading-relaxed">{msg.viralContent.hashtagString}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.viralContent.hashtagString);
                          }}
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                          title="Copy hashtags"
                        >
                          <SafeIcon icon={FiCopy} className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.viralContent.bestPostingTimes && msg.viralContent.bestPostingTimes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Best Times:</span>
                      <div className="flex gap-1.5">
                        {msg.viralContent.bestPostingTimes.map((time, i) => (
                          <span key={i} className="text-[10px] font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{time}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))
        }

        {loading && !messages.some(m => m.isStreaming) && (
          <div className="flex gap-6">
            <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 shadow-lg border border-white mt-1">
              <span className="animate-spin text-lg">⚡</span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm text-zinc-400 font-medium tracking-wide">
                  {streamingStatus?.message || 'Processing...'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div >

      {/* Schedule Modal */}
      <AnimatePresence>
        {showScheduleModal !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowScheduleModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                    <SafeIcon icon={FiCalendar} className="w-5 h-5 text-black" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Schedule Post</h3>
                    <p className="text-xs text-zinc-400 font-medium">Automate your content</p>
                  </div>
                </div>
                <button onClick={() => setShowScheduleModal(null)} className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
                  <SafeIcon icon={FiX} className="w-5 h-5" />
                </button>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Date</label>
                  <DatePicker
                    selected={scheduleDate}
                    onChange={(date) => setScheduleDate(date)}
                    dateFormat="MMMM d, yyyy"
                    minDate={new Date()}
                    className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-white/30 transition-all cursor-pointer"
                    popperProps={{ strategy: 'fixed' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Time</label>
                  <DatePicker
                    selected={scheduleTime}
                    onChange={(date) => setScheduleTime(date)}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={15}
                    timeCaption="Time"
                    dateFormat="h:mm aa"
                    className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-white/30 transition-all cursor-pointer"
                    popperProps={{ strategy: 'fixed' }}
                  />
                </div>
              </div>

              {/* Caption */}
              <div className="mb-6">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Caption & Hashtags</label>
                <textarea
                  value={scheduleCaption}
                  onChange={(e) => setScheduleCaption(e.target.value)}
                  rows={4}
                  placeholder="Write your caption..."
                  className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-white/30 transition-all resize-none placeholder-zinc-600 custom-scrollbar leading-relaxed"
                />
              </div>

              {/* Account Selection */}
              {instagramAccounts.length > 0 && (
                <div className="mb-6">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Post to</label>
                  <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-white/10 rounded-xl">
                    {(() => {
                      const acc = getAccountById(getSelectedAccountForImage(showScheduleModal));
                      return acc ? (
                        <>
                          {acc.profilePictureUrl ? (
                            <img src={acc.profilePictureUrl} alt={acc.username} className="w-8 h-8 rounded-full ring-2 ring-white/10" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center ring-1 ring-white/10">
                              <span className="text-white text-xs font-bold text-zinc-400">{acc.username?.[0]?.toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white">@{acc.username}</span>
                            <span className="text-[10px] text-zinc-500 font-medium">Instagram Account</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-zinc-500">Select account</span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-8 pt-6 border-t border-white/5">
                <button
                  onClick={() => setShowScheduleModal(null)}
                  className="flex-1 px-4 py-3 bg-zinc-900 text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-800 hover:text-white transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const msg = messages.find((_, i) => i === showScheduleModal);
                    if (msg?.imageUrl) {
                      handleSchedulePost(msg.imageUrl, showScheduleModal);
                    }
                  }}
                  disabled={schedulingStatus[showScheduleModal] === 'scheduling'}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-white text-black rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all disabled:opacity-50 shadow-lg shadow-white/10"
                >
                  {schedulingStatus[showScheduleModal] === 'scheduling' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <SafeIcon icon={FiClock} className="w-3.5 h-3.5" />
                      Schedule Post
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

export default MessageList;