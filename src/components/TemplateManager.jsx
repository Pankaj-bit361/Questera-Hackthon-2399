import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { API_BASE_URL } from '../config';

const { FiPlus, FiTrash2, FiCheck, FiX, FiLoader, FiImage, FiList, FiEye } = FiIcons;

const CATEGORIES = ['professional', 'casual', 'artistic', 'lifestyle', 'seasonal', 'fashion', 'portrait', 'other'];

const TemplateManager = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'drafts', 'templates'
  const [isLoading, setIsLoading] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'portrait',
    prompts: [''],
    aspectRatio: '1:1',
    style: 'photorealistic',
    isPublic: true,
  });

  const [referenceImages, setReferenceImages] = useState([]);
  const [referencePreviews, setReferencePreviews] = useState([]);

  useEffect(() => {
    if (activeTab === 'drafts') fetchDrafts();
    if (activeTab === 'templates') fetchTemplates();
  }, [activeTab]);

  const fetchDrafts = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/draft-template`);
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/template`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        setReferenceImages(prev => [...prev, { data: base64, mimeType: file.type }]);
        setReferencePreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input to allow selecting same files again
    e.target.value = '';
  };

  const removeReferenceImage = (index) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferencePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllReferenceImages = () => {
    setReferenceImages([]);
    setReferencePreviews([]);
  };

  const addPrompt = () => {
    setFormData({ ...formData, prompts: [...formData.prompts, ''] });
  };

  const updatePrompt = (index, value) => {
    const newPrompts = [...formData.prompts];
    newPrompts[index] = value;
    setFormData({ ...formData, prompts: newPrompts });
  };

  const removePrompt = (index) => {
    if (formData.prompts.length > 1) {
      const newPrompts = formData.prompts.filter((_, i) => i !== index);
      setFormData({ ...formData, prompts: newPrompts });
    }
  };

  const handleCreateDraft = async () => {
    if (!formData.name || formData.prompts.filter(p => p.trim()).length === 0) {
      alert('Please enter a name and at least one prompt');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/draft-template/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          prompts: formData.prompts.filter(p => p.trim()),
          referenceImages: referenceImages.length > 0 ? referenceImages : null,
          createdBy: 'admin',
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Draft created! ${data.successCount} images generated.`);
        setFormData({ name: '', description: '', category: 'portrait', prompts: [''], aspectRatio: '1:1', style: 'photorealistic', isPublic: true });
        setReferenceImages([]);
        setReferencePreviews([]);
        setActiveTab('drafts');
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveDraft = async (draftId, selectedImages = null) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/draft-template/${draftId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedImages }),
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Template approved and created!');
        setSelectedDraft(null);
        fetchDrafts();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectDraft = async (draftId) => {
    if (!confirm('Are you sure you want to reject and delete this draft?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/draft-template/${draftId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('Draft rejected and deleted');
        setSelectedDraft(null);
        fetchDrafts();
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  const handleDeleteAllTemplates = async () => {
    if (!confirm('⚠️ This will DELETE ALL templates. Are you sure?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/draft-template/admin/clear-all-templates`, { method: 'DELETE' });
      const data = await res.json();
      alert(data.message);
      fetchTemplates();
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Delete this template?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/template/${templateId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchTemplates();
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans">
      {/* Sidebar */}
      <div className="fixed top-0 left-0 w-6 h-full z-40" onMouseEnter={() => setSidebarOpen(true)} />
      <Sidebar isOpen={isSidebarOpen} onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)} />

      <main className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🎨 Template Manager</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-white/10 pb-4">
          {[
            { id: 'create', label: 'Create New', icon: FiPlus },
            { id: 'drafts', label: 'Pending Drafts', icon: FiEye },
            { id: 'templates', label: 'Approved Templates', icon: FiList },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
            >
              <SafeIcon icon={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Create Tab */}
        {activeTab === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Template Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-white/30"
                  placeholder="Enter template name"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none"
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none h-20 resize-none"
                placeholder="Describe this template..."
              />
            </div>

            {/* Reference Images */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-zinc-400">Reference Images (Optional)</label>
                {referencePreviews.length > 0 && (
                  <button onClick={clearAllReferenceImages} className="text-xs text-red-400 hover:text-red-300">
                    Clear All ({referencePreviews.length})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20">
                  <SafeIcon icon={FiImage} className="w-4 h-4" />
                  Add Images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
                {referencePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img src={preview} alt={`Reference ${index + 1}`} className="w-20 h-20 object-cover rounded-lg border border-white/10" />
                    <button
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <SafeIcon icon={FiX} className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/70 text-[10px] px-1 rounded">#{index + 1}</span>
                  </div>
                ))}
              </div>
              {referencePreviews.length > 0 && (
                <p className="text-xs text-zinc-500 mt-2">
                  {referencePreviews.length} image{referencePreviews.length > 1 ? 's' : ''} selected. These will be used as reference for AI generation.
                </p>
              )}
            </div>

            {/* Prompts */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Prompts *</label>
              <div className="space-y-3">
                {formData.prompts.map((prompt, index) => (
                  <div key={index} className="flex gap-2">
                    <textarea
                      value={prompt}
                      onChange={(e) => updatePrompt(index, e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none resize-none h-24"
                      placeholder={`Prompt ${index + 1}: Describe the scene...`}
                    />
                    {formData.prompts.length > 1 && (
                      <button onClick={() => removePrompt(index)} className="p-2 text-red-400 hover:text-red-300">
                        <SafeIcon icon={FiTrash2} className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addPrompt} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
                  <SafeIcon icon={FiPlus} className="w-4 h-4" /> Add another prompt
                </button>
              </div>
            </div>

            {/* Settings */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Aspect Ratio</label>
                <select value={formData.aspectRatio} onChange={(e) => setFormData({ ...formData, aspectRatio: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                  <option value="1:1">1:1 Square</option>
                  <option value="16:9">16:9 Landscape</option>
                  <option value="9:16">9:16 Portrait</option>
                  <option value="4:3">4:3 Standard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Style</label>
                <select value={formData.style} onChange={(e) => setFormData({ ...formData, style: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                  <option value="photorealistic">Photorealistic</option>
                  <option value="cinematic">Cinematic</option>
                  <option value="artistic">Artistic</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isPublic} onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })} className="w-4 h-4" />
                  <span className="text-sm">Make Public</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleCreateDraft}
              disabled={isLoading}
              className="w-full py-4 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <><SafeIcon icon={FiLoader} className="w-5 h-5 animate-spin" /> Generating...</> : <><SafeIcon icon={FiPlus} className="w-5 h-5" /> Create Draft & Generate Images</>}
            </button>
          </motion.div>
        )}

        {/* Drafts Tab */}
        {activeTab === 'drafts' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {isLoading ? (
              <div className="text-center py-12"><SafeIcon icon={FiLoader} className="w-8 h-8 animate-spin mx-auto" /></div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">No pending drafts</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {drafts.map(draft => (
                  <div key={draft._id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold">{draft.name}</h3>
                        <p className="text-xs text-zinc-500">{draft.category} • {draft.status}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${draft.status === 'ready_for_review' ? 'bg-yellow-500/20 text-yellow-400' :
                        draft.status === 'generating' ? 'bg-blue-500/20 text-blue-400' :
                          draft.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-500/20'
                        }`}>
                        {draft.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Reference Images */}
                    {draft.referenceImageUrls && draft.referenceImageUrls.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-zinc-500 mb-1">Reference Images ({draft.referenceImageUrls.length})</p>
                        <div className="flex gap-1 overflow-x-auto pb-1">
                          {draft.referenceImageUrls.map((url, idx) => (
                            <img key={idx} src={url} alt={`Ref ${idx + 1}`} className="w-12 h-12 object-cover rounded border border-cyan-500/30" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview Images */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {draft.previewImages?.slice(0, 6).map((img, idx) => (
                        <img key={idx} src={img.imageUrl} alt="" className="w-full aspect-square object-cover rounded-lg" />
                      ))}
                    </div>

                    {draft.status === 'ready_for_review' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveDraft(draft._id)} className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg flex items-center justify-center gap-2">
                          <SafeIcon icon={FiCheck} className="w-4 h-4" /> Approve
                        </button>
                        <button onClick={() => handleRejectDraft(draft._id)} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg flex items-center justify-center gap-2">
                          <SafeIcon icon={FiX} className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-end mb-4">
              <button onClick={handleDeleteAllTemplates} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg flex items-center gap-2">
                <SafeIcon icon={FiTrash2} className="w-4 h-4" /> Delete All Templates
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-12"><SafeIcon icon={FiLoader} className="w-8 h-8 animate-spin mx-auto" /></div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">No templates yet</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(template => (
                  <div key={template._id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <img src={template.referenceImageUrl} alt="" className="w-full aspect-video object-cover" />
                    <div className="p-4">
                      <h3 className="font-semibold mb-1">{template.name}</h3>
                      <p className="text-xs text-zinc-500 mb-2">{template.category} • {template.variations?.length || 0} variations</p>
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{template.description}</p>
                      <button onClick={() => handleDeleteTemplate(template._id)} className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg flex items-center justify-center gap-2">
                        <SafeIcon icon={FiTrash2} className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default TemplateManager;

