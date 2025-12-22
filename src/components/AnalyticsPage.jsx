import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { analyticsAPI } from '../lib/api';
import { getUserId } from '../lib/velosStorage';

const { FiChevronLeft, FiRefreshCw, FiTrendingUp, FiHeart, FiEye, FiMessageCircle, FiClock, FiCalendar, FiHash, FiAward, FiBarChart2, FiPlay, FiImage, FiInstagram, FiChevronDown, FiExternalLink, FiGrid, FiSend, FiTrash2, FiCornerDownRight, FiUser, FiThumbsUp } = FiIcons;

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

      // Fetch ALL posts from Instagram API directly (up to 2000 posts)
      const [instagramRes, dashboardRes, bestTimesRes, contentRes] = await Promise.all([
        analyticsAPI.getInstagramDirect(userId, accountId, 100, true), // fetchAll=true
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
    { id: 'comments', label: 'Comments', icon: FiMessageCircle },
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
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 3 months</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last year</option>
              <option value={9999}>All time</option>
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
            {activeTab === 'overview' && <OverviewTab instagramData={instagramData} dashboard={dashboard} formatNumber={formatNumber} dateRange={dateRange} />}
            {activeTab === 'timing' && <TimingTab instagramData={instagramData} dateRange={dateRange} />}
            {activeTab === 'content' && <ContentTab instagramData={instagramData} dateRange={dateRange} />}
            {activeTab === 'comments' && <CommentsTab userId={userId} selectedAccount={selectedAccount} />}
          </>
        )}
      </main>
    </div>
  );
};

// Overview Tab Component - Now shows Instagram data directly
const OverviewTab = ({ instagramData, dashboard, formatNumber, dateRange }) => {
  const [visiblePosts, setVisiblePosts] = useState(9);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' or 'engagement'

  // Use Instagram data if available, fallback to dashboard
  const allPosts = instagramData?.posts || [];
  const overview = dashboard?.overview || {};
  const accountName = instagramData?.account?.username;

  // Filter posts by date range
  const filterByDateRange = (posts, days) => {
    if (days >= 9999) return posts; // All time
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return posts.filter(post => {
      const postDate = new Date(post.timestamp);
      return postDate >= cutoffDate;
    });
  };

  const posts = filterByDateRange(allPosts, dateRange);

  // Calculate totals from filtered posts
  const totals = posts.reduce((acc, p) => ({
    likes: acc.likes + (p.likes || 0),
    comments: acc.comments + (p.comments || 0),
    views: acc.views + (p.views || 0),
    reach: acc.reach + (p.reach || 0),
    saves: acc.saves + (p.saves || 0),
  }), { likes: 0, comments: 0, views: 0, reach: 0, saves: 0 });

  // Calculate stats from filtered posts
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

  // Sort posts based on selected option
  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === 'engagement') {
      const engA = (a.likes || 0) + (a.comments || 0);
      const engB = (b.likes || 0) + (b.comments || 0);
      return engB - engA;
    } else {
      // Sort by date (newest first)
      return new Date(b.timestamp) - new Date(a.timestamp);
    }
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

      {/* Posts Section */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SafeIcon icon={sortBy === 'recent' ? FiCalendar : FiAward} className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">{sortBy === 'recent' ? 'Recent Posts' : 'Top Performing Posts'}</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/20"
            >
              <option value="recent">Newest First</option>
              <option value="engagement">Top Performing</option>
            </select>
            <span className="text-xs text-zinc-500">{displayedPosts.length} of {sortedPosts.length} posts</span>
          </div>
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

// Timing Tab Component - Best posting times from REAL Instagram data
const TimingTab = ({ instagramData, dateRange }) => {
  const allPosts = instagramData?.posts || [];

  // Filter by date range
  const filterByDateRange = (posts, days) => {
    if (days >= 9999) return posts;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return posts.filter(post => new Date(post.timestamp) >= cutoffDate);
  };
  const posts = filterByDateRange(allPosts, dateRange);

  // Aggregate by hour
  const byHour = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i}:00`,
    posts: 0,
    engagement: 0,
    avgEngagement: 0,
  }));

  // Aggregate by day
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = days.map((name, index) => ({
    day: name,
    dayIndex: index,
    posts: 0,
    engagement: 0,
    avgEngagement: 0,
  }));

  posts.forEach(post => {
    if (post.timestamp) {
      const date = new Date(post.timestamp);
      const hour = date.getHours();
      const dayIndex = date.getDay();
      const eng = (post.likes || 0) + (post.comments || 0);

      byHour[hour].posts += 1;
      byHour[hour].engagement += eng;

      byDay[dayIndex].posts += 1;
      byDay[dayIndex].engagement += eng;
    }
  });

  byHour.forEach(h => { h.avgEngagement = h.posts > 0 ? Math.round(h.engagement / h.posts) : 0; });
  byDay.forEach(d => { d.avgEngagement = d.posts > 0 ? Math.round(d.engagement / d.posts) : 0; });

  // Find best times
  const bestHours = [...byHour].filter(h => h.posts > 0).sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 3);
  const bestDays = [...byDay].filter(d => d.posts > 0).sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 3);

  const formatHour = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  const recommendation = bestHours.length > 0 && bestDays.length > 0
    ? `Post on ${bestDays[0].day} at ${formatHour(bestHours[0].hour)} for best engagement (${bestHours[0].avgEngagement} avg)`
    : 'Post consistently for best results';

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
      {/* Best Times Summary */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <SafeIcon icon={FiClock} className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-1">Best Time to Post</h3>
            <p className="text-zinc-300 mb-4">{recommendation}</p>
            <div className="flex flex-wrap gap-4">
              {bestHours.slice(0, 3).map((h, i) => (
                <div key={h.hour} className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-xs text-zinc-500">#{i + 1} Best Hour</div>
                  <div className="text-white font-bold">{formatHour(h.hour)}</div>
                  <div className="text-xs text-emerald-400">{h.avgEngagement} avg eng</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Heatmap - Full 24 hours */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-2">Engagement by Hour</h2>
        <p className="text-xs text-zinc-500 mb-6">Based on {posts.length} posts</p>
        <div className="grid grid-cols-12 gap-2 mb-4">
          {byHour.slice(0, 12).map((hour) => (
            <div key={hour.hour} className="text-center">
              <div
                className={`aspect-square rounded-lg ${getHeatColor(hour.avgEngagement)} flex items-center justify-center mb-2 transition-all hover:scale-110 cursor-pointer`}
                title={`${formatHour(hour.hour)}: ${hour.posts} posts, ${hour.avgEngagement} avg engagement`}
              >
                <span className="text-xs font-bold text-white/80">{hour.posts || ''}</span>
              </div>
              <span className="text-[10px] text-zinc-500">{hour.hour}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-2">
          {byHour.slice(12, 24).map((hour) => (
            <div key={hour.hour} className="text-center">
              <div
                className={`aspect-square rounded-lg ${getHeatColor(hour.avgEngagement)} flex items-center justify-center mb-2 transition-all hover:scale-110 cursor-pointer`}
                title={`${formatHour(hour.hour)}: ${hour.posts} posts, ${hour.avgEngagement} avg engagement`}
              >
                <span className="text-xs font-bold text-white/80">{hour.posts || ''}</span>
              </div>
              <span className="text-[10px] text-zinc-500">{hour.hour}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-6">
          <span className="text-xs text-zinc-500">AM (12am-11am) / PM (12pm-11pm)</span>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
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
      </div>

      {/* Day of Week Chart */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-6">Engagement by Day of Week</h2>
        <div className="space-y-3">
          {byDay.map((day, idx) => {
            const maxDayEng = Math.max(...byDay.map(d => d.avgEngagement), 1);
            const width = (day.avgEngagement / maxDayEng) * 100;
            const isBest = bestDays[0]?.day === day.day;
            return (
              <div key={day.day} className="flex items-center gap-4">
                <span className={`w-24 text-sm ${isBest ? 'text-emerald-400 font-bold' : 'text-zinc-400'}`}>
                  {day.day} {isBest && '⭐'}
                </span>
                <div className="flex-1 h-8 bg-zinc-800 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                    className={`h-full ${isBest ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'} rounded-lg flex items-center justify-end pr-3`}
                  >
                    {width > 15 && <span className="text-xs font-bold text-white">{day.avgEngagement}</span>}
                  </motion.div>
                </div>
                <span className="w-20 text-right text-xs text-zinc-500">{day.posts} posts</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

// Content Tab Component - Analyze REAL Instagram content
const ContentTab = ({ instagramData, dateRange }) => {
  const allPosts = instagramData?.posts || [];

  // Filter by date range
  const filterByDateRange = (posts, days) => {
    if (days >= 9999) return posts;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return posts.filter(post => new Date(post.timestamp) >= cutoffDate);
  };
  const posts = filterByDateRange(allPosts, dateRange);

  // Extract and analyze hashtags from captions
  const hashtagStats = {};
  posts.forEach(post => {
    if (post.caption) {
      const tags = post.caption.match(/#\w+/g) || [];
      const eng = (post.likes || 0) + (post.comments || 0);
      tags.forEach(tag => {
        const lowerTag = tag.toLowerCase();
        if (!hashtagStats[lowerTag]) {
          hashtagStats[lowerTag] = { tag: lowerTag, count: 0, totalEngagement: 0, posts: [] };
        }
        hashtagStats[lowerTag].count += 1;
        hashtagStats[lowerTag].totalEngagement += eng;
      });
    }
  });

  const topHashtags = Object.values(hashtagStats)
    .map(h => ({ ...h, avgEngagement: Math.round(h.totalEngagement / h.count) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 15);

  // Analyze by content type (IMAGE, VIDEO, CAROUSEL, REEL)
  const typeStats = {};
  posts.forEach(post => {
    const type = post.mediaType || 'IMAGE';
    if (!typeStats[type]) {
      typeStats[type] = { type, count: 0, totalEngagement: 0, totalViews: 0, totalReach: 0 };
    }
    typeStats[type].count += 1;
    typeStats[type].totalEngagement += (post.likes || 0) + (post.comments || 0);
    typeStats[type].totalViews += post.views || 0;
    typeStats[type].totalReach += post.reach || 0;
  });

  const typePerformance = Object.values(typeStats)
    .map(t => ({
      ...t,
      avgEngagement: Math.round(t.totalEngagement / t.count),
      avgViews: Math.round(t.totalViews / t.count),
      avgReach: Math.round(t.totalReach / t.count),
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Find best performing type
  const bestType = typePerformance[0];

  // Get type icons and colors
  const getTypeStyle = (type) => {
    switch (type) {
      case 'VIDEO': return { icon: FiPlay, color: 'text-red-400', bg: 'bg-red-500/10', gradient: 'from-red-500 to-orange-500' };
      case 'REEL': return { icon: FiPlay, color: 'text-pink-400', bg: 'bg-pink-500/10', gradient: 'from-pink-500 to-purple-500' };
      case 'CAROUSEL_ALBUM': return { icon: FiGrid, color: 'text-blue-400', bg: 'bg-blue-500/10', gradient: 'from-blue-500 to-cyan-500' };
      default: return { icon: FiImage, color: 'text-emerald-400', bg: 'bg-emerald-500/10', gradient: 'from-emerald-500 to-teal-500' };
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Content Type Performance */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Content Type Performance</h2>
            <p className="text-xs text-zinc-500 mt-1">Based on {posts.length} posts</p>
          </div>
          {bestType && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
              Best: {bestType.type === 'CAROUSEL_ALBUM' ? 'Carousel' : bestType.type}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {typePerformance.map((type, idx) => {
            const style = getTypeStyle(type.type);
            const isBest = idx === 0;
            return (
              <motion.div
                key={type.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`bg-zinc-900/50 rounded-xl p-5 border ${isBest ? 'border-emerald-500/30' : 'border-white/5'} relative overflow-hidden`}
              >
                {isBest && <div className="absolute top-2 right-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Best</div>}
                <div className={`w-10 h-10 ${style.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <SafeIcon icon={style.icon} className={`w-5 h-5 ${style.color}`} />
                </div>
                <div className="text-lg font-bold text-white capitalize mb-1">
                  {type.type === 'CAROUSEL_ALBUM' ? 'Carousel' : type.type}
                </div>
                <div className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${style.gradient} mb-3`}>
                  {type.count}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Avg Engagement</span>
                    <span className="text-white font-medium">{formatNumber(type.avgEngagement)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Avg Views</span>
                    <span className="text-white font-medium">{formatNumber(type.avgViews)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Avg Reach</span>
                    <span className="text-white font-medium">{formatNumber(type.avgReach)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Top Hashtags */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <SafeIcon icon={FiHash} className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold">Top Performing Hashtags</h2>
        </div>
        <p className="text-xs text-zinc-500 mb-6">Sorted by average engagement</p>

        {topHashtags.length > 0 ? (
          <div className="space-y-3">
            {topHashtags.slice(0, 10).map((tag, idx) => {
              const maxEng = topHashtags[0]?.avgEngagement || 1;
              const width = (tag.avgEngagement / maxEng) * 100;
              return (
                <motion.div
                  key={tag.tag}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-4"
                >
                  <span className="w-8 text-xs text-zinc-500">#{idx + 1}</span>
                  <span className="w-32 text-sm text-blue-400 truncate">{tag.tag}</span>
                  <div className="flex-1 h-6 bg-zinc-800 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.05 }}
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-end pr-2"
                    >
                      {width > 20 && <span className="text-xs font-bold text-white">{tag.avgEngagement}</span>}
                    </motion.div>
                  </div>
                  <span className="w-20 text-right text-xs text-zinc-500">{tag.count} uses</span>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500">
            <SafeIcon icon={FiHash} className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No hashtags found in your posts</p>
          </div>
        )}
      </div>

      {/* Caption Length Analysis */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-6">Caption Length Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(() => {
            const short = posts.filter(p => (p.caption?.length || 0) < 100);
            const medium = posts.filter(p => (p.caption?.length || 0) >= 100 && (p.caption?.length || 0) < 500);
            const long = posts.filter(p => (p.caption?.length || 0) >= 500);

            const avgEng = (arr) => arr.length > 0 ? Math.round(arr.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0), 0) / arr.length) : 0;

            return [
              { label: 'Short (<100 chars)', count: short.length, avg: avgEng(short), color: 'from-yellow-500 to-orange-500' },
              { label: 'Medium (100-500)', count: medium.length, avg: avgEng(medium), color: 'from-blue-500 to-cyan-500' },
              { label: 'Long (500+ chars)', count: long.length, avg: avgEng(long), color: 'from-purple-500 to-pink-500' },
            ].map((item, idx) => (
              <div key={item.label} className="bg-zinc-900/50 rounded-xl p-5 border border-white/5">
                <div className="text-sm text-zinc-400 mb-2">{item.label}</div>
                <div className={`text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${item.color}`}>
                  {item.count} posts
                </div>
                <div className="text-xs text-zinc-500 mt-2">
                  Avg engagement: {formatNumber(item.avg)}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </motion.div>
  );
};

// Comments Tab Component - Manage Instagram comments
const CommentsTab = ({ userId, selectedAccount }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    fetchComments();
  }, [userId, selectedAccount]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const data = await analyticsAPI.getComments(userId, selectedAccount?.igBusinessId, 100);
      if (data.success) {
        setComments(data.comments || []);
        setAccountName(data.account || '');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (commentId) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const result = await analyticsAPI.replyToComment(userId, commentId, replyText, selectedAccount?.igBusinessId);
      if (result.success) {
        setReplyText('');
        setReplyingTo(null);
        fetchComments(); // Refresh to show new reply
      } else {
        alert(result.error || 'Failed to send reply');
      }
    } catch (error) {
      console.error('Error replying:', error);
      alert('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
      const result = await analyticsAPI.deleteComment(userId, commentId, selectedAccount?.igBusinessId);
      if (result.success) {
        // Check if it's a main comment or a reply
        const isMainComment = comments.some(c => c.id === commentId);
        if (isMainComment) {
          setComments(comments.filter(c => c.id !== commentId));
        } else {
          // It's a reply, remove it from the parent comment
          setComments(comments.map(c => ({
            ...c,
            replies: c.replies?.filter(r => r.id !== commentId) || []
          })));
        }
      } else {
        alert(result.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Failed to delete');
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 text-sm">Loading comments...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Comment Management</h2>
          <p className="text-sm text-zinc-500">{comments.length} comments from @{accountName}</p>
        </div>
        <button onClick={fetchComments} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 text-sm transition-colors">
          <SafeIcon icon={FiRefreshCw} className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-12 text-center">
          <SafeIcon icon={FiMessageCircle} className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
          <h3 className="text-lg font-medium mb-2">No Comments Yet</h3>
          <p className="text-zinc-500">Comments on your posts will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment, idx) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="bg-[#121214] border border-white/5 rounded-xl p-4"
            >
              {/* Post Reference */}
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/5">
                {comment.postThumbnail && (
                  <img src={comment.postThumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 truncate">{comment.postCaption || 'Post'}</p>
                  <a href={comment.postPermalink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                    View on Instagram <SafeIcon icon={FiExternalLink} className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Comment */}
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <SafeIcon icon={FiUser} className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">@{comment.username}</span>
                    <span className="text-xs text-zinc-500">{formatTime(comment.timestamp)}</span>
                    {comment.likeCount > 0 && (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <SafeIcon icon={FiThumbsUp} className="w-3 h-3" /> {comment.likeCount}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 mb-2">{comment.text}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <SafeIcon icon={FiCornerDownRight} className="w-3 h-3" /> Reply
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <SafeIcon icon={FiTrash2} className="w-3 h-3" /> Delete
                    </button>
                  </div>

                  {/* Reply Input */}
                  {replyingTo === comment.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Reply to @${comment.username}...`}
                        className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)}
                      />
                      <button
                        onClick={() => handleReply(comment.id)}
                        disabled={sending || !replyText.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center gap-2 text-sm transition-colors"
                      >
                        {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <SafeIcon icon={FiSend} className="w-4 h-4" />}
                      </button>
                    </motion.div>
                  )}

                  {/* Existing Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 ml-4 space-y-2 border-l-2 border-zinc-800 pl-4">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="text-sm group">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-blue-400">@{reply.username}</span>
                            <span className="text-zinc-500 text-xs">{formatTime(reply.timestamp)}</span>
                            <button
                              onClick={() => handleDelete(reply.id)}
                              className="text-xs text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                            >
                              <SafeIcon icon={FiTrash2} className="w-3 h-3" /> Delete
                            </button>
                          </div>
                          <p className="text-zinc-400 mt-1">{reply.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default AnalyticsPage;

