import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import InstagramConnect from './InstagramConnect';

const { FiZap, FiArrowRight, FiUpload, FiGrid, FiImage, FiLayout } = FiIcons;

const TEMPLATE_VARIATIONS = [
  { id: 1, title: "Cinematic Portrait – White Flower & Bubbles", prompt: "Create a cinematic portrait photo of a young woman with long dark hair styled in loose waves, wearing a pale green knitted sweater. She gently holds a single white flower in both hands, gazing calmly toward the camera with a serene, natural expression. The background is softly blurred, filled with floating soap bubbles, creating a dreamy atmosphere. The diffused luminous lighting adds a fresh airy feel with soft bokeh in greens, silvers, and pastels." },
  { id: 2, title: "Cozy Indoor with Teddy Bears", prompt: "Create a cozy indoor portrait of a young woman with long straight dark hair, sitting cross-legged against a warm mustard-yellow background. She wears a soft blue knitted sweater and white pants, smiling gently while hugging a large pink teddy bear. Two plush teddies — one blue and one peach — sit behind her. Soft even lighting enhances the pastel playful textures and nostalgic comfort." },
  { id: 3, title: "Sunlit Flowering Vines", prompt: "Create a sunlit outdoor portrait of a young woman standing beside a wall of white and yellow flowering vines. She has long wavy dark hair and wears an off-white sleeveless top tucked into high-waisted cream trousers. She gently touches the flowers while golden-hour sunlight casts soft shadows. The scene feels serene, natural, and organic." },
  { id: 4, title: "Yellow Dress Summer Vibe", prompt: "Create a stylish outdoor portrait of a young woman leaning against a light-colored wall surrounded by greenery. She wears a bright yellow flowy dress with flutter sleeves and reflective sunglasses. Sunlit bokeh creates a calm summer vibe. Blue and yellow flowers above her add a soft color frame." },
  { id: 5, title: "Park Lavender Spring", prompt: "Create a natural outdoor portrait of a young woman sitting on a rock in a lush green park. She has long wavy dark hair and a gentle smile. She wears a purple kurti with white floral patterns, blue jeans, and white sneakers. Blooming lavender trees behind her create dreamy spring colors with warm light." },
  { id: 6, title: "Casual Lifestyle Moment", prompt: "Create a candid indoor lifestyle portrait of a young woman casually smiling at her phone, holding a half-finished iced Starbucks drink. She wears an oversized white t-shirt and black shorts. A laptop rests on her lap. Soft sunlight creates a spontaneous, youthful glow." },
  { id: 7, title: "Cozy Café Evening", prompt: "Create a warm evening portrait of a young woman sitting at a cozy café decorated with potted flowers and ambient lights. She wears a sleeveless black-and-white patterned dress, smiling gently. Golden bokeh lights and a lively yet intimate atmosphere surround her." },
  { id: 8, title: "Chic Street Style", prompt: "Create a fashionable portrait of a young woman standing confidently on a sunlit cobblestone street. She wears an off-shoulder white embroidered blouse with lavender details and high-waisted jeans with a bow belt. Her ponytail and sunglasses give a chic travel style under warm daylight." },
  { id: 9, title: "Serene Beach Turquoise", prompt: "Create a serene beach portrait of a young woman sitting on soft white sand near turquoise water. She wears a flowing pastel mint-green dress with thin straps. Her wavy hair blows in the breeze as she gazes toward the horizon in warm afternoon light." },
  { id: 10, title: "Romantic Sunset Field", prompt: "Create a romantic outdoor portrait of a young woman sitting on a lush green field at sunset. She wears a long black off-shoulder dress with red cherry patterns and holds a small bouquet of red flowers. A chic red handbag lies beside her. Warm light enhances red-green harmony." },
  { id: 11, title: "Dramatic B&W Studio", prompt: "Create a dramatic black-and-white studio portrait of a young woman in an oversized white shirt with one shoulder exposed. Intense yet calm expression. Strong contrast lighting with geometric shadows. Minimalist, elegant, editorial style." },
  { id: 12, title: "Urban Brick Wall", prompt: "Create a lively street portrait of a young woman sitting on a bench against a red brick wall with graffiti. She smiles brightly, wearing a black leather jacket, floral black skirt, black boots, and sunglasses on her head. Soft daylight and shallow depth of field give an urban vibe." },
  { id: 13, title: "Neon Modern Aesthetic", prompt: "Create a trendy indoor portrait of a young woman posed inside a circular neon frame decorated with hanging vines. She wears a rose-pink ribbed sweater, white high-waisted trousers, and chunky sneakers. Warm and teal lighting mix for a cinematic modern look." },
  { id: 14, title: "Dreamy Cloud Heart", prompt: "Create a dreamy outdoor portrait of a young woman in a white sweater with yellow flowers, eyes closed and smiling peacefully. A perfect heart-shaped cloud floats above her head. Gentle sunlight and clear blue sky evoke calm, joy, and playful romance." },
  { id: 15, title: "Tropical Swing Paradise", prompt: "Create a cheerful terrace portrait of a young woman sitting on a hanging swing chair surrounded by tropical plants and pink bougainvillea. She wears a floral maxi skirt and white sleeveless top. Ocean view in the distance, soft golden light, breezy summer charm." },
  { id: 16, title: "Stone Fountain Serenity", prompt: "Create a serene outdoor portrait of a young woman sitting in front of an old stone fountain surrounded by greenery. She wears a white sleeveless top, flowing royal-blue skirt, and minimal accessories. Warm golden-hour glow enhances rustic charm." },
  { id: 17, title: "Confident Street Style", prompt: "Create a stylish street portrait of a young woman leaning against a textured beige wall. She wears a cropped black top, loose navy jeans, a red-white-blue bomber jacket, and white sneakers. Hands in pockets, confident expression. Soft daylight with autumn leaves on the pavement." },
  { id: 18, title: "Moody Café Thoughts", prompt: "Create a moody cinematic portrait of a young woman sitting at a rustic café table, face resting on hands. She wears a fitted light beige ribbed sweater. Soft window light and warm bokeh background create intimate, thoughtful vibes." },
  { id: 19, title: "Mirror Selfie Romance", prompt: "Create a softly lit mirror selfie of a young woman wearing a cream corset top with pink rose prints. Long wavy hair, henna on her hand as she tucks hair back. Warm light and blurred background add romantic elegance." },
  { id: 20, title: "White Roses Elegance", prompt: "Create a sophisticated indoor portrait of a young woman holding a bouquet of white roses and baby's breath. She wears a white off-shoulder satin blouse with puff sleeves and a high-waisted black skirt. Glowing hanging lights blur behind her for a cinematic atmosphere." },
  { id: 21, title: "Beach Straw Hat Elegance", prompt: "Create a radiant beach portrait of a young woman in an off-shoulder white eyelet dress and wide straw hat. Intricate gold butterfly earrings. Blue sky and ocean in soft blur behind her. Natural golden lighting adds summer elegance." },
  { id: 22, title: "Daisy Field Dreams", prompt: "Create a tranquil countryside portrait of a young woman standing in a blooming daisy field under a clear blue sky. She wears a royal-blue sweater with shoulder ruffles and holds a big bouquet of daisies. Soft breeze, bright sunlight, dreamy bokeh." },
  { id: 23, title: "Taj Mahal Travel", prompt: "Create a travel portrait of a young woman posing calmly on a sandstone balcony overlooking the Taj Mahal. She wears a white crop top and black skirt with turquoise embroidery, plus sunglasses. Pigeons in flight add motion to the iconic backdrop." },
  { id: 24, title: "Bougainvillea Romance", prompt: "Create a serene outdoor portrait of a young woman standing beneath colorful bougainvillea in pink, blue, and yellow. She wears a sleeveless floral dress and stylish round sunglasses. Soft filtered sunlight adds golden warmth and romantic charm." },
  { id: 25, title: "Ethnic Red Top Warmth", prompt: "Create a soft outdoor portrait of a young woman in a red ethnic printed top with silver jhumka earrings. Long hair flowing, arms loosely folded, warm genuine smile. Sunlight forms a golden rim light against blurred greenery." },
  { id: 26, title: "Golden Saree Tradition", prompt: "Create a radiant portrait of a young woman in a mustard-yellow silk saree with golden motifs. Her hair is tied in a jasmine-decorated bun with silver jhumkas. Soft sunlight enhances rich textures and a modern traditional aesthetic." },
  { id: 27, title: "Sunset Palm Vibe", prompt: "Create a peaceful beach portrait of a young woman standing by the shore during a pastel sunset. She wears a black wrap top and high-waisted orange trousers with white palm leaf patterns. Breezy hair, gold jewelry, warm reflective light on wet sand." },
];

const HomePage = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    // Navigate to ChatPage with the prompt data
    navigate('/chat/new', { state: { prompt } });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleTemplateClick = (template) => {
    setPrompt(template.prompt);
    setSelectedTemplate(template.id);
  };

  const saveAsTemplate = async (templateName) => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/template/create-from-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'u-241a712b-e27d-4b7c-b0fb-764d95fb4f3d',
          name: templateName,
          description: prompt,
          category: 'portrait',
          imageUrls: [], // Will be populated with generated images
          createdBy: 'u-241a712b-e27d-4b7c-b0fb-764d95fb4f3d',
          isPublic: true,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`✅ Template "${templateName}" saved successfully!`);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Error saving template: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-hidden font-sans selection:bg-white/20 relative">

      {/* Sidebar Trigger Zone */}
      <div
        className="fixed top-0 left-0 w-6 h-full z-40 bg-transparent hover:bg-white/0 transition-colors"
        onMouseEnter={() => setSidebarOpen(true)}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      />

      <main className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 transition-all duration-300">

        <div className="relative z-10 w-full max-w-3xl mx-auto text-center space-y-8">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300 mx-auto"
          >
            <SafeIcon icon={FiZap} className="w-3 h-3" />
            <span>Introducing Velos v2.0 Model</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight"
          >
            What will you <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500 italic pr-1">visualize</span> today?
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-xl mx-auto"
          >
            Generate stunning ultra-realistic images and design assets by chatting with AI.
          </motion.p>

          {/* Input Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className={`
              relative w-full mt-10 group transition-all duration-300 
              ${isFocused ? 'scale-[1.01]' : ''}
            `}
          >
            <div className="relative bg-[#18181B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-white/20 transition-colors">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Describe your imagination... e.g., A futuristic Tokyo street with neon rain, cinematic lighting, 8k..."
                className="w-full h-32 bg-transparent text-lg p-5 resize-none outline-none placeholder-zinc-600 text-white custom-scrollbar"
              />

              <div className="flex items-center justify-between px-4 pb-4 pt-2">
                <div className="flex items-center gap-2">
                  <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Upload Reference">
                    <SafeIcon icon={FiUpload} className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Select Model">
                    <SafeIcon icon={FiGrid} className="w-5 h-5" />
                  </button>
                  <div className="h-4 w-px bg-white/10 mx-1"></div>
                  <span className="text-xs text-zinc-500 font-mono">Velos XL 1.0</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerate}
                    className="bg-white text-black px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-zinc-200 transition-colors"
                  >
                    <span>Generate</span>
                    <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute -inset-1 bg-gradient-to-r from-white/20 via-white/10 to-white/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-500 -z-10"></div>
          </motion.div>

          {/* Templates Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="w-full mt-12"
          >
            <h3 className="text-sm font-semibold text-zinc-400 mb-4 text-left">✨ Try a Template</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATE_VARIATIONS.map((template) => (
                <motion.div
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleTemplateClick(template)}
                  className={`
                    cursor-pointer group relative overflow-hidden rounded-xl border transition-all duration-300
                    ${selectedTemplate === template.id
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                    }
                  `}
                >
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={template.image}
                      alt={template.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  </div>

                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                      {template.title}
                    </h4>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {template.prompt}
                    </p>
                  </div>

                  {selectedTemplate === template.id && (
                    <div className="absolute top-2 right-2 bg-white text-black rounded-full p-1">
                      <SafeIcon icon={FiArrowRight} className="w-4 h-4" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500 pt-8"
          >
            <span>or start with</span>
            <button className="flex items-center gap-2 hover:text-white transition-colors border border-white/5 bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10">
              <SafeIcon icon={FiImage} className="w-4 h-4" />
              Upload Image
            </button>
          </motion.div>

          {/* Instagram Connect Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="pt-8 border-t border-white/10"
          >
            <InstagramConnect userId="u-241a712b-e27d-4b7c-b0fb-764d95fb4f3d" />
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 flex items-end justify-center overflow-hidden">
          <div className="w-[150%] h-[100%] bg-gradient-to-t from-white/5 via-transparent to-transparent rounded-[100%] blur-[100px] translate-y-[50%]"></div>
        </div>
      </main>

      <footer className="fixed bottom-4 right-6 text-xs text-zinc-700 z-30 pointer-events-none">
        <div className="pointer-events-auto flex gap-4">
          <a href="#" className="hover:text-zinc-500 transition-colors">Privacy</a>
          <a href="#" className="hover:text-zinc-500 transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;