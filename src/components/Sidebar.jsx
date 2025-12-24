import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { imageAPI, videoAPI, creditsAPI } from '../lib/api';
import { getUser, getUserId, logout as velosLogout } from '../lib/velosStorage';

const { FiPlus, FiSearch, FiSettings, FiLogOut, FiZap, FiUser, FiCalendar, FiTrendingUp, FiVideo, FiImage, FiMail } = FiIcons;

const Sidebar = ({ isOpen, onMouseEnter, onMouseLeave }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [imageChats, setImageChats] = useState([]);
  const [videoChats, setVideoChats] = useState([]);
  const [activeTab, setActiveTab] = useState('images'); // 'images' or 'videos'
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState({});
  const [credits, setCredits] = useState({ balance: 0, plan: 'free', planName: 'Free' });
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Handle logout
  const handleLogout = () => {
    velosLogout();
    setShowLogoutModal(false);
    navigate('/', { replace: true });
  };

  // Fetch credits
  const fetchCredits = async (userId) => {
    try {
      const data = await creditsAPI.getCredits(userId);
      if (data.success) {
        setCredits({ balance: data.credits.balance, plan: data.credits.plan, planName: data.credits.planName });
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  // Fetch chats and credits when sidebar opens or component mounts
  useEffect(() => {
    const userData = getUser() || {};
    setUser(userData);
    const userId = getUserId();
    if (userId) {
      fetchChats(userId);
      fetchCredits(userId);
    }
  }, [isOpen]);

  const fetchChats = async (userId) => {
    try {
      // Fetch both image and video conversations in parallel
      const [imageRes, videoRes] = await Promise.all([
        imageAPI.getUserConversations(userId),
        videoAPI.getUserConversations(userId),
      ]);
      setImageChats(imageRes.conversations || []);
      setVideoChats(videoRes.conversations || []);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    }
  };

  const handleChatClick = (chatId) => {
    navigate(`/chat/${chatId}`);
  };

  const handleNewChat = () => {
    navigate('/chat/new');
  };

  // Filter chats based on search
  const filteredImageChats = imageChats.filter(chat => {
    const title = chat.name || chat.title || 'Untitled Chat';
    return title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredVideoChats = videoChats.filter(chat => {
    const title = chat.name || chat.title || 'Untitled Video';
    return title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 h-full w-[280px] bg-[#09090b] border-r border-white/5 z-50 flex flex-col font-sans shadow-2xl overflow-hidden"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            {/* Header */}
            <div className="px-5 pt-6 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white font-bold text-xl cursor-pointer group" onClick={() => navigate('/home')}>
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-lg rounded-full" />
                  <img
                    src="/velos-logo.svg"
                    alt="Velos AI"
                    className="relative w-8 h-8 transition-transform group-hover:scale-105"
                  />
                </div>
                <span className="tracking-tight font-display text-white/90">Velos</span>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 pb-4">
              <div className="relative group">
                <SafeIcon icon={FiSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  placeholder="Search history..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#18181b] text-zinc-300 placeholder-zinc-600 text-[13px] rounded-xl pl-9 pr-3 py-2.5 border border-white/5 focus:border-white/10 focus:bg-[#202023] outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Toggle Tabs */}
            <div className="px-4 pb-3">
              <div className="flex bg-[#121214] rounded-xl p-1 border border-white/5 shadow-inner">
                <button
                  onClick={() => setActiveTab('images')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${activeTab === 'images'
                    ? 'bg-[#27272a] text-white shadow-sm ring-1 ring-white/5'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  <SafeIcon icon={FiImage} className="w-3 h-3" />
                  Images
                  {imageChats.length > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'images' ? 'bg-black/30 text-white' : 'bg-[#27272a] text-zinc-500'}`}>{imageChats.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('videos')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${activeTab === 'videos'
                    ? 'bg-[#27272a] text-white shadow-sm ring-1 ring-white/5'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  <SafeIcon icon={FiVideo} className="w-3 h-3" />
                  Videos
                  {videoChats.length > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'videos' ? 'bg-black/30 text-white' : 'bg-[#27272a] text-zinc-500'}`}>{videoChats.length}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Chat History List */}
            <div className="flex-1 overflow-y-auto px-3 custom-scrollbar py-2">
              <div className="space-y-1">
                {activeTab === 'images' ? (
                  // Image Chats
                  filteredImageChats.length > 0 ? (
                    filteredImageChats.map((chat) => (
                      <button
                        key={chat.imageChatId}
                        onClick={() => handleChatClick(chat.imageChatId)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all text-left group border ${location.pathname.includes(chat.imageChatId)
                          ? 'bg-[#18181b] border-white/5 text-white shadow-sm'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50'
                          }`}
                      >
                        <SafeIcon icon={FiImage} className={`w-3.5 h-3.5 flex-shrink-0 ${location.pathname.includes(chat.imageChatId) ? 'text-blue-400' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                        <span className="truncate font-medium text-[13px]">
                          {chat.name || chat.title || 'Untitled Chat'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-12 text-zinc-600 gap-3 opacity-60">
                      <SafeIcon icon={FiImage} className="w-6 h-6" />
                      <span className="text-xs">No image chats yet</span>
                    </div>
                  )
                ) : (
                  // Video Chats
                  filteredVideoChats.length > 0 ? (
                    filteredVideoChats.map((chat) => (
                      <button
                        key={chat.videoChatId}
                        onClick={() => navigate(`/video/${chat.videoChatId}`)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all text-left group border ${location.pathname.includes(chat.videoChatId)
                          ? 'bg-[#18181b] border-white/5 text-white shadow-sm'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50'
                          }`}
                      >
                        <SafeIcon icon={FiVideo} className={`w-3.5 h-3.5 flex-shrink-0 ${location.pathname.includes(chat.videoChatId) ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                        <span className="truncate font-medium text-[13px]">
                          {chat.name || chat.title || 'Untitled Video'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-12 text-zinc-600 gap-3 opacity-60">
                      <SafeIcon icon={FiVideo} className="w-6 h-6" />
                      <span className="text-xs">No video chats yet</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Footer Section */}
            <div className="p-4 bg-[#09090b] space-y-3 relative z-10 box-border border-t border-white/5">

              {/* Unified Credits Card */}
              <div className="bg-gradient-to-br from-[#18181b] to-[#0c0c0e] border border-white/5 rounded-xl p-3 flex items-center justify-between group hover:border-white/10 transition-colors shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-white/5 blur-xl rounded-full pointer-events-none" />
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/5 ring-1 ring-white/5 shadow-inner">
                    <SafeIcon icon={FiZap} className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white text-xs font-bold">{credits.balance} Credits</span>
                    <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{credits.planName}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/pricing')}
                  className="relative z-10 text-[10px] font-bold text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/5 transition-colors"
                >
                  Upgrade
                </button>
              </div>

              {/* Menu Items */}
              <div className="space-y-0.5 pt-1">
                <button
                  onClick={() => navigate('/scheduler')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/scheduler' ? 'bg-[#18181b] text-white' : ''}`}
                >
                  <SafeIcon icon={FiCalendar} className="w-4 h-4 text-purple-400" />
                  <span className="text-[13px] font-medium">Scheduler</span>
                </button>
                <button
                  onClick={() => navigate('/analytics')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/analytics' ? 'bg-[#18181b] text-white' : ''}`}
                >
                  <SafeIcon icon={FiTrendingUp} className="w-4 h-4 text-emerald-400" />
                  <span className="text-[13px] font-medium">Analytics</span>
                </button>
                <button
                  onClick={() => navigate('/email-campaign')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/email-campaign' ? 'bg-[#18181b] text-white' : ''}`}
                >
                  <SafeIcon icon={FiMail} className="w-4 h-4 text-blue-400" />
                  <span className="text-[13px] font-medium">Email Campaign</span>
                </button>
                <button
                  onClick={() => navigate('/settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/settings' ? 'bg-[#18181b] text-white' : ''}`}
                >
                  <SafeIcon icon={FiSettings} className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  <span className="text-[13px] font-medium">Settings</span>
                </button>
              </div>

              {/* User Profile - Compact */}
              <div className="pt-3 mt-1 border-t border-white/5 flex items-center justify-between group">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-bold text-white shadow-inner">
                    {user.name ? user.name[0].toUpperCase() : <SafeIcon icon={FiUser} className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-white truncate leading-none">{user.name || 'Account'}</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 ring-2 ring-[#09090b]" />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 hover:text-red-400 text-zinc-500 transition-all opacity-0 group-hover:opacity-100"
                  title="Sign out"
                >
                  <SafeIcon icon={FiLogOut} className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Global Logout Modal --- */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowLogoutModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="w-full max-w-[340px] bg-[#09090b] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background glow */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-red-600/10 blur-[60px] rounded-full pointer-events-none" />

              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 rounded-full bg-[#18181b] flex items-center justify-center mb-5 border border-white/5 ring-1 ring-white/5 shadow-inner">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <SafeIcon icon={FiLogOut} className="w-5 h-5 text-red-500" />
                  </div>
                </div>

                <h3 className="text-white font-bold text-lg mb-2">Log out of Velos?</h3>
                <p className="text-zinc-500 text-sm leading-relaxed mb-8 px-4">
                  You can always log back in at any time. If you just want to switch accounts, you can do that too.
                </p>

                <div className="flex flex-col gap-3 w-full">
                  <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
                  >
                    Log Out
                  </button>
                  <button
                    onClick={() => setShowLogoutModal(false)}
                    className="w-full py-3 bg-transparent text-zinc-400 text-sm font-semibold rounded-xl hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;