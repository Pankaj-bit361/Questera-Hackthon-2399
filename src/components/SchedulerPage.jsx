import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { schedulerAPI } from '../lib/api';
import { API_BASE_URL } from '../config';
import { getUserId } from '../lib/velosStorage';

const { FiCalendar, FiClock, FiChevronLeft, FiChevronRight, FiPlus, FiTrash2, FiEdit2, FiInstagram, FiCheck, FiX, FiImage, FiVideo, FiPlay } = FiIcons;

// Helper to check if URL is a video
const isVideoUrl = (url) => {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
};

// Post thumbnail component - handles both images and videos
const PostThumbnail = ({ post, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  // Larger sizes for video display
  const videoSizeClasses = {
    sm: 'w-14 h-14',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
  };

  const mediaUrl = post.videoUrl || post.imageUrl;
  const isVideo = post.postType === 'reel' || post.postType === 'video' || isVideoUrl(mediaUrl);

  if (isVideo && mediaUrl) {
    return (
      <div className={`${videoSizeClasses[size]} relative rounded-lg overflow-hidden border border-purple-500/30 bg-black`}>
        <video
          src={mediaUrl}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          onMouseEnter={(e) => e.target.play()}
          onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
        />
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center">
            <SafeIcon icon={FiPlay} className="w-3 h-3 text-purple-600 ml-0.5" />
          </div>
        </div>
        {/* Reel badge */}
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-purple-500/80 rounded text-[8px] font-bold text-white">
          REEL
        </div>
      </div>
    );
  }

  if (mediaUrl) {
    return (
      <img src={mediaUrl} alt="" className={`${sizeClasses[size]} object-cover rounded-lg`} />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-lg bg-zinc-800 flex items-center justify-center`}>
      <SafeIcon icon={FiImage} className="w-4 h-4 text-zinc-600" />
    </div>
  );
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SchedulerPage = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ scheduled: 0, published: 0, failed: 0 });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const userId = getUserId();

  // Fetch posts for the current month
  useEffect(() => {
    if (userId) {
      fetchPosts();
      fetchStats();
    }
  }, [userId, currentDate]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

      const data = await schedulerAPI.getPosts(userId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (data.success) {
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await schedulerAPI.getStats(userId);
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCancelPost = async (postId) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled post?')) return;

    try {
      const result = await schedulerAPI.cancelPost(postId);
      if (result.success) {
        fetchPosts();
        fetchStats();
      }
    } catch (error) {
      console.error('Error cancelling post:', error);
    }
  };

  const handleEditPost = (post) => {
    setEditingPost(post);
    setEditCaption(post.caption || '');
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    setEditSaving(true);
    try {
      const result = await schedulerAPI.updatePost(editingPost.postId, { caption: editCaption });
      if (result.success) {
        fetchPosts();
        setEditingPost(null);
        setEditCaption('');
      }
    } catch (error) {
      console.error('Error updating post:', error);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingPost(null);
    setEditCaption('');
  };

  // Calendar helpers
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const getPostsForDate = (day) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return posts.filter(p => p.scheduledAt.startsWith(dateStr));
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-zinc-900/30 rounded-lg" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayPosts = getPostsForDate(day);
      const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
      const isSelected = selectedDate === day;

      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate(day)}
          className={`h-24 p-2 rounded-lg cursor-pointer transition-all border ${isSelected ? 'border-purple-500 bg-purple-500/10' :
            isToday ? 'border-white/20 bg-white/5' :
              'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
            }`}
        >
          <div className={`text-sm font-bold mb-1 ${isToday ? 'text-purple-400' : 'text-zinc-400'}`}>
            {day}
          </div>
          <div className="space-y-1 overflow-hidden">
            {dayPosts.slice(0, 2).map((post, idx) => (
              <div
                key={idx}
                className={`text-[10px] px-1.5 py-0.5 rounded truncate ${post.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' :
                  post.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}
              >
                {new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            ))}
            {dayPosts.length > 2 && (
              <div className="text-[10px] text-zinc-500">+{dayPosts.length - 2} more</div>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  // Render expanded day view with hourly slots
  const renderExpandedDay = () => {
    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourPosts = selectedDayPosts.filter(post => {
        const postHour = new Date(post.scheduledAt).getHours();
        return postHour === hour;
      });

      hours.push(
        <div key={hour} className="flex border-b border-zinc-800/50 min-h-[60px]">
          <div className="w-16 flex-shrink-0 py-2 px-2 text-xs text-zinc-500 font-medium border-r border-zinc-800/50">
            {hour.toString().padStart(2, '0')}:00
          </div>
          <div className="flex-1 py-1.5 px-2 flex flex-wrap gap-2">
            {hourPosts.map((post) => (
              <div
                key={post.postId}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${post.status === 'published' ? 'bg-emerald-500/20 border border-emerald-500/30' :
                  post.status === 'failed' ? 'bg-red-500/20 border border-red-500/30' :
                    'bg-purple-500/20 border border-purple-500/30'
                  }`}
              >
                <PostThumbnail post={post} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SafeIcon icon={FiInstagram} className="w-3 h-3 text-pink-400" />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${post.status === 'published' ? 'bg-emerald-500/30 text-emerald-400' :
                      post.status === 'failed' ? 'bg-red-500/30 text-red-400' :
                        'bg-purple-500/30 text-purple-400'
                      }`}>
                      {post.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 truncate max-w-[150px]">{post.caption || 'No caption'}</p>
                  <p className="text-[10px] text-zinc-500">
                    {new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {post.status === 'scheduled' && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditPost(post); }}
                      className="p-1.5 text-purple-400 hover:bg-purple-500/20 rounded-lg transition-colors"
                    >
                      <SafeIcon icon={FiEdit2} className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelPost(post.postId); }}
                      className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <SafeIcon icon={FiTrash2} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return hours;
  };

  const selectedDayPosts = selectedDate ? getPostsForDate(selectedDate) : [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans">
      {/* Sidebar */}
      <div
        className="fixed top-0 left-0 w-6 h-full z-40"
        onMouseEnter={() => setSidebarOpen(true)}
      />
      <Sidebar
        isOpen={isSidebarOpen}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Content Scheduler</h1>
            <p className="text-zinc-500">Plan and schedule your posts for maximum engagement</p>
          </div>
          <button
            onClick={() => navigate('/chat/new')}
            className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-colors"
          >
            <SafeIcon icon={FiPlus} className="w-4 h-4" />
            Create Content
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <div className="text-2xl font-bold text-purple-400">{stats.scheduled}</div>
            <div className="text-sm text-zinc-500">Scheduled</div>
          </div>
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="text-2xl font-bold text-emerald-400">{stats.published}</div>
            <div className="text-sm text-zinc-500">Published</div>
          </div>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
            <div className="text-sm text-zinc-500">Failed</div>
          </div>
        </div>

        {/* Main Grid: Calendar + Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Calendar or Expanded Day View */}
          <div className="lg:col-span-2">
            {!selectedDate ? (
              /* Calendar View */
              <div className="bg-[#111] border border-zinc-800 rounded-2xl p-6">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-6">
                  <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
                  </button>
                  <h2 className="text-xl font-bold">
                    {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <SafeIcon icon={FiChevronRight} className="w-5 h-5" />
                  </button>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {DAYS.map(day => (
                    <div key={day} className="text-center text-xs font-bold text-zinc-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {loading ? (
                    <div className="col-span-7 py-20 text-center text-zinc-500">Loading...</div>
                  ) : (
                    renderCalendar()
                  )}
                </div>
              </div>
            ) : (
              /* Expanded Day View with Hourly Slots */
              <div className="bg-[#111] border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Day Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <SafeIcon icon={FiChevronLeft} className="w-4 h-4" />
                    Back to Calendar
                  </button>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <SafeIcon icon={FiCalendar} className="w-5 h-5 text-purple-400" />
                    {MONTHS[currentDate.getMonth()]} {selectedDate}, {currentDate.getFullYear()}
                  </h2>
                  <div className="text-sm text-zinc-500">
                    {selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? 's' : ''} scheduled
                  </div>
                </div>

                {/* Hourly Timeline */}
                <div className="max-h-[600px] overflow-y-auto">
                  {renderExpandedDay()}
                </div>
              </div>
            )}
          </div>

          {/* Right: Selected Day Details Panel */}
          <div className="bg-[#111] border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <SafeIcon icon={FiCalendar} className="w-5 h-5 text-purple-400" />
              {selectedDate ? (
                `${MONTHS[currentDate.getMonth()]} ${selectedDate}`
              ) : (
                'Select a Day'
              )}
            </h3>

            {!selectedDate ? (
              <div className="py-12 text-center text-zinc-600">
                <SafeIcon icon={FiCalendar} className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click on a day to view scheduled posts</p>
              </div>
            ) : selectedDayPosts.length === 0 ? (
              <div className="py-12 text-center text-zinc-600">
                <SafeIcon icon={FiImage} className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No posts scheduled for this day</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {selectedDayPosts.map((post) => (
                  <div key={post.postId} className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <div className="flex gap-3">
                      <PostThumbnail post={post} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <SafeIcon icon={FiInstagram} className="w-3.5 h-3.5 text-pink-400" />
                          <span className={`text-xs px-2 py-0.5 rounded ${post.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' :
                            post.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                              'bg-purple-500/20 text-purple-400'
                            }`}>
                            {post.status}
                          </span>
                          {(post.postType === 'reel' || post.postType === 'video') && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 flex items-center gap-1">
                              <SafeIcon icon={FiVideo} className="w-2.5 h-2.5" />
                              Reel
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate">{post.caption || 'No caption'}</p>
                        <p className="text-[10px] text-zinc-600 mt-1">
                          <SafeIcon icon={FiClock} className="w-3 h-3 inline mr-1" />
                          {new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {post.status === 'scheduled' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800">
                        <button
                          onClick={() => handleEditPost(post)}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiEdit2} className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleCancelPost(post.postId)}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiTrash2} className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    )}
                    {post.status === 'failed' && post.publishError && (
                      <p className="mt-2 text-[10px] text-red-400 bg-red-500/10 p-2 rounded">
                        {post.publishError}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Caption Modal */}
      <AnimatePresence>
        {editingPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleCancelEdit}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-zinc-800 rounded-2xl p-6 w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <SafeIcon icon={FiEdit2} className="w-5 h-5 text-purple-400" />
                Edit Post Caption
              </h3>

              {/* Preview */}
              <div className="flex gap-4 mb-4 p-3 bg-zinc-900 rounded-xl">
                <PostThumbnail post={editingPost} size="lg" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <SafeIcon icon={FiInstagram} className="w-4 h-4 text-pink-400" />
                    <span className="text-sm text-zinc-400">@{editingPost.instagramAccount}</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    <SafeIcon icon={FiClock} className="w-3 h-3 inline mr-1" />
                    Scheduled for {new Date(editingPost.scheduledAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Caption Input */}
              <div className="mb-4">
                <label className="block text-sm text-zinc-400 mb-2">Caption</label>
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Enter your caption..."
                />
                <p className="text-xs text-zinc-500 mt-1">{editCaption.length} characters</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {editSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <SafeIcon icon={FiCheck} className="w-4 h-4" />
                      Save Changes
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

export default SchedulerPage;

