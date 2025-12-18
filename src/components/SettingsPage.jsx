import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import InstagramIntegration from './InstagramIntegration';
import { getUserId } from '../lib/velosStorage';

const { FiChevronLeft, FiLink, FiUser, FiBell, FiShield } = FiIcons;

const SettingsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('integrations');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const userId = getUserId();

  const tabs = [
    { id: 'integrations', label: 'Integrations', icon: FiLink },
    { id: 'profile', label: 'Profile', icon: FiUser },
    { id: 'notifications', label: 'Notifications', icon: FiBell },
    { id: 'security', label: 'Security', icon: FiShield },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      />

      {/* Sidebar Trigger */}
      <div
        className="fixed top-0 left-0 w-4 h-full z-40"
        onMouseEnter={() => setSidebarOpen(true)}
      />

      {/* Main Content */}
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="text-lg font-bold">Settings</h1>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-8">
          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-[#1c1c1e] rounded-xl mb-8 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                  ? 'bg-white text-black shadow-lg'
                  : 'text-zinc-400 hover:text-white'
                  }`}
              >
                <SafeIcon icon={tab.icon} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'integrations' && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold mb-1">Integrations</h2>
                  <p className="text-zinc-500 text-sm">Connect your accounts to publish content directly.</p>
                </div>

                {/* Instagram */}
                <InstagramIntegration userId={userId} />

                {/* Coming Soon */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Coming Soon</h3>

                  <div className="flex items-center gap-4 p-4 bg-[#1c1c1e] rounded-xl border border-zinc-800/50 opacity-50">
                    <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                      <span className="text-zinc-400 font-bold">𝕏</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">Twitter / X</p>
                      <p className="text-zinc-600 text-xs">Post updates and threads</p>
                    </div>
                    <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-500 text-[10px] font-bold uppercase">Soon</span>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-[#1c1c1e] rounded-xl border border-zinc-800/50 opacity-50">
                    <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                      <span className="text-zinc-400 font-bold">f</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">Facebook</p>
                      <p className="text-zinc-600 text-xs">Share to your page</p>
                    </div>
                    <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-500 text-[10px] font-bold uppercase">Soon</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="p-8 bg-[#1c1c1e] rounded-xl border border-zinc-800/50 text-center">
                  <SafeIcon icon={FiUser} className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Profile settings coming soon</p>
                </div>
              </motion.div>
            )}

            {activeTab === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="p-8 bg-[#1c1c1e] rounded-xl border border-zinc-800/50 text-center">
                  <SafeIcon icon={FiBell} className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Notification preferences coming soon</p>
                </div>
              </motion.div>
            )}

            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="p-8 bg-[#1c1c1e] rounded-xl border border-zinc-800/50 text-center">
                  <SafeIcon icon={FiShield} className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Security settings coming soon</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;