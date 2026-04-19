import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { ASPECT_RATIOS, IMAGE_SIZES, STYLES, GEMINI_MODELS, THINKING_LEVELS } from './constants';

const { FiX, FiSave, FiSliders, FiCpu, FiZap } = FiIcons;

const ProjectSettings = ({ isOpen, onClose, settings, onUpdate, onSave, saving }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[320px] bg-[#09090b] border-l border-white/5 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div className="flex items-center gap-2 text-white font-medium">
                <SafeIcon icon={FiSliders} className="w-4 h-4" />
                Project Settings
              </div>
              <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <SafeIcon icon={FiX} className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

              {/* Model */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <SafeIcon icon={FiCpu} className="w-3 h-3" />
                  Model
                </label>
                <div className="space-y-2">
                  {GEMINI_MODELS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => onUpdate('model', m.value)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${
                        settings.model === m.value
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-[#1c1c1e] border-transparent text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="text-[10px] text-zinc-500">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thinking Level */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <SafeIcon icon={FiZap} className="w-3 h-3" />
                  Thinking Level
                </label>
                <div className="flex gap-2">
                  {THINKING_LEVELS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => onUpdate('thinkingLevel', t.value)}
                      className={`flex-1 px-3 py-2.5 rounded-xl border text-xs transition-all ${
                        settings.thinkingLevel === t.value
                          ? 'bg-white text-black border-white font-semibold'
                          : 'bg-[#1c1c1e] text-zinc-400 border-transparent hover:border-zinc-700'
                      }`}
                    >
                      <div className="font-medium">{t.label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aspect Ratio</label>
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => onUpdate('aspectRatio', ratio.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        settings.aspectRatio === ratio.value
                          ? 'bg-white text-black border-white'
                          : 'bg-[#1c1c1e] text-zinc-400 border-transparent hover:border-zinc-700'
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Resolution */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Resolution</label>
                <div className="flex gap-2">
                  {IMAGE_SIZES.map((size) => (
                    <button
                      key={size.value}
                      onClick={() => onUpdate('imageSize', size.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        settings.imageSize === size.value
                          ? 'bg-white text-black border-white'
                          : 'bg-[#1c1c1e] text-zinc-400 border-transparent hover:border-zinc-700'
                      }`}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
                {(settings.imageSize === '512' || settings.imageSize === '4K') && (
                  <p className="text-[10px] text-zinc-600">
                    {settings.imageSize === '512' ? '0.5K is only available on Flash 3.1' : '4K may take longer to generate'}
                  </p>
                )}
              </div>

              {/* Art Style */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Art Style</label>
                <select
                  value={settings.style}
                  onChange={(e) => onUpdate('style', e.target.value)}
                  className="w-full bg-[#1c1c1e] text-white text-sm border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-white/30"
                >
                  {STYLES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* System Instructions */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">System Instructions</label>
                <textarea
                  value={settings.instructions}
                  onChange={(e) => onUpdate('instructions', e.target.value)}
                  className="w-full h-32 bg-[#1c1c1e] text-white text-sm border border-white/10 rounded-xl p-3 outline-none focus:border-white/30 resize-none placeholder-zinc-600"
                  placeholder="Persistent instructions (e.g. 'Always use warm lighting')"
                />
              </div>

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/5">
              <button
                onClick={onSave}
                disabled={saving}
                className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <SafeIcon icon={FiSave} className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProjectSettings;
