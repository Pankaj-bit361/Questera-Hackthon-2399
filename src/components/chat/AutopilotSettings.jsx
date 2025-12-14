import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { autopilotAPI } from '../../lib/api';
import { toast } from 'react-toastify';

const { FiX, FiZap, FiPlay, FiPause, FiSettings, FiCheck, FiAlertCircle, FiImage, FiUpload, FiTrash2, FiUser, FiPackage } = FiIcons;

const ONBOARDING_STEPS = [
  { key: 'topics', label: 'What topics do you post about?', placeholder: 'e.g., fitness, tech tips, lifestyle, travel photography...' },
  { key: 'targetAudience', label: 'Who is your target audience?', placeholder: 'e.g., 18-35 entrepreneurs, fitness enthusiasts, working moms...' },
  { key: 'visualStyle', label: 'What visual style fits your brand?', placeholder: 'e.g., minimalist, bold colors, dark aesthetic, warm tones...' },
  { key: 'tone', label: 'What tone do you use in captions?', placeholder: 'e.g., professional, casual & funny, inspiring, educational...' },
];

const AutopilotSettings = ({ isOpen, onClose, chatId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState(null);
  const [memory, setMemory] = useState(null);
  const [brandInfo, setBrandInfo] = useState({ topics: '', targetAudience: '', visualStyle: '', tone: '' });
  const [currentStep, setCurrentStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [referenceImages, setReferenceImages] = useState({
    productImages: [],
    styleReferences: [],
    personalReference: { url: null },
  });
  const [uploadingType, setUploadingType] = useState(null);

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    if (isOpen && chatId && chatId !== 'new') {
      fetchStatus();
    }
  }, [isOpen, chatId]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [status, imagesRes] = await Promise.all([
        autopilotAPI.getStatus(userId, chatId),
        autopilotAPI.getImages(userId, chatId),
      ]);
      if (status.success) {
        setConfig(status.config);
        setMemory(status.memory);
        if (status.memory?.brand) {
          setBrandInfo({
            topics: status.memory.brand.topicsAllowed?.join(', ') || '',
            targetAudience: status.memory.brand.targetAudience || '',
            visualStyle: status.memory.brand.visualStyle || '',
            tone: status.memory.brand.tone || '',
          });
        }
        setShowOnboarding(!status.brandComplete);
      }
      if (imagesRes.success) {
        setReferenceImages(imagesRes.referenceImages);
      }
    } catch (error) {
      console.error('Failed to fetch autopilot status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBrand = async () => {
    setSaving(true);
    try {
      const result = await autopilotAPI.updateMemory(userId, chatId, {
        topicsAllowed: brandInfo.topics.split(',').map(t => t.trim()).filter(Boolean),
        targetAudience: brandInfo.targetAudience,
        visualStyle: brandInfo.visualStyle,
        tone: brandInfo.tone,
      });
      if (result.success) {
        toast.success('Brand info saved!');
        setShowOnboarding(false);
        fetchStatus();
      }
    } catch (error) {
      toast.error('Failed to save brand info');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    try {
      const result = await autopilotAPI.toggle(userId, chatId);
      if (result.success) {
        setConfig(result.config);
        toast.success(result.config.enabled ? '🤖 Autopilot enabled!' : 'Autopilot disabled');
      }
    } catch (error) {
      toast.error('Failed to toggle autopilot');
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await autopilotAPI.run(userId, chatId);
      if (result.success) {
        toast.success('🚀 Autopilot created content!');
      } else {
        toast.error(result.error || 'Failed to run autopilot');
      }
    } catch (error) {
      toast.error('Failed to run autopilot');
    } finally {
      setRunning(false);
    }
  };

  const handleImageUpload = async (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploadingType(type);
    try {
      const images = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve({ data: base64, mimeType: file.type || 'image/png', name: file.name });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));

      const result = await autopilotAPI.uploadImages(userId, chatId, images, type);
      if (result.success) {
        setReferenceImages(result.referenceImages);
        toast.success(`${type === 'personal' ? 'Profile photo' : 'Image'} uploaded!`);
      } else {
        toast.error('Failed to upload image');
      }
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingType(null);
      e.target.value = '';
    }
  };

  const handleDeleteImage = async (type, url) => {
    try {
      const result = await autopilotAPI.deleteImage(userId, chatId, type, url);
      if (result.success) {
        setReferenceImages(result.referenceImages);
        toast.success('Image deleted');
      }
    } catch (error) {
      toast.error('Failed to delete image');
    }
  };

  const brandComplete = brandInfo.topics && brandInfo.targetAudience && brandInfo.visualStyle && brandInfo.tone;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[360px] bg-[#09090b] border-l border-white/5 z-50 flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div className="flex items-center gap-2 text-white font-medium">
                <SafeIcon icon={FiZap} className="w-4 h-4 text-yellow-400" />
                Autopilot Settings
              </div>
              <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <SafeIcon icon={FiX} className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              ) : chatId === 'new' ? (
                <div className="text-center py-12 text-zinc-500">
                  <SafeIcon icon={FiAlertCircle} className="w-8 h-8 mx-auto mb-3" />
                  <p>Save this chat first to enable Autopilot</p>
                </div>
              ) : showOnboarding ? (
                <OnboardingFlow brandInfo={brandInfo} setBrandInfo={setBrandInfo} currentStep={currentStep}
                  setCurrentStep={setCurrentStep} onSave={handleSaveBrand} saving={saving} />
              ) : (
                <AutopilotControls config={config} brandInfo={brandInfo} brandComplete={brandComplete}
                  onToggle={handleToggle} onRunNow={handleRunNow} running={running}
                  onEditBrand={() => setShowOnboarding(true)}
                  referenceImages={referenceImages} onImageUpload={handleImageUpload}
                  onDeleteImage={handleDeleteImage} uploadingType={uploadingType} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const OnboardingFlow = ({ brandInfo, setBrandInfo, currentStep, setCurrentStep, onSave, saving }) => {
  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const allFilled = Object.values(brandInfo).every(v => v.trim());

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <SafeIcon icon={FiZap} className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-white font-semibold text-lg">Set Up Autopilot</h3>
        <p className="text-zinc-500 text-sm mt-1">Tell us about your brand so Autopilot can create on-brand content</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1">
        {ONBOARDING_STEPS.map((_, i) => (
          <div key={i} className={`flex-1 h-1 rounded-full ${i <= currentStep ? 'bg-yellow-500' : 'bg-zinc-800'}`} />
        ))}
      </div>

      {/* Current Question */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">{step.label}</label>
        <textarea value={brandInfo[step.key]} onChange={(e) => setBrandInfo(prev => ({ ...prev, [step.key]: e.target.value }))}
          placeholder={step.placeholder}
          className="w-full h-24 bg-[#1c1c1e] text-white text-sm border border-white/10 rounded-xl p-3 outline-none focus:border-yellow-500/50 resize-none placeholder-zinc-600" />
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {currentStep > 0 && (
          <button onClick={() => setCurrentStep(currentStep - 1)}
            className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all">
            Back
          </button>
        )}
        {isLastStep ? (
          <button onClick={onSave} disabled={!allFilled || saving}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : (
              <><SafeIcon icon={FiCheck} className="w-4 h-4" /> Complete Setup</>
            )}
          </button>
        ) : (
          <button onClick={() => setCurrentStep(currentStep + 1)} disabled={!brandInfo[step.key].trim()}
            className="flex-1 py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50">
            Next
          </button>
        )}
      </div>
    </div>
  );
};

const AutopilotControls = ({ config, brandInfo, brandComplete, onToggle, onRunNow, running, onEditBrand,
  referenceImages, onImageUpload, onDeleteImage, uploadingType }) => {
  const isEnabled = config?.enabled;
  const productInputRef = React.useRef(null);
  const styleInputRef = React.useRef(null);
  const personalInputRef = React.useRef(null);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className={`p-4 rounded-2xl border ${isEnabled ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}>
              <SafeIcon icon={FiZap} className={`w-5 h-5 ${isEnabled ? 'text-white' : 'text-zinc-400'}`} />
            </div>
            <div>
              <div className="text-white font-medium">{isEnabled ? 'Autopilot Active' : 'Autopilot Off'}</div>
              <div className="text-zinc-500 text-xs">{isEnabled ? 'Creating content daily' : 'Enable to start'}</div>
            </div>
          </div>
          <button onClick={onToggle} disabled={!brandComplete}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${isEnabled ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-green-500 text-black hover:bg-green-400'}`}>
            {isEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {!brandComplete && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm flex items-center gap-2">
          <SafeIcon icon={FiAlertCircle} className="w-4 h-4" />
          Complete brand setup to enable Autopilot
        </div>
      )}

      {/* Brand Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Brand Profile</label>
          <button onClick={onEditBrand} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">
            <SafeIcon icon={FiSettings} className="w-3 h-3" /> Edit
          </button>
        </div>
        <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3 text-sm">
          <div><span className="text-zinc-500">Topics:</span> <span className="text-white">{brandInfo.topics || '—'}</span></div>
          <div><span className="text-zinc-500">Audience:</span> <span className="text-white">{brandInfo.targetAudience || '—'}</span></div>
          <div><span className="text-zinc-500">Style:</span> <span className="text-white">{brandInfo.visualStyle || '—'}</span></div>
          <div><span className="text-zinc-500">Tone:</span> <span className="text-white">{brandInfo.tone || '—'}</span></div>
        </div>
      </div>

      {/* Reference Images Section */}
      <div className="space-y-4">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Reference Images</label>

        {/* Personal Reference */}
        <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <SafeIcon icon={FiUser} className="w-4 h-4 text-purple-400" />
            Your Photo <span className="text-zinc-500 text-xs">(for personalized AI images)</span>
          </div>
          <input type="file" accept="image/*" ref={personalInputRef} className="hidden" onChange={(e) => onImageUpload(e, 'personal')} />
          {referenceImages?.personalReference?.url ? (
            <div className="relative group">
              <img src={referenceImages.personalReference.url} alt="Personal" className="w-16 h-16 rounded-xl object-cover" />
              <button onClick={() => onDeleteImage('personal', referenceImages.personalReference.url)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <SafeIcon icon={FiTrash2} className="w-3 h-3 text-white" />
              </button>
            </div>
          ) : (
            <button onClick={() => personalInputRef.current?.click()} disabled={uploadingType === 'personal'}
              className="w-full py-3 border border-dashed border-zinc-600 rounded-xl text-zinc-400 text-sm hover:border-purple-500 hover:text-purple-400 transition-all flex items-center justify-center gap-2">
              {uploadingType === 'personal' ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-purple-400 rounded-full animate-spin" /> : (
                <><SafeIcon icon={FiUpload} className="w-4 h-4" /> Upload Photo</>
              )}
            </button>
          )}
        </div>

        {/* Product Images */}
        <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <SafeIcon icon={FiPackage} className="w-4 h-4 text-blue-400" />
            Product Images <span className="text-zinc-500 text-xs">(optional)</span>
          </div>
          <input type="file" accept="image/*" multiple ref={productInputRef} className="hidden" onChange={(e) => onImageUpload(e, 'product')} />
          <div className="flex flex-wrap gap-2">
            {referenceImages?.productImages?.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img.url} alt={img.name || 'Product'} className="w-14 h-14 rounded-lg object-cover" />
                <button onClick={() => onDeleteImage('product', img.url)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <SafeIcon icon={FiTrash2} className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
            <button onClick={() => productInputRef.current?.click()} disabled={uploadingType === 'product'}
              className="w-14 h-14 border border-dashed border-zinc-600 rounded-lg flex items-center justify-center text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all">
              {uploadingType === 'product' ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" /> : (
                <SafeIcon icon={FiUpload} className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Style References */}
        <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <SafeIcon icon={FiImage} className="w-4 h-4 text-green-400" />
            Style References <span className="text-zinc-500 text-xs">(aesthetic examples)</span>
          </div>
          <input type="file" accept="image/*" multiple ref={styleInputRef} className="hidden" onChange={(e) => onImageUpload(e, 'style')} />
          <div className="flex flex-wrap gap-2">
            {referenceImages?.styleReferences?.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img.url} alt={img.name || 'Style'} className="w-14 h-14 rounded-lg object-cover" />
                <button onClick={() => onDeleteImage('style', img.url)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <SafeIcon icon={FiTrash2} className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
            <button onClick={() => styleInputRef.current?.click()} disabled={uploadingType === 'style'}
              className="w-14 h-14 border border-dashed border-zinc-600 rounded-lg flex items-center justify-center text-zinc-500 hover:border-green-500 hover:text-green-400 transition-all">
              {uploadingType === 'style' ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-green-400 rounded-full animate-spin" /> : (
                <SafeIcon icon={FiUpload} className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Run Now */}
      {isEnabled && (
        <button onClick={onRunNow} disabled={running}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50">
          {running ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
            <><SafeIcon icon={FiPlay} className="w-4 h-4" /> Run Now</>
          )}
        </button>
      )}
    </div>
  );
};

export default AutopilotSettings;

