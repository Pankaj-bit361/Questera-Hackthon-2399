// User ID for API requests
const USER_ID = 'u-241a712b-e27d-4b7c-b0fb-764d95fb4f3d';

// 27 Portrait Variation Prompts
const PROMPTS = [
    "Create a cinematic portrait photo of a young woman with long dark hair styled in loose waves, wearing a pale green knitted sweater. She gently holds a single white flower in both hands, gazing calmly toward the camera with a serene, natural expression. The background is softly blurred, filled with floating soap bubbles, creating a dreamy atmosphere. The diffused luminous lighting adds a fresh airy feel with soft bokeh in greens, silvers, and pastels.",
    "Create a cozy indoor portrait of a young woman with long straight dark hair, sitting cross-legged against a warm mustard-yellow background. She wears a soft blue knitted sweater and white pants, smiling gently while hugging a large pink teddy bear. Two plush teddies — one blue and one peach — sit behind her. Soft even lighting enhances the pastel playful textures and nostalgic comfort.",
    "Create a sunlit outdoor portrait of a young woman standing beside a wall of white and yellow flowering vines. She has long wavy dark hair and wears an off-white sleeveless top tucked into high-waisted cream trousers. She gently touches the flowers while golden-hour sunlight casts soft shadows. The scene feels serene, natural, and organic.",
    "Create a stylish outdoor portrait of a young woman leaning against a light-colored wall surrounded by greenery. She wears a bright yellow flowy dress with flutter sleeves and reflective sunglasses. Sunlit bokeh creates a calm summer vibe. Blue and yellow flowers above her add a soft color frame.",
    "Create a natural outdoor portrait of a young woman sitting on a rock in a lush green park. She has long wavy dark hair and a gentle smile. She wears a purple kurti with white floral patterns, blue jeans, and white sneakers. Blooming lavender trees behind her create dreamy spring colors with warm light.",
    "Create a candid indoor lifestyle portrait of a young woman casually smiling at her phone, holding a half-finished iced Starbucks drink. She wears an oversized white t-shirt and black shorts. A laptop rests on her lap. Soft sunlight creates a spontaneous, youthful glow.",
    "Create a warm evening portrait of a young woman sitting at a cozy café decorated with potted flowers and ambient lights. She wears a sleeveless black-and-white patterned dress, smiling gently. Golden bokeh lights and a lively yet intimate atmosphere surround her.",
    "Create a fashionable portrait of a young woman standing confidently on a sunlit cobblestone street. She wears an off-shoulder white embroidered blouse with lavender details and high-waisted jeans with a bow belt. Her ponytail and sunglasses give a chic travel style under warm daylight.",
    "Create a serene beach portrait of a young woman sitting on soft white sand near turquoise water. She wears a flowing pastel mint-green dress with thin straps. Her wavy hair blows in the breeze as she gazes toward the horizon in warm afternoon light.",
    "Create a romantic outdoor portrait of a young woman sitting on a lush green field at sunset. She wears a long black off-shoulder dress with red cherry patterns and holds a small bouquet of red flowers. A chic red handbag lies beside her. Warm light enhances red-green harmony.",
    "Create a dramatic black-and-white studio portrait of a young woman in an oversized white shirt with one shoulder exposed. Intense yet calm expression. Strong contrast lighting with geometric shadows. Minimalist, elegant, editorial style.",
    "Create a lively street portrait of a young woman sitting on a bench against a red brick wall with graffiti. She smiles brightly, wearing a black leather jacket, floral black skirt, black boots, and sunglasses on her head. Soft daylight and shallow depth of field give an urban vibe.",
    "Create a trendy indoor portrait of a young woman posed inside a circular neon frame decorated with hanging vines. She wears a rose-pink ribbed sweater, white high-waisted trousers, and chunky sneakers. Warm and teal lighting mix for a cinematic modern look.",
    "Create a dreamy outdoor portrait of a young woman in a white sweater with yellow flowers, eyes closed and smiling peacefully. A perfect heart-shaped cloud floats above her head. Gentle sunlight and clear blue sky evoke calm, joy, and playful romance.",
    "Create a cheerful terrace portrait of a young woman sitting on a hanging swing chair surrounded by tropical plants and pink bougainvillea. She wears a floral maxi skirt and white sleeveless top. Ocean view in the distance, soft golden light, breezy summer charm.",
    "Create a serene outdoor portrait of a young woman sitting in front of an old stone fountain surrounded by greenery. She wears a white sleeveless top, flowing royal-blue skirt, and minimal accessories. Warm golden-hour glow enhances rustic charm.",
    "Create a stylish street portrait of a young woman leaning against a textured beige wall. She wears a cropped black top, loose navy jeans, a red-white-blue bomber jacket, and white sneakers. Hands in pockets, confident expression. Soft daylight with autumn leaves on the pavement.",
    "Create a moody cinematic portrait of a young woman sitting at a rustic café table, face resting on hands. She wears a fitted light beige ribbed sweater. Soft window light and warm bokeh background create intimate, thoughtful vibes.",
    "Create a softly lit mirror selfie of a young woman wearing a cream corset top with pink rose prints. Long wavy hair, henna on her hand as she tucks hair back. Warm light and blurred background add romantic elegance.",
    "Create a sophisticated indoor portrait of a young woman holding a bouquet of white roses and baby's breath. She wears a white off-shoulder satin blouse with puff sleeves and a high-waisted black skirt. Glowing hanging lights blur behind her for a cinematic atmosphere.",
    "Create a radiant beach portrait of a young woman in an off-shoulder white eyelet dress and wide straw hat. Intricate gold butterfly earrings. Blue sky and ocean in soft blur behind her. Natural golden lighting adds summer elegance.",
    "Create a tranquil countryside portrait of a young woman standing in a blooming daisy field under a clear blue sky. She wears a royal-blue sweater with shoulder ruffles and holds a big bouquet of daisies. Soft breeze, bright sunlight, dreamy bokeh.",
    "Create a travel portrait of a young woman posing calmly on a sandstone balcony overlooking the Taj Mahal. She wears a white crop top and black skirt with turquoise embroidery, plus sunglasses. Pigeons in flight add motion to the iconic backdrop.",
    "Create a serene outdoor portrait of a young woman standing beneath colorful bougainvillea in pink, blue, and yellow. She wears a sleeveless floral dress and stylish round sunglasses. Soft filtered sunlight adds golden warmth and romantic charm.",
    "Create a soft outdoor portrait of a young woman in a red ethnic printed top with silver jhumka earrings. Long hair flowing, arms loosely folded, warm genuine smile. Sunlight forms a golden rim light against blurred greenery.",
    "Create a radiant portrait of a young woman in a mustard-yellow silk saree with golden motifs. Her hair is tied in a jasmine-decorated bun with silver jhumkas. Soft sunlight enhances rich textures and a modern traditional aesthetic.",
    "Create a peaceful beach portrait of a young woman standing by the shore during a pastel sunset. She wears a black wrap top and high-waisted orange trousers with white palm leaf patterns. Breezy hair, gold jewelry, warm reflective light on wet sand."
];

let generatedImages = [];
let startTime = 0;

// Image preview
document.getElementById('referenceImage').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('previewImg').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

async function generateAllVariations() {
    const imageFile = document.getElementById('referenceImage').files[0];
    if (!imageFile) {
        alert('Please select a reference image');
        return;
    }

    const generateBtn = document.getElementById('generateBtn');
    const progress = document.getElementById('progress');
    const results = document.getElementById('results');

    generateBtn.disabled = true;
    progress.classList.add('active');
    results.classList.remove('active');
    generatedImages = [];
    startTime = Date.now();

    try {
        // Convert image to base64
        const imageBase64 = await fileToBase64(imageFile);
        const mimeType = imageFile.type;

        addLog('📸 Reference image loaded');
        addLog(`📝 Starting generation of ${PROMPTS.length} variations...`);
        addLog('');

        const aspectRatio = document.getElementById('aspectRatio').value;
        const imageSize = document.getElementById('imageSize').value;
        const style = document.getElementById('style').value;

        // Generate each image
        for (let i = 0; i < PROMPTS.length; i++) {
            const prompt = PROMPTS[i];
            updateProgress((i / PROMPTS.length) * 100);
            document.getElementById('currentPrompt').textContent = `Generating ${i + 1}/${PROMPTS.length}...`;
            addLog(`🎨 [${i + 1}/${PROMPTS.length}] Generating variation...`);

            try {
                addLog(`⏳ Waiting for Gemini API (this may take 30-60 seconds per image)...`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout per image

                const response = await fetch('http://localhost:3001/api/image/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
                    },
                    body: JSON.stringify({
                        userId: USER_ID,
                        images: [{
                            data: imageBase64,
                            mimeType: mimeType
                        }],
                        prompt: prompt,
                        aspectRatio: aspectRatio,
                        imageSize: imageSize,
                        style: style
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const result = await response.json();

                if (result.success && result.imageUrl) {
                    generatedImages.push({
                        prompt: prompt,
                        imageUrl: result.imageUrl,
                        index: i + 1
                    });
                    addLog(`✅ [${i + 1}/${PROMPTS.length}] Success!`);
                } else {
                    addLog(`❌ [${i + 1}/${PROMPTS.length}] Failed: ${result.error || 'Unknown error'}`);
                }

                // Add minimal delay to avoid rate limiting (API calls are already slow)
                if (i < PROMPTS.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } catch (error) {
                addLog(`❌ [${i + 1}/${PROMPTS.length}] Error: ${error.message}`);
            }
        }

        updateProgress(100);
        displayResults();

    } catch (error) {
        addLog(`❌ Error: ${error.message}`);
        alert(`Error: ${error.message}`);
    } finally {
        generateBtn.disabled = false;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function addLog(message) {
    const log = document.getElementById('log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    fill.style.width = percent + '%';
    fill.textContent = Math.round(percent) + '%';
}

function displayResults() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const results = document.getElementById('results');
    const gallery = document.getElementById('gallery');

    results.classList.add('active');

    // Update stats
    document.getElementById('totalCount').textContent = PROMPTS.length;
    document.getElementById('successCount').textContent = generatedImages.length;
    document.getElementById('failureCount').textContent = PROMPTS.length - generatedImages.length;
    document.getElementById('timeTaken').textContent = elapsed + 's';

    // Display gallery
    gallery.innerHTML = '';
    generatedImages.forEach((img) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${img.imageUrl}" alt="Variation ${img.index}">
            <div class="gallery-item-info">
                <h3>Variation ${img.index}</h3>
                <p>${img.prompt.substring(0, 100)}...</p>
            </div>
        `;
        gallery.appendChild(item);
    });

    addLog('');
    addLog(`✅ Generation complete! ${generatedImages.length}/${PROMPTS.length} successful`);
}

async function saveAsTemplate() {
    const templateName = document.getElementById('templateName').value;
    if (!templateName) {
        alert('Please enter a template name');
        return;
    }

    if (generatedImages.length === 0) {
        alert('No images to save');
        return;
    }

    const saveBtn = document.getElementById('saveTemplateBtn');
    saveBtn.disabled = true;

    try {
        addLog('💾 Saving template...');

        const imageFile = document.getElementById('referenceImage').files[0];
        const imageBase64 = await fileToBase64(imageFile);

        const response = await fetch('http://localhost:3001/api/template/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            },
            body: JSON.stringify({
                userId: USER_ID,
                name: templateName,
                description: document.getElementById('templateDescription').value,
                category: 'lifestyle',
                referenceImage: {
                    data: imageBase64,
                    mimeType: imageFile.type
                },
                prompts: generatedImages.map(img => img.prompt),
                aspectRatio: document.getElementById('aspectRatio').value,
                imageSize: document.getElementById('imageSize').value,
                style: document.getElementById('style').value,
                createdBy: USER_ID
            })
        });

        const result = await response.json();

        if (result.success) {
            addLog('✅ Template saved successfully!');
            addLog(`📋 Template ID: ${result.template._id}`);
            alert('Template saved successfully!');
        } else {
            addLog(`❌ Error: ${result.error}`);
            alert(`Error: ${result.error}`);
        }

    } catch (error) {
        addLog(`❌ Error: ${error.message}`);
        alert(`Error: ${error.message}`);
    } finally {
        saveBtn.disabled = false;
    }
}

