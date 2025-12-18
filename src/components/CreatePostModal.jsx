import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/datepicker.css';
import { format, addMinutes, setHours, setMinutes } from 'date-fns';
import * as FiIcons from 'react-icons/fi';
import EmojiPicker from 'emoji-picker-react';
import SafeIcon from '../common/SafeIcon';
import { schedulerAPI, instagramAPI } from '../lib/api';
import { getUserId } from '../lib/velosStorage';

const { FiX, FiImage, FiVideo, FiUpload, FiInstagram, FiCalendar, FiClock, FiCheck, FiTrash2, FiPlay, FiChevronDown, FiChevronLeft, FiChevronRight, FiStar, FiZap, FiSend, FiSmile, FiTag, FiMusic, FiMessageCircle, FiHash } = FiIcons;

// Suggested posting times (best engagement times)
const POSTING_SLOTS = [
  { hour: 9, minute: 0, label: '9:00 AM' },
  { hour: 12, minute: 0, label: '12:00 PM' },
  { hour: 15, minute: 0, label: '3:00 PM' },
  { hour: 18, minute: 0, label: '6:00 PM' },
  { hour: 20, minute: 0, label: '8:00 PM' },
  { hour: 21, minute: 0, label: '9:00 PM' },
];

const CreatePostModal = ({ isOpen, onClose, onSuccess, selectedDate = null }) => {
  const [postType, setPostType] = useState('image');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [mediaList, setMediaList] = useState([]);
  const [scheduledDate, setScheduledDate] = useState(
    selectedDate ? new Date(selectedDate) : null
  );
  const [scheduleMode, setScheduleMode] = useState('schedule');
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const fileInputRef = useRef(null);
  const userId = getUserId();

  // New Buffer-like features
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [tagProducts, setTagProducts] = useState('');
  const [music, setMusic] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [showMusicInput, setShowMusicInput] = useState(false);
  const [showProductsInput, setShowProductsInput] = useState(false);
  const textareaRef = useRef(null);

  // Account selection
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Fetch Instagram accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      if (!userId) return;
      setLoadingAccounts(true);
      try {
        const result = await instagramAPI.getSocialAccounts(userId);
        if (result.success && result.accounts?.length > 0) {
          setSocialAccounts(result.accounts);
          setSelectedAccount(result.accounts[0].accountId);
        }
      } catch (err) {
        console.error('Error loading social accounts:', err);
      } finally {
        setLoadingAccounts(false);
      }
    };
    if (isOpen) {
      loadAccounts();
    }
  }, [userId, isOpen]);

  const handleEmojiClick = (emojiData) => {
    const emoji = emojiData.emoji;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCaption = caption.slice(0, start) + emoji + caption.slice(end);
      setCaption(newCaption);
      // Set cursor position after emoji
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      }, 0);
    } else {
      setCaption(prev => prev + emoji);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newMediaItems = [];
    for (const file of files) {
      const isVideo = file.type.startsWith('video');
      const isImage = file.type.startsWith('image');

      if (!isVideo && !isImage) {
        setError('Please upload image or video files only');
        continue;
      }

      if (isVideo) {
        if (mediaList.length > 0 || files.length > 1) {
          setError('Videos can only be posted individually as Reels');
          continue;
        }
        setPostType('reel');
      }

      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      newMediaItems.push({
        data: base64,
        mimeType: file.type,
        preview: URL.createObjectURL(file),
        isVideo,
        fileName: file.name,
      });
    }

    const updatedList = [...mediaList, ...newMediaItems];
    setMediaList(updatedList);

    if (updatedList.length > 1 && !updatedList.some(m => m.isVideo)) {
      setPostType('carousel');
    }

    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveMedia = (index) => {
    const item = mediaList[index];
    if (item?.preview) URL.revokeObjectURL(item.preview);
    const newList = mediaList.filter((_, i) => i !== index);
    setMediaList(newList);
    if (currentPreviewIndex >= newList.length) {
      setCurrentPreviewIndex(Math.max(0, newList.length - 1));
    }
    if (newList.length === 0) setPostType('image');
    else if (newList.length === 1 && !newList[0].isVideo) setPostType('image');
  };

  const getNextAvailableSlot = () => {
    const now = new Date();
    const nextSlot = addMinutes(now, 30);
    nextSlot.setMinutes(Math.ceil(nextSlot.getMinutes() / 15) * 15, 0, 0);
    return nextSlot;
  };

  const handleScheduleModeChange = (mode) => {
    setScheduleMode(mode);
    if (mode === 'now') {
      setScheduledDate(addMinutes(new Date(), 1));
    } else if (mode === 'next') {
      setScheduledDate(getNextAvailableSlot());
    }
  };

  const handleTimeSlotClick = (slot) => {
    if (!scheduledDate) return;
    const newDate = setMinutes(setHours(scheduledDate, slot.hour), slot.minute);
    setScheduledDate(newDate);
  };

  const handleSubmit = async () => {
    if (mediaList.length === 0) {
      setError('Please upload at least one image or video');
      return;
    }
    const finalDate = scheduledDate || addMinutes(new Date(), 1);
    if (scheduleMode === 'schedule' && finalDate <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }

    setIsSubmitting(true);
    setError('');

    // Validate account selection
    if (!selectedAccount) {
      setError('Please select an Instagram account');
      return;
    }

    try {
      const isCarousel = mediaList.length > 1 && postType === 'carousel';
      const mediaPayload = isCarousel
        ? mediaList.map(m => ({ data: m.data, mimeType: m.mimeType }))
        : { data: mediaList[0].data, mimeType: mediaList[0].mimeType };

      const result = await schedulerAPI.createManualPost({
        userId,
        accountId: selectedAccount,
        media: mediaPayload,
        caption,
        hashtags,
        postType: isCarousel ? 'carousel' : postType,
        scheduledAt: finalDate.toISOString(),
        // Buffer-like features
        music,
        tagProducts,
        firstComment,
      });

      if (result.success) {
        onSuccess?.(result.post);
        handleClose();
      } else {
        setError(result.error || 'Failed to schedule post');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    mediaList.forEach(m => m.preview && URL.revokeObjectURL(m.preview));
    setMediaList([]);
    setCaption('');
    setHashtags('');
    setPostType('image');
    setScheduledDate(null);
    setScheduleMode('schedule');
    setShowSchedulePicker(false);
    setError('');
    setCurrentPreviewIndex(0);
    // Reset Buffer-like features
    setShowEmojiPicker(false);
    setTagProducts('');
    setMusic('');
    setFirstComment('');
    setShowMusicInput(false);
    setShowProductsInput(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          className="bg-[#09090b] border border-white/10 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-zinc-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg">
                <SafeIcon icon={FiInstagram} className="w-5 h-5 text-black" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Post Studio</h2>
                <p className="text-xs text-zinc-500 font-medium">Create and schedule your Instagram content</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2.5 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-all"
            >
              <SafeIcon icon={FiX} className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Left: Content Creation */}
            <div className="flex-[1.2] overflow-y-auto px-8 py-6 space-y-8 scrollbar-hide">
              {/* Post Type Toggles */}
              <section>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-4 block">Content Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { type: 'image', label: 'Feed Post', icon: FiImage },
                    { type: 'carousel', label: 'Carousel', icon: FiImage, badge: mediaList.length > 1 ? mediaList.length : null },
                    { type: 'reel', label: 'Reel', icon: FiVideo },
                    { type: 'story', label: 'Story', icon: FiPlay },
                  ].map(({ type, label, icon, badge }) => (
                    <button
                      key={type}
                      onClick={() => setPostType(type)}
                      disabled={type === 'carousel' && mediaList.length < 2}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300 ${postType === type
                        ? 'bg-white text-black border-white shadow-xl'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'
                        } ${type === 'carousel' && mediaList.length < 2 ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                    >
                      <div className={`p-2 rounded-lg ${postType === type ? 'bg-black text-white' : 'bg-zinc-800'}`}>
                        <SafeIcon icon={icon} className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold">{label}</span>
                      {badge && <span className="absolute top-2 right-2 bg-black text-white text-[10px] px-1.5 rounded-full font-bold">{badge}</span>}
                    </button>
                  ))}
                </div>
              </section>

              {/* Media Upload Area */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest block">Media Assets</label>
                  {mediaList.length > 0 && <span className="text-[10px] text-zinc-400 font-medium">{mediaList.length} / 10 files</span>}
                </div>

                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" />

                <div className="grid grid-cols-4 gap-3">
                  {mediaList.map((item, index) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={item.preview}
                      className="relative aspect-square group rounded-xl overflow-hidden border border-white/10 bg-zinc-900"
                    >
                      {item.isVideo ? (
                        <video src={item.preview} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={item.preview} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleRemoveMedia(index)}
                          className="p-2 bg-white text-black hover:bg-zinc-200 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiTrash2} className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {mediaList.length < 10 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/5 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                        <SafeIcon icon={FiUpload} className="w-5 h-5 text-zinc-500 group-hover:text-black" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter group-hover:text-white">Add Files</span>
                    </button>
                  )}
                </div>
              </section>

              {/* Account Selection */}
              <section>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">
                  <SafeIcon icon={FiInstagram} className="w-3.5 h-3.5 inline mr-1.5" />
                  Post To
                </label>
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 p-3 bg-zinc-900/50 border border-white/5 rounded-xl">
                    <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                    <span className="text-xs text-zinc-500">Loading accounts...</span>
                  </div>
                ) : socialAccounts.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {socialAccounts.map((acc) => (
                      <button
                        key={acc.accountId}
                        type="button"
                        onClick={() => setSelectedAccount(acc.accountId)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${selectedAccount === acc.accountId
                            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/40'
                            : 'bg-zinc-900/50 border-white/5 hover:border-white/20'
                          }`}
                      >
                        {acc.profilePictureUrl ? (
                          <img src={acc.profilePictureUrl} alt="" className="w-8 h-8 rounded-full ring-2 ring-white/10" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{acc.instagramUsername?.[0]?.toUpperCase() || 'U'}</span>
                          </div>
                        )}
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-white">@{acc.instagramUsername || acc.pageName}</p>
                        </div>
                        {selectedAccount === acc.accountId && (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                            <SafeIcon icon={FiCheck} className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400">
                      No Instagram accounts connected. Go to Settings to connect.
                    </p>
                  </div>
                )}
              </section>

              {/* Text Fields */}
              <section className="space-y-6">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Caption</label>
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Write something engaging..."
                      className="w-full h-32 bg-zinc-900/50 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-all resize-none leading-relaxed"
                      maxLength={2200}
                    />
                    <div className="absolute bottom-3 right-4 text-[10px] font-mono text-zinc-600">
                      {caption.length} / 2200
                    </div>
                  </div>

                  {/* Toolbar with Emoji, Hashtag, and Feature Toggles */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      {/* Emoji Picker Toggle */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className={`p-2 rounded-lg transition-all ${showEmojiPicker ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-white/5 text-zinc-500 hover:text-white'}`}
                          title="Add Emoji"
                        >
                          <SafeIcon icon={FiSmile} className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {showEmojiPicker && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-0 mt-2 z-50"
                            >
                              <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10">
                                <EmojiPicker
                                  onEmojiClick={handleEmojiClick}
                                  theme="dark"
                                  width={320}
                                  height={400}
                                  searchPlaceholder="Search emoji..."
                                  previewConfig={{ showPreview: false }}
                                  skinTonesDisabled
                                  lazyLoadEmojis
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Hashtag Button */}
                      <button
                        type="button"
                        onClick={() => setCaption(prev => prev + ' #')}
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
                        title="Add Hashtag"
                      >
                        <SafeIcon icon={FiHash} className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Feature Toggles */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowMusicInput(!showMusicInput)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showMusicInput ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-white border border-transparent'}`}
                      >
                        {showMusicInput && <SafeIcon icon={FiCheck} className="w-3 h-3" />}
                        <SafeIcon icon={FiMusic} className="w-3 h-3" />
                        <span>Music</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProductsInput(!showProductsInput)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showProductsInput ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-white border border-transparent'}`}
                      >
                        {showProductsInput && <SafeIcon icon={FiCheck} className="w-3 h-3" />}
                        <SafeIcon icon={FiTag} className="w-3 h-3" />
                        <span>Tag Products</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Hashtags Input */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Hashtags</label>
                  <div className="relative">
                    <SafeIcon icon={FiZap} className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                    <input
                      type="text"
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="#aesthetic #minimal #trending"
                      className="w-full bg-zinc-900/50 border border-white/5 rounded-xl pl-11 pr-5 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all"
                    />
                  </div>
                </div>

                {/* Tag Products Input (shown when toggled) */}
                <AnimatePresence>
                  {showProductsInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Tag Products</label>
                      <div className="relative">
                        <SafeIcon icon={FiTag} className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/60" />
                        <input
                          type="text"
                          value={tagProducts}
                          onChange={(e) => setTagProducts(e.target.value)}
                          placeholder="Product name or ID..."
                          className="w-full bg-zinc-900/50 border border-emerald-500/20 rounded-xl pl-11 pr-5 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 transition-all"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Music Input (shown when toggled) */}
                <AnimatePresence>
                  {showMusicInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Music</label>
                      <div className="relative">
                        <SafeIcon icon={FiMusic} className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500/60" />
                        <input
                          type="text"
                          value={music}
                          onChange={(e) => setMusic(e.target.value)}
                          placeholder="Song name or music track..."
                          className="w-full bg-zinc-900/50 border border-purple-500/20 rounded-xl pl-11 pr-5 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/40 transition-all"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* First Comment */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">First Comment</label>
                  <div className="relative">
                    <SafeIcon icon={FiMessageCircle} className="absolute left-4 top-3.5 w-4 h-4 text-zinc-600" />
                    <textarea
                      value={firstComment}
                      onChange={(e) => setFirstComment(e.target.value)}
                      placeholder="Add your first comment (great for extra hashtags)..."
                      className="w-full h-20 bg-zinc-900/50 border border-white/5 rounded-xl pl-11 pr-5 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all resize-none"
                      maxLength={2200}
                    />
                  </div>
                </div>
              </section>

              {error && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <SafeIcon icon={FiX} className="w-3 h-3" />
                  </div>
                  {error}
                </motion.div>
              )}
            </div>

            {/* Right: Studio Sidebar (Preview & Scheduling) */}
            <div className="flex-1 bg-zinc-950/50 border-l border-white/5 flex flex-col p-8 overflow-y-auto scrollbar-hide">
              <div className="space-y-8">
                {/* Visual Preview */}
                <section>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-6 block text-center">Live Preview</label>
                  <div className="mx-auto w-[280px] bg-white rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                    {/* IG Header */}
                    <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-[1.5px]">
                        <div className="w-full h-full rounded-full bg-white border-2 border-white" />
                      </div>
                      <span className="text-xs font-bold text-gray-900">your_account</span>
                    </div>

                    {/* Media Display */}
                    <div className="aspect-square bg-gray-50 flex items-center justify-center relative group">
                      {mediaList.length > 0 ? (
                        <>
                          {mediaList[currentPreviewIndex]?.isVideo ? (
                            <video src={mediaList[currentPreviewIndex].preview} className="w-full h-full object-cover" muted autoPlay loop />
                          ) : (
                            <img src={mediaList[currentPreviewIndex]?.preview} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          )}
                          {mediaList.length > 1 && (
                            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                              <button
                                onClick={(e) => { e.stopPropagation(); setCurrentPreviewIndex(prev => Math.max(0, prev - 1)); }}
                                className={`p-1.5 bg-white/90 rounded-full shadow-lg pointer-events-auto transition-opacity ${currentPreviewIndex === 0 ? 'opacity-0' : 'opacity-100'}`}
                              >
                                <SafeIcon icon={FiChevronLeft} className="w-4 h-4 text-black" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setCurrentPreviewIndex(prev => Math.min(mediaList.length - 1, prev + 1)); }}
                                className={`p-1.5 bg-white/90 rounded-full shadow-lg pointer-events-auto transition-opacity ${currentPreviewIndex === mediaList.length - 1 ? 'opacity-0' : 'opacity-100'}`}
                              >
                                <SafeIcon icon={FiChevronRight} className="w-4 h-4 text-black" />
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-300 flex flex-col items-center gap-2">
                          <SafeIcon icon={FiImage} className="w-10 h-10 opacity-20" />
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Preview Waiting</p>
                        </div>
                      )}
                    </div>

                    {/* IG Footer */}
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex gap-3 mb-2">
                        <SafeIcon icon={FiStar} className="w-5 h-5 text-gray-800" />
                        <SafeIcon icon={FiZap} className="w-5 h-5 text-gray-800" />
                      </div>
                      <p className="text-[11px] text-gray-900 leading-normal">
                        <span className="font-bold mr-1.5">your_account</span>
                        <span className="opacity-80">{caption || 'Captions breathe life into your posts...'}</span>
                      </p>
                      {hashtags && <p className="text-[11px] text-blue-600 font-medium">{hashtags}</p>}
                    </div>
                  </div>
                </section>

                {/* Scheduling Section */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/5 space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <SafeIcon icon={FiCalendar} className="w-4 h-4 text-white" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-widest">Schedule Options</h4>
                  </div>

                  <div className="flex flex-col gap-2">
                    {[
                      { id: 'now', label: 'Publish Now', desc: 'Post immediately', icon: FiZap },
                      { id: 'next', label: 'Next Slot', desc: 'Auto-queue for best time', icon: FiStar },
                      { id: 'schedule', label: 'Custom Time', desc: 'Pick your moment', icon: FiClock },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => handleScheduleModeChange(mode.id)}
                        className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${scheduleMode === mode.id
                          ? 'bg-white text-black border-white shadow-lg'
                          : 'bg-zinc-900/30 border-white/5 text-zinc-400 hover:border-white/10 hover:bg-zinc-900'}`}
                      >
                        <div className={`p-2 rounded-lg ${scheduleMode === mode.id ? 'bg-black text-white' : 'bg-zinc-800'}`}>
                          <SafeIcon icon={mode.icon} className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-left">
                          <div className="text-[13px] font-bold">{mode.label}</div>
                          <div className="text-[10px] opacity-60 font-medium">{mode.desc}</div>
                        </div>
                        {scheduleMode === mode.id && <SafeIcon icon={FiCheck} className="ml-auto w-4 h-4 text-black" />}
                      </button>
                    ))}
                  </div>

                  {scheduleMode === 'schedule' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 pt-2 border-t border-white/5"
                    >
                      <div className="bg-zinc-950 rounded-xl p-2 border border-white/5 overflow-hidden datepicker-compact">
                        <DatePicker
                          selected={scheduledDate}
                          onChange={(date) => setScheduledDate(date)}
                          inline
                          minDate={new Date()}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {POSTING_SLOTS.slice(0, 4).map((slot) => {
                          const isSelected = scheduledDate && scheduledDate.getHours() === slot.hour && scheduledDate.getMinutes() === slot.minute;
                          return (
                            <button
                              key={slot.label}
                              onClick={() => handleTimeSlotClick(slot)}
                              className={`py-2 px-3 rounded-lg text-[11px] font-bold transition-all border ${isSelected
                                ? 'bg-white text-black border-white'
                                : 'bg-zinc-900 border-white/5 text-zinc-400 hover:border-white/10'}`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </section>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-6 border-t border-white/5">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || mediaList.length === 0}
                  className="w-full py-4 bg-white hover:bg-zinc-200 text-black rounded-2xl font-bold text-sm transition-all shadow-xl shadow-white/5 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-3 border-zinc-400 border-t-black rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{scheduleMode === 'now' ? 'Publish Post' : 'Confirm Schedule'}</span>
                      <SafeIcon icon={FiChevronRight} className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
                {scheduledDate && scheduleMode !== 'now' && (
                  <p className="text-[10px] text-center text-zinc-500 mt-4 font-medium flex items-center justify-center gap-2">
                    <SafeIcon icon={FiClock} className="w-3.5 h-3.5" />
                    Queueing for {format(scheduledDate, 'MMM d, h:mm a')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreatePostModal;

