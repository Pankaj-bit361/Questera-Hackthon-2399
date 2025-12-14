import { motion, AnimatePresence } from 'framer-motion';

/**
 * ThinkingSteps - Displays the AI's reasoning process
 * 
 * This component makes the AI "feel smart" by showing users
 * the cognitive steps the AI took to complete their request.
 */

const PERSONA_STYLES = {
  strategist: { emoji: '🧠', name: 'Strategist AI', gradient: 'from-purple-500 to-violet-500' },
  creative: { emoji: '🎨', name: 'Creative AI', gradient: 'from-pink-500 to-rose-500' },
  editor: { emoji: '✏️', name: 'Editor AI', gradient: 'from-amber-500 to-orange-500' },
  researcher: { emoji: '🔍', name: 'Research AI', gradient: 'from-blue-500 to-cyan-500' },
  growth: { emoji: '📅', name: 'Growth AI', gradient: 'from-emerald-500 to-teal-500' },
  reviewer: { emoji: '🛡️', name: 'Reviewer AI', gradient: 'from-indigo-500 to-purple-500' }
};

const ThinkingSteps = ({ steps, decisions, suggestions, persona, isExpanded = true, onSuggestionClick }) => {
  if (!steps || steps.length === 0) return null;

  const personaStyle = PERSONA_STYLES[persona] || PERSONA_STYLES.strategist;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-4"
      >
        {/* Thinking Steps Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{personaStyle.emoji}</span>
          <span className={`text-xs font-bold uppercase tracking-wider bg-gradient-to-r ${personaStyle.gradient} bg-clip-text text-transparent`}>
            {personaStyle.name}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>

        {/* Thinking Steps List */}
        {isExpanded && (
          <div className="space-y-2 mb-4 pl-1">
            {steps.map((step, idx) => {
              const stepPersona = PERSONA_STYLES[step.persona] || PERSONA_STYLES.strategist;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="text-base mt-0.5">{step.emoji || stepPersona.emoji}</span>
                  <div className="flex-1">
                    <span className="text-zinc-400">{step.action}</span>
                    {step.detail && (
                      <span className="text-zinc-500 text-xs block mt-0.5">{step.detail}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Micro-Decisions */}
        {decisions && decisions.length > 0 && (
          <div className="space-y-2 mb-4 pl-1 border-l-2 border-white/5 ml-2">
            {decisions.map((decision, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="pl-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-xs">✓</span>
                  <span className="text-zinc-300">{decision.reason}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 p-3 bg-zinc-900/30 rounded-xl border border-white/5"
          >
            <div className="text-xs text-zinc-500 mb-2 font-medium">💡 Quick actions</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 rounded-lg transition-all border border-white/5 cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default ThinkingSteps;

