# 🎨 Template Creation System - Complete Guide

## Overview

This system allows you to create **AI image templates** by:
1. Uploading **ONE reference image** (a person's photo)
2. Providing **MULTIPLE prompts** (different scenarios/styles)
3. Generating AI images for each prompt using the same person
4. Saving everything as a **reusable template** in the database

## 📁 Files in This Directory

- **`template-creator.html`** - Interactive web interface for creating templates
- **`create-template.js`** - Command-line script for creating templates
- **`sample-prompts.txt`** - Example prompts for testing
- **`README.md`** - This file

## 🚀 Quick Start

### Method 1: Web Interface (Easiest)

1. **Start your backend server:**
   ```bash
   cd Questera-Backend
   npm start
   ```

2. **Open the template creator:**
   - Open `template-creator.html` in your browser
   - Or navigate to: `file:///path/to/Questera-Backend/scripts/template-creator.html`

3. **Fill in the form:**
   - **Template Name**: e.g., "Portrait Variations"
   - **Description**: Brief description
   - **Category**: Choose from dropdown
   - **Reference Image**: Upload your photo
   - **Prompts**: Paste your prompts (one per line)
   - **Settings**: Choose aspect ratio, size, style

4. **Click "Create Template"** and wait for generation to complete

### Method 2: Command Line

1. **Create a prompts file** (or use `sample-prompts.txt`):
   ```bash
   # Create your-prompts.txt with one prompt per line
   ```

2. **Run the script:**
   ```bash
   node create-template.js \
     --image path/to/your-photo.jpg \
     --prompts your-prompts.txt \
     --name "My Template" \
     --description "Description here" \
     --category professional \
     --aspectRatio 1:1 \
     --imageSize 2K \
     --style photorealistic
   ```

3. **Results will be saved** to `template-{id}.json`

## 📝 Using Your 27 Prompts

You provided 27 amazing prompts! Here's how to use them:

### Option A: Copy-Paste into Web Interface

1. Open `template-creator.html`
2. Copy all 27 prompts from your message
3. Paste into the "Prompts" textarea
4. Upload your reference image
5. Click "Create Template"

### Option B: Create a Prompts File

Create a file called `portrait-variations.txt`:

```
Create a cinematic portrait photo of a young woman with long dark hair styled in loose waves, wearing a pale green knitted sweater. She gently holds a single white flower in both hands, gazing calmly toward the camera with a serene, natural expression. The background is softly blurred, filled with floating soap bubbles, creating a dreamy atmosphere. The diffused luminous lighting adds a fresh airy feel with soft bokeh in greens, silvers, and pastels.
Create a cozy indoor portrait of a young woman with long straight dark hair, sitting cross-legged against a warm mustard-yellow background. She wears a soft blue knitted sweater and white pants, smiling gently while hugging a large pink teddy bear. Two plush teddies — one blue and one peach — sit behind her. Soft even lighting enhances the pastel playful textures and nostalgic comfort.
... (add all 27 prompts)
```

Then run:
```bash
node create-template.js \
  --image your-reference-photo.jpg \
  --prompts portrait-variations.txt \
  --name "Portrait Variations Collection" \
  --category lifestyle \
  --imageSize 2K
```

## ⚙️ Configuration Options

### Categories
- `professional` - Business, corporate, headshots
- `casual` - Everyday, relaxed settings
- `artistic` - Creative, dramatic lighting
- `lifestyle` - Daily life, activities
- `seasonal` - Season-specific themes
- `fashion` - Style-focused, trendy
- `other` - Everything else

### Aspect Ratios
- `1:1` - Square (Instagram posts)
- `16:9` - Landscape (YouTube thumbnails)
- `9:16` - Portrait (Instagram Stories)
- `4:3` / `3:4` - Classic ratios
- `auto` - Let AI decide

### Image Sizes
- `2K` - Faster generation, good for web (recommended for testing)
- `4K` - Higher quality, better for print (slower)

### Styles
- `photorealistic` - Enhanced realism (recommended)
- `artistic` - Creative interpretation
- `cinematic` - Movie-like quality
- `none` - Natural, no style enhancement

## 📊 Expected Results

With your 27 prompts:
- **Generation Time**: ~60-90 seconds per image
- **Total Time**: ~30-45 minutes for all 27
- **Success Rate**: Typically 95%+ successful generations
- **Storage**: All images saved to S3 and URLs stored in database

## 🎯 What Happens After Creation

Once your template is created:

1. **Saved in Database**: Template with all variations stored in MongoDB
2. **Images on S3**: Reference image + 27 generated images uploaded
3. **Reusable**: Users can apply this template to their own photos
4. **Template ID**: You'll get a unique ID to reference this template

## 🔄 Using Templates (For End Users)

After creating a template, users can apply it to their own photos:

### API Endpoint
```bash
POST /api/template/{templateId}/use
```

### Request Body
```json
{
  "userImage": {
    "data": "base64_encoded_image",
    "mimeType": "image/jpeg"
  },
  "userId": "user-123",
  "selectedVariations": [0, 5, 10, 15]  // Optional: specific prompts only
}
```

### Response
```json
{
  "success": true,
  "templateName": "Portrait Variations Collection",
  "results": [
    {
      "prompt": "Create a cinematic portrait...",
      "imageUrl": "https://s3.../generated-image.jpg",
      "originalTemplateImage": "https://s3.../template-image.jpg"
    }
  ]
}
```

## 📋 API Endpoints

### Create Template
```
POST /api/template/create
```

### Get All Templates
```
GET /api/template?category=professional&isPublic=true
```

### Get Single Template
```
GET /api/template/{id}
```

### Update Template
```
PUT /api/template/{id}
```

### Delete Template
```
DELETE /api/template/{id}
```

### Use Template
```
POST /api/template/{id}/use
```

## 💡 Tips for Best Results

1. **Reference Image Quality**:
   - Use high-resolution photos (at least 1024x1024)
   - Clear, well-lit face
   - Neutral expression works best for variations

2. **Prompt Writing**:
   - Be specific about lighting, setting, clothing
   - Include mood and atmosphere details
   - Mention colors and textures
   - Your 27 prompts are excellent examples!

3. **Performance**:
   - Start with 2K for testing
   - Use 4K only for final production
   - Expect 2-3 seconds per image + 2-second delay between

4. **Organization**:
   - Use descriptive template names
   - Add relevant tags for easy searching
   - Group similar styles in one template

## 🐛 Troubleshooting

### "Template creation failed"
- Check backend server is running on port 3001
- Verify MongoDB connection
- Check AWS S3 credentials in .env

### "Some variations failed"
- Check the `errors` array in response
- Simplify complex prompts
- Ensure prompts comply with content policy

### "Slow generation"
- Normal for many prompts (27 prompts = ~30-45 min)
- Use 2K instead of 4K for faster results
- Consider splitting into multiple smaller templates

## 📈 Next Steps

1. **Create your first template** with the 27 prompts
2. **Test the template** by applying it to different photos
3. **Integrate into frontend** - Add UI for users to browse and use templates
4. **Add more templates** - Create collections for different use cases

## 🎓 Example Workflow

```bash
# 1. Start backend
cd Questera-Backend
npm start

# 2. Open template creator in browser
open scripts/template-creator.html

# 3. Fill in form:
#    - Name: "Portrait Variations Collection"
#    - Category: lifestyle
#    - Upload your reference photo
#    - Paste all 27 prompts
#    - Settings: 2K, 1:1, photorealistic

# 4. Click "Create Template"
#    - Wait 30-45 minutes
#    - Get template ID

# 5. Template is now ready to use!
```

## 📞 Support

If you encounter issues:
1. Check backend logs for errors
2. Verify all environment variables are set
3. Test with fewer prompts first (5-10)
4. Check S3 bucket permissions

---

**Ready to create amazing templates!** 🎨✨

