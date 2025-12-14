import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { schedulerAPI } from '../../lib/api';
import ThinkingSteps from './ThinkingSteps';

import { API_BASE_URL } from '../../config';

const { FiUser, FiZap, FiDownload, FiRefreshCw, FiCheck, FiX, FiChevronDown, FiTrash2, FiCopy, FiCalendar, FiClock } = FiIcons;

const MessageList = ({ messages, loading, onDeleteMessage, selectedImageForEdit, onSelectImageForEdit, onClearSelectedImage }) => {
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
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [schedulingStatus, setSchedulingStatus] = useState({}); // { idx: 'scheduling' | 'success' | 'error' }

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  console.log(instagramAccounts, 'instagramAccounts', selectedAccount, 'selectedAccount');

  // Fetch Instagram accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.userId) return;

      try {
        const response = await fetch(`${API_BASE_URL}/instagram/info/${user.userId}`);
        const data = await response.json();
        if (data.success && data.accounts) {
          console.log('Accounts:', data.accounts);
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
      // Fallback
      window.open(url, '_blank');
    }
  };

  const handlePublish = async (imageUrl, idx, accountId = null) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.userId) {
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

  // Handle selecting an account (doesn't publish, just selects)
  const handleSelectAccount = (idx, accountId) => {
    setSelectedAccountPerImage(prev => ({ ...prev, [idx]: accountId }));
    setShowAccountPicker(null); // Close dropdown after selection
  };

  // Get selected account for a specific image (or default to first)
  const getSelectedAccountForImage = (idx) => {
    return selectedAccountPerImage[idx] || (instagramAccounts.length > 0 ? instagramAccounts[0].id : null);
  };

  // Get account info by ID
  const getAccountById = (accountId) => {
    return instagramAccounts.find(acc => acc.id === accountId);
  };

  // Open schedule modal for an image
  const openScheduleModal = (idx, viralContent) => {
    setShowScheduleModal(idx);
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().split('T')[0]);
    setScheduleTime('09:00');
    // Pre-fill caption from viral content
    const caption = viralContent?.description || '';
    const hashtags = viralContent?.hashtagString || '';
    setScheduleCaption(caption + (hashtags ? '\n\n' + hashtags : ''));
  };

  // Handle schedule submission
  const handleSchedulePost = async (imageUrl, idx) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.userId) {
      alert('Please log in to schedule');
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      alert('Please select a date and time');
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
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
    <div className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-8 py-10" ref={scrollRef}>
      <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-32">

        {/* Empty State */}
        {messages.length === 0 && !loading && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 opacity-60">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 blur-xl rounded-full"></div>
              <div className="relative w-20 h-20 rounded-3xl bg-[#1c1c1e] flex items-center justify-center border border-white/10 shadow-2xl">
                <span className="text-4xl">⚡</span>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Velos Canvas</h3>
              <p className="text-zinc-400 text-base mt-2 max-w-sm mx-auto">
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
              ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
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
                />
              )}

              {/* Text Bubble */}
              {msg.content && (
                <div className={`relative px-6 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm backdrop-blur-sm group/bubble ${msg.role === 'user'
                  ? 'bg-[#27272a] text-zinc-100 border border-white/5 rounded-tr-sm'
                  : 'bg-transparent text-zinc-300 pl-0 pt-1 border-none shadow-none'
                  }`}>
                  {msg.content}
                  {/* Delete Button - appears on hover */}
                  {onDeleteMessage && msg.messageId && (
                    <button
                      onClick={() => onDeleteMessage(msg.messageId, idx)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover/bubble:opacity-100 transition-opacity shadow-lg"
                      title="Delete message"
                    >
                      <SafeIcon icon={FiTrash2} className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Reference Images (User) */}
              {msg.role === 'user' && msg.referenceImages && msg.referenceImages.length > 0 && (
                <div className="flex gap-2 p-1 bg-[#1c1c1e] rounded-2xl border border-white/5">
                  {msg.referenceImages.map((img, i) => (
                    <div key={i} className="w-16 h-16 rounded-xl overflow-hidden border border-white/5 relative group/img">
                      <img src={img} alt="Ref" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}

              {/* Generated Image (Assistant) */}
              {msg.role === 'assistant' && msg.imageUrl && (
                <div className={`relative group rounded-3xl overflow-hidden shadow-2xl bg-[#09090b] mt-2 transition-all duration-500 hover:scale-[1.01] ${selectedImageForEdit?.url === msg.imageUrl
                  ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/30'
                  : 'border border-white/10'
                  }`}>
                  {/* Selected Badge */}
                  {selectedImageForEdit?.url === msg.imageUrl && (
                    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-full text-xs font-bold shadow-lg">
                      <SafeIcon icon={FiCheck} className="w-3 h-3" />
                      Selected for Edit
                      <button
                        onClick={(e) => { e.stopPropagation(); onClearSelectedImage?.(); }}
                        className="ml-1 hover:bg-emerald-600 rounded-full p-0.5"
                      >
                        <SafeIcon icon={FiX} className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <img
                    src={msg.imageUrl}
                    alt="Generated by Velos"
                    className="max-w-[280px] sm:max-w-[320px] h-auto object-cover block rounded-2xl"
                    loading="lazy"
                  />

                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center p-4">
                    <div className="flex flex-wrap gap-2 w-full justify-center">
                      {/* Edit This Button */}
                      <button
                        onClick={() => onSelectImageForEdit?.(msg.imageUrl, idx)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${selectedImageForEdit?.url === msg.imageUrl
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10'
                          }`}
                      >
                        <SafeIcon icon={FiRefreshCw} className="w-3 h-3" />
                        {selectedImageForEdit?.url === msg.imageUrl ? 'Selected' : 'Edit'}
                      </button>

                      {/* Download Button */}
                      <button
                        onClick={() => handleDownload(msg.imageUrl)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold uppercase tracking-wide backdrop-blur-md border border-white/10 transition-all"
                      >
                        <SafeIcon icon={FiDownload} className="w-3 h-3" />
                        Save
                      </button>

                      {/* Schedule Button */}
                      <button
                        onClick={() => openScheduleModal(idx, msg.viralContent)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${schedulingStatus[idx] === 'success'
                          ? 'bg-emerald-500 text-white border-transparent'
                          : 'bg-white/10 hover:bg-white/20 text-white border-white/10 backdrop-blur-md'
                          }`}
                      >
                        {schedulingStatus[idx] === 'success' ? (
                          <SafeIcon icon={FiCheck} className="w-3 h-3" />
                        ) : (
                          <>
                            <SafeIcon icon={FiCalendar} className="w-3 h-3" />
                            Schedule
                          </>
                        )}
                      </button>

                      {/* Publish to Instagram Button */}
                      <div className="relative">
                        {(() => {
                          const selectedId = getSelectedAccountForImage(idx);
                          const selectedAcc = getAccountById(selectedId);
                          const hasMultiple = instagramAccounts.length > 1;

                          return (
                            <>
                              <div className="flex items-center shadow-lg rounded-lg overflow-hidden">
                                {/* Main Publish Button */}
                                <button
                                  onClick={() => handlePublish(msg.imageUrl, idx, selectedId)}
                                  disabled={publishingIdx === idx}
                                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${publishStatus[idx] === 'success'
                                    ? 'bg-emerald-500 text-white'
                                    : publishStatus[idx] === 'error'
                                      ? 'bg-red-500 text-white'
                                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                                    } ${hasMultiple ? 'rounded-l-lg pr-2' : 'rounded-lg'}`}
                                >
                                  {publishStatus[idx] === 'publishing' ? (
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : publishStatus[idx] === 'success' ? (
                                    <SafeIcon icon={FiCheck} className="w-3 h-3" />
                                  ) : publishStatus[idx] === 'error' ? (
                                    <SafeIcon icon={FiX} className="w-3 h-3" />
                                  ) : (
                                    <>
                                      <SafeIcon icon={FiZap} className="w-3 h-3" />
                                      Publish
                                    </>
                                  )}
                                </button>

                                {/* Dropdown arrow for multiple accounts */}
                                {hasMultiple && !publishStatus[idx] && (
                                  <button
                                    onClick={() => toggleAccountPicker(idx)}
                                    className="px-1.5 py-1.5 bg-pink-700 hover:bg-pink-600 text-white transition-all border-l border-white/20 flex items-center justify-center h-full"
                                    title="Change account"
                                  >
                                    <SafeIcon icon={FiChevronDown} className={`w-3 h-3 transition-transform ${showAccountPicker === idx ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {/* Account Picker Dropdown */}
                              <AnimatePresence>
                                {showAccountPicker === idx && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 right-0 w-48 bg-[#18181b] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
                                  >
                                    <div className="p-2 border-b border-white/5">
                                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider px-2">Post to</p>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                      {instagramAccounts.map((account) => (
                                        <button
                                          key={account.id}
                                          onClick={() => handleSelectAccount(idx, account.id)}
                                          className={`w-full flex items-center gap-2 p-2 hover:bg-white/5 transition-colors text-left ${selectedId === account.id ? 'bg-white/5' : ''}`}
                                        >
                                          {account.profilePictureUrl ? (
                                            <img
                                              src={account.profilePictureUrl}
                                              alt={account.username}
                                              className="w-6 h-6 rounded-full"
                                            />
                                          ) : (
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                              <span className="text-white text-[10px] font-bold">
                                                {account.username?.[0]?.toUpperCase()}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-white text-xs font-medium truncate">@{account.username}</p>
                                          </div>
                                          {selectedId === account.id && (
                                            <SafeIcon icon={FiCheck} className="w-3 h-3 text-pink-500" />
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

              {/* Viral Content - Hashtags & Caption for Instagram */}
              {msg.role === 'assistant' && msg.viralContent && (msg.viralContent.description || msg.viralContent.hashtagString || msg.viralContent.callToAction) && (
                <div className="mt-3 p-4 bg-zinc-900/50 rounded-2xl border border-white/5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🔥</span>
                    <span className="text-sm font-bold text-white">Viral Content</span>
                    {msg.viralContent.viralScore && (
                      <span className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full">
                        Score: {msg.viralContent.viralScore}/10
                      </span>
                    )}
                  </div>

                  {/* Caption/Description */}
                  {msg.viralContent.description && (
                    <div className="mb-3">
                      <div className="text-xs text-zinc-400 mb-1">📝 Caption</div>
                      <p className="text-sm text-zinc-200 whitespace-pre-wrap">{msg.viralContent.description}</p>
                    </div>
                  )}

                  {/* Hashtags */}
                  {msg.viralContent.hashtagString && (
                    <div className="mb-3">
                      <div className="text-xs text-zinc-400 mb-1">🏷️ Hashtags</div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-blue-400 flex-1">{msg.viralContent.hashtagString}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.viralContent.hashtagString);
                          }}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                          title="Copy hashtags"
                        >
                          <SafeIcon icon={FiCopy} className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Call to Action */}
                  {msg.viralContent.callToAction && (
                    <div className="mb-3">
                      <div className="text-xs text-zinc-400 mb-1">💬 Call to Action</div>
                      <p className="text-sm text-emerald-400">{msg.viralContent.callToAction}</p>
                    </div>
                  )}

                  {/* Best Posting Times */}
                  {msg.viralContent.bestPostingTimes && msg.viralContent.bestPostingTimes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span>⏰ Best times:</span>
                      {msg.viralContent.bestPostingTimes.map((time, i) => (
                        <span key={i} className="bg-white/10 px-2 py-1 rounded-full">{time}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))
        }

        {/* Loading Indicator */}
        {
          loading && (
            <div className="flex gap-6">
              <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 shadow-lg border border-white mt-1">
                <span className="animate-spin text-lg">⚡</span>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-zinc-400 font-medium">Visualizing...</div>
                </div>
                <div className="flex gap-1.5 h-8 items-center pl-1">
                  <motion.div
                    animate={{ height: [4, 16, 4], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                    className="w-1 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  />
                  <motion.div
                    animate={{ height: [4, 24, 4], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.1 }}
                    className="w-1 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  />
                  <motion.div
                    animate={{ height: [4, 16, 4], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.2 }}
                    className="w-1 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  />
                </div>
              </div>
            </div>
          )
        }

        <div ref={bottomRef} className="h-1" />
      </div >

      {/* Schedule Modal */}
      < AnimatePresence >
        {showScheduleModal !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setShowScheduleModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-white/5 rounded-3xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[50px] pointer-events-none"></div>

              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white relative z-10">
                <SafeIcon icon={FiCalendar} className="w-5 h-5 text-purple-400" />
                Schedule Post
              </h3>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4 mb-5 relative z-10">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:bg-zinc-900 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Time</label>
                  <div className="relative">
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:bg-zinc-900 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              {/* Caption */}
              <div className="mb-5 relative z-10">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Caption & Hashtags</label>
                <div className="relative">
                  <textarea
                    value={scheduleCaption}
                    onChange={(e) => setScheduleCaption(e.target.value)}
                    rows={4}
                    placeholder="Write your caption..."
                    className="w-full px-4 py-3 bg-zinc-900/50 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:bg-zinc-900 transition-all resize-none placeholder-zinc-600 custom-scrollbar"
                  />
                  <div className="absolute bottom-2 right-2 text-[10px] text-zinc-600 font-mono">
                    {scheduleCaption.length} chars
                  </div>
                </div>
              </div>

              {/* Account Selection */}
              {instagramAccounts.length > 0 && (
                <div className="mb-6 relative z-10">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Post to</label>
                  <div className="flex items-center gap-3 p-3 bg-zinc-900/30 border border-white/5 rounded-xl">
                    {(() => {
                      const acc = getAccountById(getSelectedAccountForImage(showScheduleModal));
                      return acc ? (
                        <>
                          {acc.profilePictureUrl ? (
                            <img src={acc.profilePictureUrl} alt={acc.username} className="w-8 h-8 rounded-full ring-2 ring-purple-500/20" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-lg">
                              <span className="text-white text-xs font-bold">{acc.username?.[0]?.toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">@{acc.username}</span>
                            <span className="text-[10px] text-zinc-500">Instagram</span>
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
              <div className="flex gap-3 relative z-10">
                <button
                  onClick={() => setShowScheduleModal(null)}
                  className="flex-1 px-4 py-3 bg-white/5 text-zinc-400 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-all backdrop-blur-sm"
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
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  {schedulingStatus[showScheduleModal] === 'scheduling' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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