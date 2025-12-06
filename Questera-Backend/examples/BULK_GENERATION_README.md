# Bulk Image Generation API

Generate multiple AI images of the same person in different scenarios using a single reference image and multiple prompts.

## 🎯 Use Case

Perfect for creating:
- Portrait variations in different styles
- Professional headshots in various settings
- Marketing materials with consistent person across different scenes
- Social media content variations
- Product photography with the same model

## 📋 API Endpoint

```
POST /api/image/bulk-generate
```

## 🔑 Request Format

```json
{
  "referenceImage": {
    "data": "base64_encoded_image_data",
    "mimeType": "image/jpeg"
  },
  "prompts": [
    "Create a cinematic portrait with soft lighting...",
    "Create a professional business portrait...",
    "Create a casual outdoor portrait..."
  ],
  "userId": "user-123",
  "aspectRatio": "1:1",
  "imageSize": "2K",
  "style": "photorealistic",
  "batchName": "Portrait Variations"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `referenceImage` | Object | Yes | The reference image of the person |
| `referenceImage.data` | String | Yes | Base64 encoded image data |
| `referenceImage.mimeType` | String | Yes | MIME type (e.g., "image/jpeg", "image/png") |
| `prompts` | Array<String> | Yes | Array of prompts for different scenarios |
| `userId` | String | Yes | User ID for tracking |
| `aspectRatio` | String | No | "auto", "1:1", "16:9", "9:16", "4:3", "3:4" (default: "auto") |
| `imageSize` | String | No | "2K" or "4K" (default: "2K") |
| `style` | String | No | "none", "photorealistic", "artistic", etc. (default: "none") |
| `batchName` | String | No | Name for this batch of generations |
| `imageChatId` | String | No | Existing chat ID to continue conversation |

## ✅ Response Format

```json
{
  "success": true,
  "imageChatId": "bulk-abc123",
  "referenceImageUrl": "https://s3.amazonaws.com/...",
  "totalPrompts": 5,
  "successCount": 5,
  "failureCount": 0,
  "results": [
    {
      "promptIndex": 0,
      "prompt": "Create a cinematic portrait...",
      "success": true,
      "imageUrl": "https://s3.amazonaws.com/generated-1.jpg",
      "images": [...],
      "messageId": "m-xyz789"
    }
  ],
  "errors": []
}
```

## 🚀 Quick Start

### Option 1: Using the HTML Test Page

1. Open `bulk-generation-test.html` in your browser
2. Upload a reference image
3. Enter your prompts (one per line)
4. Configure settings
5. Click "Generate Images"

### Option 2: Using Node.js Script

```bash
cd examples
node bulk-image-generation-example.js
```

### Option 3: Using cURL

```bash
curl -X POST http://localhost:3000/api/image/bulk-generate \
  -H "Content-Type: application/json" \
  -d '{
    "referenceImage": {
      "data": "YOUR_BASE64_IMAGE",
      "mimeType": "image/jpeg"
    },
    "prompts": [
      "Create a professional portrait in office setting",
      "Create a casual outdoor portrait in nature"
    ],
    "userId": "user-123",
    "aspectRatio": "1:1",
    "imageSize": "2K"
  }'
```

## 💡 Example Prompts

### Professional Portraits
```
Create a professional business portrait in a modern office setting, wearing a navy blue blazer. Natural daylight from floor-to-ceiling windows, confident pose with arms crossed, city skyline in background.
```

### Lifestyle Portraits
```
Create a casual lifestyle portrait in a cozy coffee shop, wearing a comfortable sweater. Sitting by a window with a latte, reading a book, warm indoor lighting creating an intimate atmosphere.
```

### Artistic Portraits
```
Create a cinematic portrait with soft lighting, wearing a pale green knitted sweater. Holding a white flower, serene expression, dreamy atmosphere with floating soap bubbles, soft pastels and bokeh effects.
```

### Outdoor Portraits
```
Create a vibrant outdoor portrait in a sunflower field during golden hour, wearing a flowing yellow sundress. Laughing joyfully, surrounded by sunflowers, warm sunset lighting creating a magical atmosphere.
```

## ⚙️ Configuration Tips

### Aspect Ratios
- **1:1** - Perfect for Instagram posts, profile pictures
- **16:9** - Great for YouTube thumbnails, website banners
- **9:16** - Ideal for Instagram Stories, TikTok
- **4:3** - Classic portrait orientation
- **auto** - Let AI decide based on prompt

### Image Sizes
- **2K** - Faster generation, good for web use (recommended for testing)
- **4K** - Higher quality, better for print (slower generation)

### Styles
- **none** - Natural, based on prompt only
- **photorealistic** - Enhanced realism
- **artistic** - More creative interpretation
- **cinematic** - Movie-like quality

## 🔄 Rate Limiting

The API includes a 2-second delay between each generation to avoid rate limits. For 10 prompts, expect approximately 20-30 seconds total processing time (depending on image complexity).

## 📊 Best Practices

1. **Reference Image Quality**: Use high-quality, well-lit photos with clear facial features
2. **Prompt Specificity**: Be detailed about clothing, setting, lighting, and mood
3. **Batch Size**: Start with 3-5 prompts for testing, then scale up
4. **Consistency**: Keep similar style/tone across prompts for cohesive results
5. **Error Handling**: Check the `errors` array in response for failed generations

## 🐛 Troubleshooting

### "Reference image is required"
- Ensure the image is properly base64 encoded
- Check that `mimeType` is correct

### "Prompts array is required"
- Verify prompts is an array with at least one item
- Check for empty strings in the array

### Generation fails for some prompts
- Check the `errors` array in the response
- Some prompts may be too complex or violate content policies
- Try simplifying the prompt or adjusting the style

## 📝 Notes

- All generated images are automatically saved to S3
- Conversation history is maintained in MongoDB
- Each generation creates message records for tracking
- Reference image is uploaded once and reused for all prompts

