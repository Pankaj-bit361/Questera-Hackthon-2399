import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { imageAPI } from '../lib/api';

const { FiPlus, FiSearch, FiMessageSquare, FiTrendingUp, FiSettings, FiLogOut, FiX } = FiIcons;

const Sidebar = ({ isOpen, onMouseEnter, onMouseLeave }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState({});

  // Fetch chats when sidebar opens or component mounts
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    if (userData.userId) {
      fetchChats(userData.userId);
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
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-xl cursor-pointer" onClick={() => navigate('/home')}>
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span className="text-black text-lg">⚡</span>
              </div>
              <span className="tracking-tight">Velos</span>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="px-4 pb-2">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-3 bg-white text-black hover:bg-zinc-200 px-4 py-3 rounded-xl transition-all text-sm font-bold shadow-lg shadow-white/5 group"
            >
              <SafeIcon icon={FiPlus} className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              New Creation
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-4 pt-3">
            <div className="relative group">
              <SafeIcon icon={FiSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4 group-focus-within:text-white transition-colors" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1c1c1e] text-zinc-300 placeholder-zinc-600 text-sm rounded-xl pl-9 pr-4 py-2.5 border border-transparent focus:border-zinc-700 outline-none transition-all"
              />
            </div>
          </div>

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto px-4 space-y-6 custom-scrollbar">
            <div>
              <h3 className="text-[11px] font-bold text-zinc-500 mb-3 uppercase tracking-wider">Your Creations</h3>
              <div className="space-y-1">
                {filteredChats.length > 0 ? (
                  filteredChats.map((chat) => (
                    <button
                      key={chat.imageChatId}
                      onClick={() => handleChatClick(chat.imageChatId)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-sm rounded-xl transition-all text-left group relative overflow-hidden ${
                        location.pathname.includes(chat.imageChatId)
                          ? 'bg-[#1c1c1e] text-white border border-white/5 shadow-md'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1c1e]/50 border border-transparent'
                      }`}
                    >
                      <SafeIcon icon={FiMessageSquare} className={`w-4 h-4 flex-shrink-0 ${location.pathname.includes(chat.imageChatId) ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                      <span className="truncate font-medium relative z-10">
                        {chat.name || chat.title || 'Untitled Chat'}
                      </span>
                      {location.pathname.includes(chat.imageChatId) && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white rounded-r-full"></div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-xs text-zinc-600 text-center italic border border-dashed border-zinc-800 rounded-xl">
                    No history found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Menu */}
          <div className="p-4 space-y-1 border-t border-white/5 bg-[#09090b]">
            <button 
              onClick={() => navigate('/pricing')}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 hover:border-purple-500/50 rounded-xl transition-all group"
            >
              <SafeIcon icon={FiTrendingUp} className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
              <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">Upgrade Plan</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-[#1c1c1e] text-white border border-white/5'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1c1c1e]'
              }`}
            >
              <SafeIcon icon={FiSettings} className="w-4 h-4" />
              Settings
            </button>
          </div>

          {/* User Profile */}
          <div className="p-4 border-t border-white/5 bg-[#09090b]">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#1c1c1e] transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-lg ring-2 ring-black group-hover:ring-zinc-700 transition-all">
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm text-white font-bold truncate">{user.name || 'User'}</div>
                <div className="text-[11px] text-zinc-500 truncate group-hover:text-zinc-400 transition-colors">{user.email}</div>
              </div>
              <SafeIcon icon={FiLogOut} className="w-4 h-4 text-zinc-600 group-hover:text-red-400 transition-colors" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;