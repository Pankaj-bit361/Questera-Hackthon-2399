import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { imageAPI, videoAPI, creditsAPI } from '../lib/api';
import { getUser, getUserId, logout as velosLogout } from '../lib/velosStorage';

const { FiPlus, FiSearch, FiSettings, FiLogOut, FiZap, FiUser, FiCalendar, FiTrendingUp, FiVideo, FiImage } = FiIcons;

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
            className="fixed top-0 left-0 h-full w-[280px] bg-[#09090b] border-r border-white/5 z-50 flex flex-col font-sans shadow-2xl"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            {/* Header */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white font-bold text-xl cursor-pointer group" onClick={() => navigate('/home')}>
                <img
                  src="/velos-logo.svg"
                  alt="Velos AI"
                  className="w-9 h-9 transition-transform group-hover:scale-105"
                />
                <span className="tracking-tight font-display text-white/90">Velos</span>
              </div>
            </div>

         

            {/* Search */}
            <div className="px-5 pb-2">
              <div className="relative group">
                <SafeIcon icon={FiSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  placeholder="Search history..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#18181b] text-zinc-300 placeholder-zinc-600 text-sm rounded-xl pl-9 pr-4 py-2.5 border border-white/5 focus:border-white/10 focus:bg-[#202023] outline-none transition-all"
                />
              </div>
            </div>

            {/* Toggle Tabs */}
            <div className="px-5 pb-3">
              <div className="flex bg-[#18181b] rounded-lg p-1 border border-white/5">
                <button
                  onClick={() => setActiveTab('images')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${activeTab === 'images'
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  <SafeIcon icon={FiImage} className="w-3.5 h-3.5" />
                  Images
                  {imageChats.length > 0 && (
                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{imageChats.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('videos')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${activeTab === 'videos'
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  <SafeIcon icon={FiVideo} className="w-3.5 h-3.5" />
                  Videos
                  {videoChats.length > 0 && (
                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{videoChats.length}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Chat History List */}
            <div className="flex-1 overflow-y-auto px-3 custom-scrollbar py-2">
              <div className="space-y-0.5">
                {activeTab === 'images' ? (
                  // Image Chats
                  filteredImageChats.length > 0 ? (
                    filteredImageChats.map((chat) => (
                      <button
                        key={chat.imageChatId}
                        onClick={() => handleChatClick(chat.imageChatId)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all text-left group overflow-hidden ${location.pathname.includes(chat.imageChatId)
                          ? 'bg-[#18181b] text-white border border-white/5 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50 border border-transparent'
                          }`}
                      >
                        <SafeIcon icon={FiImage} className={`w-4 h-4 flex-shrink-0 ${location.pathname.includes(chat.imageChatId) ? 'text-purple-400' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                        <span className="truncate font-medium text-[13px] opacity-90">
                          {chat.name || chat.title || 'Untitled Chat'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-xs text-zinc-600 text-center italic">
                      No image chats yet
                    </div>
                  )
                ) : (
                  // Video Chats
                  filteredVideoChats.length > 0 ? (
                    filteredVideoChats.map((chat) => (
                      <button
                        key={chat.videoChatId}
                        onClick={() => navigate(`/video/${chat.videoChatId}`)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all text-left group overflow-hidden ${location.pathname.includes(chat.videoChatId)
                          ? 'bg-[#18181b] text-white border border-white/5 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50 border border-transparent'
                          }`}
                      >
                        <SafeIcon icon={FiVideo} className={`w-4 h-4 flex-shrink-0 ${location.pathname.includes(chat.videoChatId) ? 'text-cyan-400' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                        <span className="truncate font-medium text-[13px] opacity-90">
                          {chat.name || chat.title || 'Untitled Video'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-xs text-zinc-600 text-center italic">
                      No video chats yet
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Footer Section */}
            <div className="p-4 bg-[#09090b] space-y-3 relative z-10 box-border border-t border-white/5">

              {/* Unified Credits Card */}
              <div className="bg-[#121214] border border-white/5 rounded-xl p-3 flex items-center justify-between group hover:border-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/5">
                    <SafeIcon icon={FiZap} className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white text-xs font-semibold">{credits.balance} Credits</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{credits.planName} Plan</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/pricing')}
                  className="text-[10px] font-bold text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors"
                >
                  Buy
                </button>
              </div>

              {/* Menu Items */}
              <div className="space-y-0.5">

                {/* <button
                onClick={() => navigate('/templates')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/templates' ? 'bg-[#18181b] text-white' : ''}`}
              >
                <SafeIcon icon={FiLayout} className="w-4 h-4 text-cyan-400" />
                <span className="text-[13px] font-medium">Templates</span>
              </button> */}

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
                  onClick={() => navigate('/settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#18181b] rounded-lg transition-colors ${location.pathname === '/settings' ? 'bg-[#18181b] text-white' : ''}`}
                >
                  <SafeIcon icon={FiSettings} className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                  <span className="text-[13px] font-medium">Settings</span>
                </button>
              </div>

              {/* User Profile - Compact */}
              <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between group cursor-pointer hover:opacity-100 opacity-80 transition-opacity">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-bold text-white">
                    {user.name ? user.name[0].toUpperCase() : <SafeIcon icon={FiUser} className="w-3 h-3" />}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-[12px] font-medium text-white truncate">{user.name || 'Account'}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <SafeIcon icon={FiLogOut} className="w-3.5 h-3.5 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer" />
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal - Outside Sidebar Hierarchy */}
      <AnimatePresence>
        {showLogoutModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            {/* Modal - Centered over sidebar area */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[320px] bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <SafeIcon icon={FiLogOut} className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Logout</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Are you sure? You need to sign in again later.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setShowLogoutModal(false)}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wide rounded-xl border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wide rounded-xl transition-colors shadow-lg shadow-red-500/20"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;