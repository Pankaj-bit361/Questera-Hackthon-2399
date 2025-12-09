import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiUser, FiZap, FiDownload, FiRefreshCw, FiSend, FiCheck, FiX, FiChevronDown } = FiIcons;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const MessageList = ({ messages, loading }) => {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const [publishingIdx, setPublishingIdx] = useState(null);
  const [publishStatus, setPublishStatus] = useState({}); // { idx: 'success' | 'error' | 'publishing' }
  const [instagramAccounts, setInstagramAccounts] = useState([]);
  const [showAccountPicker, setShowAccountPicker] = useState(null); // idx of image showing picker
  const [selectedAccount, setSelectedAccount] = useState(null); // selected account ID
  const [selectedAccountPerImage, setSelectedAccountPerImage] = useState({}); // { idx: accountId } - tracks selection per image

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
        const response = await fetch(`${API_URL}/api/instagram/info/${user.userId}`);
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

  const handleDownload = (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `velos-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      const response = await fetch(`${API_URL}/api/instagram/publish`, {
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

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-8 py-8" ref={scrollRef}>
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

              {/* Text Bubble */}
              {msg.content && (
                <div className={`relative px-6 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm backdrop-blur-sm group ${msg.role === 'user'
                  ? 'bg-[#27272a] text-zinc-100 border border-white/5 rounded-tr-sm'
                  : 'bg-transparent text-zinc-300 pl-0 pt-1 border-none shadow-none'
                  }`}>
                  {msg.content}
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
                <div className="relative group rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#09090b] mt-2 transition-transform hover:scale-[1.01] duration-500">
                  <img
                    src={msg.imageUrl}
                    alt="Generated by Velos"
                    className="max-w-full sm:max-w-lg h-auto object-cover block"
                    loading="lazy"
                  />

                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-6">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDownload(msg.imageUrl)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors shadow-lg"
                      >
                        <SafeIcon icon={FiDownload} className="w-4 h-4" />
                        Download
                      </button>

                      {/* Publish to Instagram Button */}
                      <div className="relative">
                        {(() => {
                          const selectedId = getSelectedAccountForImage(idx);
                          const selectedAcc = getAccountById(selectedId);
                          const hasMultiple = instagramAccounts.length > 1;

                          return (
                            <>
                              <div className="flex items-center">
                                {/* Main Publish Button - always publishes to selected account */}
                                <button
                                  onClick={() => handlePublish(msg.imageUrl, idx, selectedId)}
                                  disabled={publishingIdx === idx}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${publishStatus[idx] === 'success'
                                    ? 'bg-emerald-500 text-white'
                                    : publishStatus[idx] === 'error'
                                      ? 'bg-red-500 text-white'
                                      : 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white hover:opacity-90'
                                    } ${hasMultiple ? 'rounded-r-none' : ''}`}
                                >
                                  {publishStatus[idx] === 'publishing' ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                      Publishing...
                                    </>
                                  ) : publishStatus[idx] === 'success' ? (
                                    <>
                                      <SafeIcon icon={FiCheck} className="w-4 h-4" />
                                      Published!
                                    </>
                                  ) : publishStatus[idx] === 'error' ? (
                                    <>
                                      <SafeIcon icon={FiX} className="w-4 h-4" />
                                      Failed
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                                      </svg>
                                      {hasMultiple && selectedAcc ? (
                                        <span className="flex items-center gap-1.5">
                                          Publish to @{selectedAcc.username}
                                        </span>
                                      ) : (
                                        'Publish'
                                      )}
                                    </>
                                  )}
                                </button>

                                {/* Dropdown arrow for multiple accounts */}
                                {hasMultiple && !publishStatus[idx] && (
                                  <button
                                    onClick={() => toggleAccountPicker(idx)}
                                    className="px-2 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-r-xl hover:opacity-90 transition-all border-l border-white/20"
                                    title="Change account"
                                  >
                                    <SafeIcon icon={FiChevronDown} className={`w-4 h-4 transition-transform ${showAccountPicker === idx ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {/* Account Picker Dropdown - just selects, doesn't publish */}
                              <AnimatePresence>
                                {showAccountPicker === idx && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 left-0 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                                  >
                                    <div className="p-2 border-b border-zinc-800">
                                      <p className="text-xs text-zinc-500 font-medium px-2">Select account to publish</p>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                      {instagramAccounts.map((account) => (
                                        <button
                                          key={account.id}
                                          onClick={() => handleSelectAccount(idx, account.id)}
                                          className={`w-full flex items-center gap-3 p-3 hover:bg-zinc-800 transition-colors text-left ${selectedId === account.id ? 'bg-zinc-800/50' : ''}`}
                                        >
                                          {account.profilePictureUrl ? (
                                            <img
                                              src={account.profilePictureUrl}
                                              alt={account.username}
                                              className={`w-8 h-8 rounded-full ${selectedId === account.id ? 'ring-2 ring-pink-500' : ''}`}
                                            />
                                          ) : (
                                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center ${selectedId === account.id ? 'ring-2 ring-pink-500' : ''}`}>
                                              <span className="text-white text-xs font-bold">
                                                {account.username?.[0]?.toUpperCase() || 'U'}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">@{account.username}</p>
                                            <p className="text-zinc-500 text-xs truncate">{account.facebookPageName || 'Instagram Business'}</p>
                                          </div>
                                          {selectedId === account.id && (
                                            <SafeIcon icon={FiCheck} className="w-4 h-4 text-pink-500" />
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

                      <button className="p-2 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-xl transition-all border border-white/10" title="Remix">
                        <SafeIcon icon={FiRefreshCw} className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Loading Indicator */}
        {loading && (
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
        )}

        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
};

export default MessageList;