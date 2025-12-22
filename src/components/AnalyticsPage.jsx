import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { analyticsAPI } from '../lib/api';
import { getUserId } from '../lib/velosStorage';

const { FiChevronLeft, FiRefreshCw, FiTrendingUp, FiHeart, FiEye, FiMessageCircle, FiClock, FiCalendar, FiHash, FiAward, FiBarChart2, FiPlay, FiImage, FiInstagram, FiChevronDown, FiExternalLink } = FiIcons;

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState(30);
  const hasAutoRefreshed = useRef(false);

  // Account selector states
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAccountSelector, setShowAccountSelector] = useState(false);

  // Data states
  const [dashboard, setDashboard] = useState(null);
  const [instagramData, setInstagramData] = useState(null);
  const [bestTimes, setBestTimes] = useState(null);
  const [contentAnalysis, setContentAnalysis] = useState(null);
  const [dataSource, setDataSource] = useState('instagram'); // 'instagram' (live) or 'database'

  const userId = getUserId();

  // Auto-refresh on page load (only once)
  useEffect(() => {
    if (userId && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      loadAccountsAndRefresh();
    }
  }, [userId]);

  // Reload when dateRange or account changes
  useEffect(() => {
    if (userId && hasAutoRefreshed.current) {
      fetchAllData();
    }
  }, [dateRange, selectedAccount]);

  const loadAccountsAndRefresh = async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      // Load accounts first
      const accountsRes = await analyticsAPI.getAccounts(userId);
      if (accountsRes.success && accountsRes.accounts) {
        setAccounts(accountsRes.accounts);
        if (accountsRes.accounts.length > 0 && !selectedAccount) {
          setSelectedAccount(accountsRes.accounts[0]);
        }
      }

      // Auto-refresh engagement data from Instagram
      await analyticsAPI.refreshEngagement(userId);

      // Then fetch all data
      await fetchAllData();
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAllData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const accountId = selectedAccount?.igBusinessId || null;

      // Fetch from Instagram API directly for real-time data (up to 100 posts)
      const [instagramRes, dashboardRes, bestTimesRes, contentRes] = await Promise.all([
        analyticsAPI.getInstagramDirect(userId, accountId, 100),
        analyticsAPI.getDashboard(userId, dateRange, 100),
        analyticsAPI.getBestTimes(userId),
        analyticsAPI.getContentAnalysis(userId),
      ]);

      if (instagramRes.success) setInstagramData(instagramRes);
      if (dashboardRes.success) setDashboard(dashboardRes);
      if (bestTimesRes.success) setBestTimes(bestTimesRes);
      if (contentRes.success) setContentAnalysis(contentRes);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await analyticsAPI.refreshEngagement(userId);
      await fetchAllData();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FiBarChart2 },
    { id: 'timing', label: 'Best Times', icon: FiClock },
    { id: 'content', label: 'Content', icon: FiHash },
  ];

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <Sidebar isOpen={isSidebarOpen} onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)} />
      <div className="fixed top-0 left-0 w-4 h-full z-40" onMouseEnter={() => setSidebarOpen(true)} />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/home')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
              <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="text-lg font-bold flex items-center gap-2">
              <SafeIcon icon={FiTrendingUp} className="w-5 h-5 text-emerald-400" />
              Analytics
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Account Selector */}
            {accounts.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAccountSelector(!showAccountSelector)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg text-sm hover:border-white/20 transition-colors"
                >
                  <SafeIcon icon={FiInstagram} className="w-4 h-4 text-pink-400" />
                  <span className="text-white">@{selectedAccount?.username || 'Select Account'}</span>
                  <SafeIcon icon={FiChevronDown} className={`w-4 h-4 text-zinc-400 transition-transform ${showAccountSelector ? 'rotate-180' : ''}`} />
                </button>
                {showAccountSelector && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-white/5">
                      <span className="text-xs text-zinc-500 px-2">Select Instagram Account</span>
                    </div>
                    {accounts.map((acc) => (
                      <button
                        key={acc.igBusinessId}
                        onClick={() => {
                          setSelectedAccount(acc);
                          setShowAccountSelector(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                          selectedAccount?.igBusinessId === acc.igBusinessId ? 'bg-white/10' : ''
                        }`}
                      >
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                          <SafeIcon icon={FiInstagram} className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-left">
                          <div className="text-sm text-white font-medium">@{acc.username}</div>
                        </div>
                        {selectedAccount?.igBusinessId === acc.igBusinessId && (
                          <div className="ml-auto w-2 h-2 bg-emerald-400 rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value))}
              className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/20"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <SafeIcon icon={FiRefreshCw} className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-[#1c1c1e] rounded-xl mb-8 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-black shadow-lg' : 'text-zinc-400 hover:text-white'
                }`}
            >
              <SafeIcon icon={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-zinc-500 text-sm">{refreshing ? 'Syncing with Instagram...' : 'Loading analytics...'}</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab instagramData={instagramData} dashboard={dashboard} formatNumber={formatNumber} />}
            {activeTab === 'timing' && <TimingTab bestTimes={bestTimes} />}
            {activeTab === 'content' && <ContentTab contentAnalysis={contentAnalysis} />}
          </>
        )}
      </main>
    </div>
  );
};

// Overview Tab Component - Now shows Instagram data directly
const OverviewTab = ({ instagramData, dashboard, formatNumber }) => {
  const [visiblePosts, setVisiblePosts] = useState(9);

  // Use Instagram data if available, fallback to dashboard
  const posts = instagramData?.posts || [];
  const totals = instagramData?.totals || {};
  const overview = dashboard?.overview || {};
  const accountName = instagramData?.account?.username;

  // Calculate stats from Instagram data or fall back to dashboard
  const totalPosts = posts.length || overview.totalPosts || 0;
  const totalEngagement = (totals.likes || 0) + (totals.comments || 0) + (totals.saves || 0) || overview.totalEngagement || 0;
  const totalViews = totals.views || overview.totalImpressions || 0;
  const totalReach = totals.reach || overview.totalReach || 0;
  const avgEngagement = totalPosts > 0 ? Math.round(totalEngagement / totalPosts) : 0;

  const stats = [
    { label: 'Total Posts', value: formatNumber(totalPosts), icon: FiCalendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Total Engagement', value: formatNumber(totalEngagement), icon: FiHeart, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { label: 'Total Views', value: formatNumber(totalViews), icon: FiEye, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Total Reach', value: formatNumber(totalReach), icon: FiTrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  // Sort posts by engagement (likes + comments)
  const sortedPosts = [...posts].sort((a, b) => {
    const engA = (a.likes || 0) + (a.comments || 0);
    const engB = (b.likes || 0) + (b.comments || 0);
    return engB - engA;
  });

  const displayedPosts = sortedPosts.slice(0, visiblePosts);
  const hasMorePosts = visiblePosts < sortedPosts.length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Live Data Badge */}
      {instagramData && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>Live data from @{accountName}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-[#121214] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors"
          >
            <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
              <SafeIcon icon={stat.icon} className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Top Performing Posts */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SafeIcon icon={FiAward} className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">Top Performing Posts</h2>
          </div>
          <span className="text-xs text-zinc-500">{displayedPosts.length} of {sortedPosts.length} posts</span>
        </div>
        {displayedPosts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedPosts.map((post, idx) => {
                const isVideo = post.mediaType === 'VIDEO' || post.mediaType === 'REEL';
                const mediaUrl = post.thumbnailUrl || post.mediaUrl;
                const hasMedia = !!mediaUrl;

                return (
                  <motion.div
                    key={post.id || idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-zinc-900/50 rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-colors group"
                  >
                    <div className="aspect-square bg-zinc-800 relative overflow-hidden">
                      {hasMedia ? (
                        <img
                          src={mediaUrl}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                          <SafeIcon icon={isVideo ? FiPlay : FiImage} className="w-12 h-12 mb-2" />
                          <span className="text-xs">{isVideo ? 'Video' : 'Image'}</span>
                        </div>
                      )}
                      {isVideo && (
                        <div className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5">
                          <SafeIcon icon={FiPlay} className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {/* Link to Instagram */}
                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-2 left-2 bg-black/70 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <SafeIcon icon={FiExternalLink} className="w-3 h-3 text-white" />
                        </a>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-sm text-zinc-300 line-clamp-2 mb-3">{post.caption || 'No caption'}</p>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <SafeIcon icon={FiHeart} className="w-3.5 h-3.5 text-pink-400" />
                          {post.likes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <SafeIcon icon={FiMessageCircle} className="w-3.5 h-3.5 text-blue-400" />
                          {post.comments || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <SafeIcon icon={FiEye} className="w-3.5 h-3.5 text-emerald-400" />
                          {post.views || 0}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            {/* Load More Button */}
            {hasMorePosts && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => setVisiblePosts(prev => prev + 9)}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                >
                  Load More ({sortedPosts.length - visiblePosts} remaining)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-zinc-500">
            <SafeIcon icon={FiBarChart2} className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No posts yet. Start creating and scheduling content!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Timing Tab Component - Best posting times heatmap
const TimingTab = ({ bestTimes }) => {
  const byHour = bestTimes?.byHour || [];
  const byDay = bestTimes?.byDay || [];
  const recommendation = bestTimes?.recommendation || 'Post consistently for best results';

  const maxEngagement = Math.max(...byHour.map(h => h.avgEngagement), 1);

  const getHeatColor = (value) => {
    const intensity = value / maxEngagement;
    if (intensity > 0.8) return 'bg-emerald-500';
    if (intensity > 0.6) return 'bg-emerald-600';
    if (intensity > 0.4) return 'bg-emerald-700';
    if (intensity > 0.2) return 'bg-emerald-800';
    if (intensity > 0) return 'bg-emerald-900';
    return 'bg-zinc-800';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Recommendation Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <SafeIcon icon={FiClock} className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Best Time to Post</h3>
            <p className="text-zinc-300">{recommendation}</p>
          </div>
        </div>
      </div>

      {/* Hourly Heatmap */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-6">Engagement by Hour</h2>
        <div className="grid grid-cols-12 gap-2">
          {byHour.slice(6, 24).map((hour) => (
            <div key={hour.hour} className="text-center">
              <div
                className={`aspect-square rounded-lg ${getHeatColor(hour.avgEngagement)} flex items-center justify-center mb-2 transition-all hover:scale-110`}
                title={`${hour.label}: ${hour.avgEngagement} avg engagement`}
              >
                <span className="text-xs font-bold text-white/80">{hour.posts}</span>
              </div>
              <span className="text-[10px] text-zinc-500">{hour.hour}h</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-zinc-500">
          <span>Low</span>
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded bg-zinc-800" />
            <div className="w-4 h-4 rounded bg-emerald-900" />
            <div className="w-4 h-4 rounded bg-emerald-700" />
            <div className="w-4 h-4 rounded bg-emerald-500" />
          </div>
          <span>High</span>
        </div>
      </div>

      {/* Day of Week Chart */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-6">Engagement by Day</h2>
        <div className="space-y-3">
          {byDay.map((day) => {
            const maxDayEng = Math.max(...byDay.map(d => d.avgEngagement), 1);
            const width = (day.avgEngagement / maxDayEng) * 100;
            return (
              <div key={day.day} className="flex items-center gap-4">
                <span className="w-24 text-sm text-zinc-400">{day.day}</span>
                <div className="flex-1 h-8 bg-zinc-800 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-end pr-3"
                  >
                    {width > 20 && <span className="text-xs font-bold text-white">{day.avgEngagement}</span>}
                  </motion.div>
                </div>
                <span className="w-16 text-right text-xs text-zinc-500">{day.posts} posts</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

// Content Tab Component - Hashtag analysis
const ContentTab = ({ contentAnalysis }) => {
  const topHashtags = contentAnalysis?.topHashtags || [];
  const postTypes = contentAnalysis?.postTypes || [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Top Hashtags */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <SafeIcon icon={FiHash} className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold">Top Performing Hashtags</h2>
        </div>
        {topHashtags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topHashtags.map((tag, idx) => (
              <motion.div
                key={tag.hashtag || idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm transition-colors cursor-default"
              >
                <span className="text-blue-400">{tag.hashtag}</span>
                <span className="text-zinc-500 ml-2">({tag.avgEngagement} avg)</span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500">
            <p>No hashtag data yet. Hashtags will be analyzed after you publish posts.</p>
          </div>
        )}
      </div>

      {/* Post Type Breakdown */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-6">Content Type Performance</h2>
        {postTypes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {postTypes.map((type, idx) => (
              <div key={type.type || idx} className="bg-zinc-900/50 rounded-xl p-5 border border-white/5">
                <div className="text-lg font-bold text-white capitalize mb-1">{type.type || 'Image'}</div>
                <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                  {type.count}
                </div>
                <div className="text-xs text-zinc-500">
                  Avg engagement: {type.avgEngagement || 0}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500">
            <p>No content type data available yet.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AnalyticsPage;

