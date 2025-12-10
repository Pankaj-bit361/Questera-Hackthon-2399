import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { imageAPI, creditsAPI } from '../lib/api';

const { FiPlus, FiSearch, FiMessageSquare, FiSettings, FiLogOut, FiZap, FiUser, FiCalendar, FiLayout } = FiIcons;

const Sidebar = ({ isOpen, onMouseEnter, onMouseLeave }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState({});
  const [credits, setCredits] = useState({ balance: 0, plan: 'free', planName: 'Free' });

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
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    if (userData.userId) {
      fetchChats(userData.userId);
      fetchCredits(userData.userId);
    }
  }, [isOpen]);

  const fetchChats = async (userId) => {
    try {
      // FIX: Response is the JSON object itself, not wrapped in {data}
      const response = await imageAPI.getUserConversations(userId);
      setChats(response.conversations || []);
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
  const filteredChats = chats.filter(chat => {
    const title = chat.name || chat.title || 'Untitled Chat';
    return title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
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
              <div className="w-9 h-9 bg-gradient-to-tr from-white to-zinc-200 rounded-xl flex items-center justify-center shadow-lg shadow-white/5 transition-transform group-hover:scale-105">
                <span className="text-black text-lg">⚡</span>
              </div>
              <span className="tracking-tight font-display text-white/90">Velos</span>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="px-5 pb-4">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold shadow-lg shadow-black/20 active:scale-[0.98] group backdrop-blur-md"
            >
              <SafeIcon icon={FiPlus} className="w-4 h-4 text-zinc-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
              <span className="text-zinc-200 group-hover:text-white transition-colors">New Creation</span>
            </button>
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

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto px-3 space-y-6 custom-scrollbar py-2">
            <div>
              <h3 className="px-3 text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-widest opacity-80">History</h3>
              <div className="space-y-0.5">
                {filteredChats.length > 0 ? (
                  filteredChats.map((chat) => (
                    <button
                      key={chat.imageChatId}
                      onClick={() => handleChatClick(chat.imageChatId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all text-left group overflow-hidden ${location.pathname.includes(chat.imageChatId)
                        ? 'bg-[#18181b] text-white border border-white/5 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50 border border-transparent'
                        }`}
                    >
                      <SafeIcon icon={FiMessageSquare} className={`w-4 h-4 flex-shrink-0 ${location.pathname.includes(chat.imageChatId) ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                      <span className="truncate font-medium text-[13px] opacity-90">
                        {chat.name || chat.title || 'Untitled Chat'}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-xs text-zinc-600 text-center italic">
                    No history found
                  </div>
                )}
              </div>
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
              <SafeIcon icon={FiLogOut} className="w-3.5 h-3.5 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer" />
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;