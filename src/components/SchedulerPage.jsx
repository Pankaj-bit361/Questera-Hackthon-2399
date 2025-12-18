import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import CreatePostModal from './CreatePostModal';
import { schedulerAPI } from '../lib/api';
import { API_BASE_URL } from '../config';
import { getUserId } from '../lib/velosStorage';

const { FiCalendar, FiClock, FiChevronLeft, FiChevronRight, FiPlus, FiTrash2, FiEdit2, FiInstagram, FiCheck, FiX, FiImage, FiVideo, FiPlay, FiUpload } = FiIcons;

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
      <div className={`${videoSizeClasses[size]} relative rounded-lg overflow-hidden border border-white/10 bg-black`}>
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
            <SafeIcon icon={FiPlay} className="w-3 h-3 text-black ml-0.5" />
          </div>
        </div>
        {/* Reel badge */}
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[8px] font-bold text-white border border-white/20">
          REEL
        </div>
      </div>
    );
  }

  if (mediaUrl) {
    return (
      <img src={mediaUrl} alt="" className={`${sizeClasses[size]} object-cover rounded-lg border border-white/10`} />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center`}>
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
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
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
      days.push(<div key={`empty-${i}`} className="h-24 bg-zinc-900/30 rounded-xl" />);
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
          className={`h-24 p-3 rounded-xl cursor-pointer transition-all border group relative ${isSelected ? 'border-white bg-white/5 shadow-lg' :
            isToday ? 'border-white/20 bg-zinc-900' :
              'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900'
            }`}
        >
          <div className={`text-sm font-bold mb-2 flex justify-between items-center ${isToday || isSelected ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
            <span>{day}</span>
            {isToday && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
          </div>
          <div className="space-y-1.5 overflow-hidden">
            {dayPosts.slice(0, 2).map((post, idx) => (
              <div
                key={idx}
                className={`text-[10px] px-2 py-0.5 rounded-md truncate font-medium border flex items-center justify-between ${post.status === 'published' ? 'bg-zinc-900 text-zinc-400 border-zinc-700' :
                  post.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/10' :
                    'bg-white text-black border-white'
                  }`}
              >
                <span>{new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
            {dayPosts.length > 2 && (
              <div className="text-[10px] text-zinc-500 pl-1">+{dayPosts.length - 2} more</div>
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
        <div key={hour} className="flex border-b border-white/5 min-h-[70px] group hover:bg-white/[0.02] transition-colors">
          <div className="w-16 flex-shrink-0 py-3 px-3 text-xs text-zinc-500 font-mono border-r border-white/5">
            {hour.toString().padStart(2, '0')}:00
          </div>
          <div className="flex-1 py-2 px-3 flex flex-wrap gap-3">
            {hourPosts.map((post) => (
              <div
                key={post.postId}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${post.status === 'published' ? 'bg-zinc-900/50 border-zinc-800' :
                  post.status === 'failed' ? 'bg-red-500/10 border-red-500/20' :
                    'bg-white/5 border-white/10'
                  }`}
              >
                <PostThumbnail post={post} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SafeIcon icon={FiInstagram} className="w-3 h-3 text-white" />
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${post.status === 'published' ? 'text-zinc-500' :
                      post.status === 'failed' ? 'text-red-400' :
                        'text-white'
                      }`}>
                      {post.status}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-200 truncate max-w-[200px] font-medium">{post.caption || 'No caption'}</p>
                </div>
                {post.status === 'scheduled' && (
                  <div className="flex gap-1 pl-2 border-l border-white/5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditPost(post); }}
                      className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <SafeIcon icon={FiEdit2} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelPost(post.postId); }}
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <SafeIcon icon={FiTrash2} className="w-4 h-4" />
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
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20">
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
      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Content Scheduler</h1>
            <p className="text-zinc-500 font-medium">Plan and schedule your posts for maximum engagement</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowCreatePostModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-colors shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]"
            >
              <SafeIcon icon={FiUpload} className="w-4 h-4" />
              New Post
            </button>
            <button
              onClick={() => navigate('/chat/new')}
              className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-xl font-bold hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <SafeIcon icon={FiPlus} className="w-4 h-4" />
              AI Create
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
            <div>
              <div className="text-3xl font-bold text-white mb-1">{stats.scheduled}</div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Scheduled</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <SafeIcon icon={FiClock} className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
            <div>
              <div className="text-3xl font-bold text-white mb-1">{stats.published}</div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Published</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <SafeIcon icon={FiCheck} className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
            <div>
              <div className="text-3xl font-bold text-white mb-1">{stats.failed}</div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Failed</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <SafeIcon icon={FiX} className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Main Grid: Calendar + Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Calendar or Expanded Day View */}
          <div className="lg:col-span-2">
            {!selectedDate ? (
              /* Calendar View */
              <div className="bg-[#09090b] border border-white/10 rounded-3xl p-8 shadow-2xl">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-8">
                  <button onClick={prevMonth} className="p-3 hover:bg-white/10 rounded-xl transition-colors border border-transparent hover:border-white/5">
                    <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
                  </button>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <button onClick={nextMonth} className="p-3 hover:bg-white/10 rounded-xl transition-colors border border-transparent hover:border-white/5">
                    <SafeIcon icon={FiChevronRight} className="w-5 h-5" />
                  </button>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-3 mb-4">
                  {DAYS.map(day => (
                    <div key={day} className="text-center text-[11px] font-bold text-zinc-500 uppercase tracking-widest py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-3">
                  {loading ? (
                    <div className="col-span-7 py-32 text-center text-zinc-500 flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <p className="text-sm font-medium">Loading schedule...</p>
                    </div>
                  ) : (
                    renderCalendar()
                  )}
                </div>
              </div>
            ) : (
              /* Expanded Day View with Hourly Slots */
              <div className="bg-[#09090b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                {/* Day Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-zinc-900/30 backdrop-blur-sm">
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <SafeIcon icon={FiChevronLeft} className="w-4 h-4" />
                    Back
                  </button>
                  <div className="text-center">
                    <h2 className="text-xl font-bold mb-1">
                      {MONTHS[currentDate.getMonth()]} {selectedDate}, {currentDate.getFullYear()}
                    </h2>
                    <div className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
                      {selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? 's' : ''} scheduled
                    </div>
                  </div>
                  <div className="w-20" /> {/* Spacer for centering */}
                </div>

                {/* Hourly Timeline */}
                <div className="max-h-[700px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {renderExpandedDay()}
                </div>
              </div>
            )}
          </div>

          {/* Right: Selected Day Details Panel */}
          <div className="bg-[#09090b] border border-white/10 rounded-3xl p-8 sticky top-8 shadow-2xl h-fit">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <SafeIcon icon={FiCalendar} className="w-4 h-4" />
              Day Overview
            </h3>

            {!selectedDate ? (
              <div className="py-20 text-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-2xl">
                <SafeIcon icon={FiCalendar} className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium">Select a day from the calendar<br />to view or manage posts</p>
              </div>
            ) : selectedDayPosts.length === 0 ? (
              <div className="py-20 text-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-2xl bg-zinc-900/20">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-4">
                  <SafeIcon icon={FiImage} className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-sm font-medium mb-4">No content scheduled</p>
                <button
                  onClick={() => setShowCreatePostModal(true)}
                  className="text-white text-xs font-bold border-b border-white/50 hover:border-white transition-colors pb-0.5"
                >
                  Schedule a post now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayPosts.map((post) => (
                  <div key={post.postId} className="group p-4 bg-zinc-900/40 rounded-2xl border border-white/5 hover:border-white/20 transition-all hover:bg-zinc-900">
                    <div className="flex gap-4">
                      <PostThumbnail post={post} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${post.status === 'published' ? 'bg-zinc-800 text-zinc-400' :
                            post.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                              'bg-white text-black'
                            }`}>
                            {post.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 truncate font-medium mb-1">{post.caption || 'No caption'}</p>
                        <p className="text-[11px] text-zinc-500 font-medium flex items-center">
                          <SafeIcon icon={FiClock} className="w-3 h-3 mr-1.5" />
                          {new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {post.status === 'scheduled' && (
                      <div className="flex gap-2 mt-4 pt-4 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditPost(post)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiEdit2} className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleCancelPost(post.postId)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiTrash2} className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
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
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={handleCancelEdit}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#09090b] border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleCancelEdit}
                className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white rounded-full hover:bg-white/5 transition-colors"
              >
                <SafeIcon icon={FiX} className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                  <SafeIcon icon={FiEdit2} className="w-5 h-5 text-black" />
                </div>
                Edit Caption
              </h3>

              {/* Preview */}
              <div className="flex gap-5 mb-6 p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
                <PostThumbnail post={editingPost} size="lg" />
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                      <SafeIcon icon={FiInstagram} className="w-3 h-3 text-black" />
                    </div>
                    <span className="text-xs font-bold text-zinc-400">@{editingPost.instagramAccount}</span>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">
                    Scheduled for {new Date(editingPost.scheduledAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Caption Input */}
              <div className="mb-8">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">New Caption</label>
                <div className="relative">
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="w-full h-40 bg-zinc-900/50 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 resize-none leading-relaxed"
                    placeholder="Enter your caption..."
                  />
                  <div className="absolute bottom-4 right-4 text-[10px] font-mono text-zinc-500">
                    {editCaption.length} chars
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 px-6 py-4 text-zinc-400 hover:text-white hover:bg-white/5 rounded-2xl font-bold text-sm transition-colors border border-transparent hover:border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 px-6 py-4 bg-white hover:bg-zinc-200 text-black rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]"
                >
                  {editSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
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

      {/* Create Post Modal (Buffer-style) */}
      <CreatePostModal
        isOpen={showCreatePostModal}
        onClose={() => setShowCreatePostModal(false)}
        onSuccess={() => {
          fetchPosts();
          fetchStats();
        }}
        selectedDate={selectedDate ? new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate) : null}
      />
    </div>
  );
};

export default SchedulerPage;
