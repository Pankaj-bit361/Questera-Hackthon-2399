/**
 * Bulk Image Generation Example
 * 
 * This script demonstrates how to use the bulk image generation API
 * to create multiple variations of a person in different scenarios.
 * 
 * Usage:
 * 1. Update the API_URL with your backend URL
 * 2. Update the USER_ID with your user ID
 * 3. Convert your reference image to base64 or provide a URL
 * 4. Add your prompts array
 * 5. Run: node bulk-image-generation-example.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'http://localhost:3000/api/image/bulk-generate'; // Update with your backend URL
const USER_ID = 'your-user-id-here'; // Update with your user ID

// Helper function to convert image file to base64
function imageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
}

// Example prompts for different scenarios
const prompts = [
    "Create a cinematic portrait photo of a young woman with long dark hair styled in loose waves, wearing a pale green knitted sweater. She gently holds a single white flower in both hands, gazing calmly toward the camera with a serene, natural expression. The background is softly blurred, filled with floating soap bubbles, creating a dreamy atmosphere. The lighting is diffused and luminous, giving a fresh and airy feel, with subtle bokeh effects adding depth. The color palette emphasizes soft greens, silvers, and delicate pastels, evoking a sense of calm, innocence, and wonder.",
    
    "Create a professional business portrait of the same woman in a modern office setting, wearing a navy blue blazer. She is standing confidently with arms crossed, with floor-to-ceiling windows and city skyline in the background. Natural daylight creates a bright, professional atmosphere.",
    
    "Create a vibrant outdoor portrait of the same woman in a sunflower field during golden hour. She is wearing a flowing yellow sundress, laughing joyfully with sunflowers surrounding her. Warm sunset lighting creates a magical, cheerful atmosphere.",
    
    "Create an elegant evening portrait of the same woman at a formal event, wearing a sophisticated black evening gown. She is standing in a luxurious ballroom with crystal chandeliers, soft ambient lighting creating a glamorous, refined atmosphere.",
    
    "Create a casual lifestyle portrait of the same woman in a cozy coffee shop, wearing a comfortable sweater and jeans. She is sitting by a window with a latte, reading a book. Warm indoor lighting creates an intimate, relaxed atmosphere."
];

// Main function to perform bulk generation
async function bulkGenerateImages() {
    try {
        console.log('🚀 Starting bulk image generation...\n');

        // Option 1: Load image from file
        // const referenceImagePath = './reference-image.jpg';
        // const referenceImageBase64 = imageToBase64(referenceImagePath);

        // Option 2: Use image URL (if already uploaded)
        // const referenceImageUrl = 'https://your-s3-bucket.s3.amazonaws.com/image.jpg';

        // For this example, we'll use a placeholder
        // Replace this with your actual image data
        const referenceImage = {
            data: 'YOUR_BASE64_IMAGE_DATA_HERE', // or use imageToBase64(path)
            mimeType: 'image/jpeg'
        };

        const requestBody = {
            referenceImage: referenceImage,
            prompts: prompts,
            userId: USER_ID,
            aspectRatio: '1:1', // Options: '1:1', '16:9', '9:16', '4:3', '3:4', 'auto'
            imageSize: '2K', // Options: '2K', '4K'
            style: 'photorealistic', // Options: 'none', 'photorealistic', 'artistic', etc.
            batchName: 'Portrait Variations - ' + new Date().toLocaleDateString()
        };

        console.log(`📋 Generating ${prompts.length} variations...`);
        console.log(`⚙️ Settings: ${requestBody.imageSize}, ${requestBody.aspectRatio}, ${requestBody.style}\n`);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add authentication header if required
                // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Bulk generation completed!\n');
            console.log(`📊 Results:`);
            console.log(`   Total prompts: ${result.totalPrompts}`);
            console.log(`   Successful: ${result.successCount}`);
            console.log(`   Failed: ${result.failureCount}`);
            console.log(`   Chat ID: ${result.imageChatId}\n`);

            console.log('🖼️ Generated Images:');
            result.results.forEach((item, index) => {
                console.log(`\n${index + 1}. ${item.prompt.substring(0, 60)}...`);
                console.log(`   URL: ${item.imageUrl}`);
            });

            if (result.errors.length > 0) {
                console.log('\n❌ Errors:');
                result.errors.forEach((error, index) => {
                    console.log(`\n${index + 1}. ${error.prompt.substring(0, 60)}...`);
                    console.log(`   Error: ${error.error}`);
                });
            }

            // Optionally save results to a file
            const outputPath = path.join(__dirname, 'bulk-generation-results.json');
            fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
            console.log(`\n💾 Results saved to: ${outputPath}`);

        } else {
            console.error('❌ Bulk generation failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run the bulk generation
bulkGenerateImages();

