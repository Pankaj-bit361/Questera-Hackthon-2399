#!/usr/bin/env node
/**
 * Template Creation Script
 * 
 * This script allows you to create image templates by:
 * 1. Uploading a reference image
 * 2. Providing multiple prompts
 * 3. Generating AI images for each prompt
 * 4. Saving everything as a reusable template in the database
 * 
 * Usage:
 *   node create-template.js --image path/to/image.jpg --prompts prompts.txt --name "My Template"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001/api/template/create';
const USER_ID = process.env.USER_ID || 'admin';

// Helper function to convert image to base64
function imageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
}

// Helper function to get MIME type
function getMimeType(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'image/jpeg';
}

// Helper function to load prompts from file
function loadPrompts(promptsFile) {
    const content = fs.readFileSync(promptsFile, 'utf-8');
    return content.split('\n').filter(line => line.trim()).map(line => line.trim());
}

// Interactive prompt
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Main function
async function createTemplate(options) {
    try {
        console.log('🎨 Template Creation Tool\n');
        console.log('='.repeat(50));

        // Get inputs
        let imagePath = options.image;
        let promptsFile = options.prompts;
        let templateName = options.name;
        let description = options.description;
        let category = options.category || 'other';
        let aspectRatio = options.aspectRatio || '1:1';
        let imageSize = options.imageSize || '2K';
        let style = options.style || 'photorealistic';
        let isPublic = options.public || false;
        let tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [];

        // Interactive mode if no arguments provided
        if (!imagePath) {
            imagePath = await askQuestion('📸 Enter path to reference image: ');
        }

        if (!promptsFile) {
            promptsFile = await askQuestion('📝 Enter path to prompts file: ');
        }

        if (!templateName) {
            templateName = await askQuestion('🏷️  Enter template name: ');
        }

        if (!description) {
            description = await askQuestion('📄 Enter description (optional): ');
        }

        // Validate files
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        if (!fs.existsSync(promptsFile)) {
            throw new Error(`Prompts file not found: ${promptsFile}`);
        }

        // Load data
        console.log('\n📂 Loading files...');
        const imageBase64 = imageToBase64(imagePath);
        const mimeType = getMimeType(imagePath);
        const prompts = loadPrompts(promptsFile);

        console.log(`✅ Image loaded: ${path.basename(imagePath)}`);
        console.log(`✅ Prompts loaded: ${prompts.length} variations\n`);

        // Prepare request
        const requestBody = {
            name: templateName,
            description: description || `Template with ${prompts.length} variations`,
            category,
            referenceImage: {
                data: imageBase64,
                mimeType
            },
            prompts,
            aspectRatio,
            imageSize,
            style,
            tags,
            isPublic,
            createdBy: USER_ID
        };

        console.log('📋 Template Configuration:');
        console.log(`   Name: ${templateName}`);
        console.log(`   Category: ${category}`);
        console.log(`   Variations: ${prompts.length}`);
        console.log(`   Settings: ${imageSize}, ${aspectRatio}, ${style}`);
        console.log(`   Public: ${isPublic}`);
        console.log(`   Tags: ${tags.join(', ') || 'none'}\n`);

        console.log('🚀 Creating template...');
        console.log('⏳ This may take several minutes...\n');

        const startTime = Date.now();

        // Make API request
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (result.success) {
            console.log(`\n✅ Template created successfully in ${elapsed}s!\n`);
            console.log('📊 Results:');
            console.log(`   Template ID: ${result.template._id}`);
            console.log(`   Successful: ${result.successCount}/${result.template.variations.length}`);
            console.log(`   Failed: ${result.failureCount}\n`);

            // Save results
            const outputFile = `template-${result.template._id}.json`;
            fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
            console.log(`💾 Full results saved to: ${outputFile}\n`);

        } else {
            console.error(`\n❌ Template creation failed: ${result.error}`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
}

// Run
createTemplate(options);

