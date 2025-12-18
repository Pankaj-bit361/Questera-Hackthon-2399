import React, { useRef, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { ASPECT_RATIOS, STYLES } from './constants';

const { FiSend, FiImage, FiX, FiMaximize, FiPaperclip, FiLoader } = FiIcons;

const ChatInput = ({
  prompt,
  setPrompt,
  onSend,
  loading,
  overrides,
  onUpdateOverride,
  referenceImages,
  onAddImage,
  onRemoveImage
}) => {
  const fileInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1];
        onAddImage({
          data: base64Data,
          mimeType: file.type,
          preview: reader.result
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = null;
  };

  return (
    <div className="relative group">

      {/* Active Settings / Reference Bar - Shows only when items exist */}
      {(referenceImages.length > 0 || overrides.aspectRatio || overrides.style) && (
        <div className="absolute bottom-full left-0 mb-3 ml-1 flex gap-2 overflow-x-auto max-w-full pb-2 scrollbar-hide">
          {referenceImages.map((img, idx) => (
            <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/10 group/img shadow-lg flex-shrink-0">
              <img src={img.preview} alt="Ref" className="w-full h-full object-cover" />
              <button
                onClick={() => onRemoveImage(idx)}
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <SafeIcon icon={FiX} className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}

          {overrides.aspectRatio && (
            <div className="h-14 px-3 rounded-xl bg-zinc-900 border border-white/10 flex flex-col justify-center text-xs min-w-[80px] shadow-lg">
              <span className="text-zinc-500 mb-0.5">Ratio</span>
              <span className="text-white font-medium">{ASPECT_RATIOS.find(r => r.value === overrides.aspectRatio)?.label}</span>
              <button onClick={() => onUpdateOverride('aspectRatio', null)} className="absolute top-1 right-1 text-zinc-500 hover:text-white"><SafeIcon icon={FiX} className="w-3 h-3" /></button>
            </div>
          )}

          {overrides.style && (
            <div className="h-14 px-3 rounded-xl bg-zinc-900 border border-white/10 flex flex-col justify-center text-xs min-w-[80px] shadow-lg">
              <span className="text-zinc-500 mb-0.5">Style</span>
              <span className="text-white font-medium">{STYLES.find(s => s.value === overrides.style)?.label}</span>
              <button onClick={() => onUpdateOverride('style', null)} className="absolute top-1 right-1 text-zinc-500 hover:text-white"><SafeIcon icon={FiX} className="w-3 h-3" /></button>
            </div>
          )}
        </div>
      )}

      {/* Main Input Container */}
      <div className={`
        relative bg-[#18181b] border transition-all duration-300 rounded-3xl overflow-hidden
        ${isFocused ? 'border-zinc-600 shadow-2xl' : 'border-white/10 shadow-lg'}
      `}>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Describe your imagination..."
          className="w-full max-h-48 bg-transparent text-white p-4 pr-32 resize-none outline-none scrollbar-hide text-[15px] leading-relaxed min-h-[60px]"
          rows={1}
        />

        {/* Bottom Toolbar inside Input */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">

          {/* Quick Tools */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              title="Upload Reference"
            >
              <SafeIcon icon={FiPaperclip} className="w-5 h-5" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>

          <div className="w-px h-5 bg-white/10"></div>

          {/* Send Button */}
          <button
            onClick={onSend}
            disabled={!prompt.trim() || loading}
            className={`
              w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
              ${loading || !prompt.trim()
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/10'
              }
            `}
          >
            {loading ? (
              <SafeIcon icon={FiLoader} className="w-5 h-5 animate-spin" />
            ) : (
              <SafeIcon icon={FiSend} className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

    </div>
  );
};

export default ChatInput;