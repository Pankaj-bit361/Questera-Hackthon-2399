const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Image = require('../models/image');
const ImageMessage = require('../models/imageMessage');
const { ASPECT_RATIOS, IMAGE_SIZES, STYLES } = require('../enums/imageEnums');

// Default project settings
const DEFAULT_PROJECT_SETTINGS = {
    aspectRatio: 'auto',
    imageSize: '2K',
    style: 'none',
    instructions: '',
    temperature: 1,
    topP: 1,
};

class ImageController {
    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
        this.model = 'gemini-3-pro-image-preview'; // Verify this model name is correct for your access

        // Initialize S3 client
        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    /**
     * Upload image to S3
     */
    async uploadToS3(buffer, mimeType) {
        const extension = mimeType?.split('/')[1] || 'png';
        const fileName = `images/${uuidv4()}.${extension}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        }));

        return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    async generateImages(req, res) {
        try {
            console.log('🚀 [GENERATE] Starting image generation...');
            console.log('📥 [GENERATE] Request body:', JSON.stringify(req.body, null, 2));

            const {
                prompt,
                userId,
                imageChatId,
                images,
                aspectRatio: aspectRatioOverride,
                imageSize: imageSizeOverride,
                style: styleOverride,
            } = req.body;

            if (!prompt) {
                return { status: 400, json: { error: 'Prompt is required' } };
            }
            if (!userId) {
                return { status: 400, json: { error: 'User ID is required' } };
            }

            console.log('📋 [GENERATE] Prompt:', prompt);
            console.log('📋 [GENERATE] Overrides:', { aspectRatioOverride, imageSizeOverride, styleOverride });

            let projectSettings = {};
            let existingConversation = null;

            if (imageChatId) {
                console.log('🔍 [GENERATE] Loading existing conversation:', imageChatId);
                existingConversation = await Image.findOne({ imageChatId });
                if (existingConversation?.imageSettings) {
                    projectSettings = {
                        ...existingConversation.imageSettings.toObject(),
                    };
                    console.log('📋 [GENERATE] Project settings from DB:', projectSettings);
                }
            }

            const finalSettings = {
                ...projectSettings,
                ...(aspectRatioOverride && { aspectRatio: aspectRatioOverride }),
                ...(imageSizeOverride && { imageSize: imageSizeOverride }),
                ...(styleOverride && { style: styleOverride }),
            };

            console.log('⚙️ [GENERATE] Final settings:', finalSettings);

            // FIX: Filter out 'auto' aspect ratio and invalid image sizes
            // The API expects specific strings for aspect ratio. 'auto' is not valid.
            const imageConfig = {};
            
            if (finalSettings.aspectRatio && finalSettings.aspectRatio !== 'auto') {
                imageConfig.aspectRatio = finalSettings.aspectRatio;
            }
            
            // Note: Gemini API might not support 'imageSize' directly as '2K'/'4K' in basic config. 
            // Usually it infers from aspect ratio or takes width/height. 
            // We'll pass it if it's not the default enum strings just in case, or map it if you have specific mapping logic.
            // For now, we'll exclude strictly non-standard sizes to avoid errors, or rely on API ignoring it.
            // But since the error was specifically about aspect_ratio, we fixed that above.

            const config = {
                responseModalities: ['IMAGE', 'TEXT'],
                ...(finalSettings.temperature && { temperature: finalSettings.temperature }),
                ...(finalSettings.topP && { topP: finalSettings.topP }),
                imageConfig: imageConfig, 
                ...(finalSettings.instructions && { systemInstruction: [{ text: finalSettings.instructions }] }),
            };

            console.log('🔧 [GENERATE] Gemini config:', JSON.stringify(config, null, 2));

            let enhancedPrompt = prompt;
            if (finalSettings.style && finalSettings.style !== 'none') {
                enhancedPrompt = `${finalSettings.style} style: ${prompt}`;
            }

            console.log('📝 [GENERATE] Enhanced prompt:', enhancedPrompt);

            const parts = [{ text: enhancedPrompt }];
            const referenceImageUrls = [];

            if (images && Array.isArray(images) && images.length > 0) {
                console.log('🖼️ [GENERATE] Processing', images.length, 'reference images...');
                for (const image of images) {
                    let imageData = image.data || image;
                    let mimeType = image.mimeType || 'image/jpeg';

                    if (typeof imageData === 'string' && imageData.startsWith('http')) {
                        console.log('🌐 [GENERATE] Fetching image from URL...');
                        const response = await fetch(imageData);
                        const arrayBuffer = await response.arrayBuffer();
                        imageData = Buffer.from(arrayBuffer).toString('base64');
                        if (imageData.includes('.png')) mimeType = 'image/png';
                        else if (imageData.includes('.webp')) mimeType = 'image/webp';
                    }

                    console.log('☁️ [GENERATE] Uploading reference image to S3...');
                    const buffer = Buffer.from(imageData, 'base64');
                    const referenceUrl = await this.uploadToS3(buffer, mimeType);
                    referenceImageUrls.push(referenceUrl);
                    console.log('✅ [GENERATE] Reference image uploaded:', referenceUrl);

                    parts.push({
                        inlineData: {
                            mimeType,
                            data: imageData,
                        },
                    });
                }
            }

            const contents = [
                {
                    role: 'user',
                    parts,
                },
            ];
            
            console.log('🤖 [GENERATE] Calling Gemini API...');
            console.time('gemini-api-call');
            
            const response = await this.ai.models.generateContentStream({
                model: this.model,
                config,
                contents,
            });
            

            console.log('📡 [GENERATE] Got stream response, processing chunks...');

            const generatedImages = [];
            let textResponse = '';
            let chunkCount = 0;

            for await (const chunk of response) {
                chunkCount++;
                console.log(`📦 [GENERATE] Processing chunk #${chunkCount}...`);

                if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
                    console.log(`⚠️ [GENERATE] Chunk #${chunkCount} has no valid parts, skipping...`);
                    continue;
                }

                const parts = chunk.candidates[0].content.parts;

                for (const part of parts) {
                    if (part.inlineData) {
                        console.log(`🖼️ [GENERATE] Found image in chunk #${chunkCount}, uploading to S3...`);
                        console.time(`s3-upload-chunk-${chunkCount}`);
                        
                        const inlineData = part.inlineData;
                        const buffer = Buffer.from(inlineData.data || '', 'base64');
                        
                        console.log(`📊 [GENERATE] Image buffer size: ${buffer.length} bytes`);
                        
                        const imageUrl = await this.uploadToS3(buffer, inlineData.mimeType);
                        console.timeEnd(`s3-upload-chunk-${chunkCount}`);
                        console.log(`✅ [GENERATE] Image uploaded:`, imageUrl);

                        generatedImages.push({
                            mimeType: inlineData.mimeType,
                            url: imageUrl,
                        });
                    }

                    if (chunk.text) {
                        console.log(`💬 [GENERATE] Got text in chunk #${chunkCount}:`, chunk.text.substring(0, 100));
                        textResponse += chunk.text;
                    }
                }
            }

            console.timeEnd('gemini-api-call');
            console.log(`✅ [GENERATE] Stream processing complete. Chunks: ${chunkCount}, Images: ${generatedImages.length}`);

            const chatId = imageChatId || 'chat-' + uuidv4();
            const messageId = 'm' + uuidv4();

            console.log('💾 [GENERATE] Saving user message...');
            const userMessage = await ImageMessage.create({
                role: 'user',
                userId,
                content: prompt,
                referenceImages: referenceImageUrls,
                imageChatId: chatId,
                messageId: 'm-' + uuidv4(),
            });
            console.log('✅ [GENERATE] User message saved');

            console.log('💾 [GENERATE] Saving assistant message...');
            const assistantMessage = await ImageMessage.create({
                role: 'assistant',
                userId,
                content: textResponse || 'Image generated successfully',
                imageUrl: generatedImages.length > 0 ? generatedImages[0].url : null,
                imageChatId: chatId,
                messageId: 'm-' + uuidv4(),
            });
            console.log('✅ [GENERATE] Assistant message saved');

            console.log('💾 [GENERATE] Saving/updating conversation...');
            let imageConversation = existingConversation || await Image.findOne({ imageChatId: chatId });

            if (!imageConversation) {
                console.log('🆕 [GENERATE] Creating new conversation...');
                imageConversation = await Image.create({
                    name: prompt.substring(0, 50),
                    desc: prompt,
                    userId,
                    imageChatId: chatId,
                    messages: [userMessage._id, assistantMessage._id],
                    imageSettings: {
                        aspectRatio: finalSettings.aspectRatio,
                        imageSize: finalSettings.imageSize,
                        style: finalSettings.style,
                        instructions: finalSettings.instructions,
                        temperature: finalSettings.temperature,
                        topP: finalSettings.topP,
                    },
                });
                console.log('✅ [GENERATE] New conversation created:', chatId);
            } else {
                console.log('📝 [GENERATE] Updating existing conversation...');
                imageConversation.messages.push(userMessage._id, assistantMessage._id);
                await imageConversation.save();
                console.log('✅ [GENERATE] Conversation updated');
            }

            console.log('🎉 [GENERATE] Complete! Returning response...');
            return {
                status: 200,
                json: {
                    success: true,
                    imageChatId: chatId,
                    messageId,
                    images: generatedImages,
                    imageUrl: generatedImages.length > 0 ? generatedImages[0].url : null,
                    textResponse,
                    userMessage,
                    assistantMessage,
                },
            };

        } catch (error) {
            console.error('❌ [GENERATE] Error:', error);
            console.error('❌ [GENERATE] Stack:', error.stack);
            return {
                status: 500,
                json: { error: error.message },
            };
        }
    }

    /**
     * Get conversation history
     */
    async getConversation(req, res) {
        try {
            const { imageChatId } = req.params;
            const conversation = await Image.findOne({ imageChatId })
                .populate('messages');
            
            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            return { status: 200, json: conversation };
        } catch (error) {
            console.error('Error fetching conversation:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    async getUserConversations(req, res) {
        try {
            const { userId } = req.params;
            const conversations = await Image.find({ userId })
                .sort({ createdAt: -1 })
                .lean();

            // Get first message for each conversation as title
            const conversationsWithTitles = await Promise.all(
                conversations.map(async (conv) => {
                    const firstMessage = await ImageMessage.findOne({ imageChatId: conv.imageChatId })
                        .sort({ createdAt: 1 })
                        .lean();
                    
                    return {
                        ...conv,
                        title: firstMessage?.prompt?.slice(0, 50) || 'Untitled',
                    };
                })
            );

            return { status: 200, json: { conversations: conversationsWithTitles } };
        } catch (error) {
            console.error('Error fetching user conversations:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Update project settings for a conversation
     * Only allows updating: aspectRatio, imageSize, style, instructions, temperature, topP
     */
    async updateProjectSettings(req, res) {
        try {
            const { imageChatId } = req.params;
            const { aspectRatio, imageSize, style, instructions, temperature, topP } = req.body;

            const conversation = await Image.findOne({ imageChatId });
            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            // Initialize imageSettings if not exists
            if (!conversation.imageSettings) {
                conversation.imageSettings = { ...DEFAULT_PROJECT_SETTINGS };
            }

            // Update only provided fields
            if (aspectRatio !== undefined && ASPECT_RATIOS.includes(aspectRatio)) {
                conversation.imageSettings.aspectRatio = aspectRatio;
            }
            if (imageSize !== undefined && IMAGE_SIZES.includes(imageSize)) {
                conversation.imageSettings.imageSize = imageSize;
            }
            if (style !== undefined && STYLES.includes(style)) {
                conversation.imageSettings.style = style;
            }
            if (instructions !== undefined) {
                conversation.imageSettings.instructions = instructions;
            }
            if (temperature !== undefined && temperature >= 0 && temperature <= 2) {
                conversation.imageSettings.temperature = temperature;
            }
            if (topP !== undefined && topP >= 0 && topP <= 1) {
                conversation.imageSettings.topP = topP;
            }

            await conversation.save();

            return { status: 200, json: { success: true, imageSettings: conversation.imageSettings } };
        } catch (error) {
            console.error('Error updating project settings:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get project settings for a conversation
     */
    async getProjectSettings(req, res) {
        try {
            const { imageChatId } = req.params;
            const conversation = await Image.findOne({ imageChatId });
            
            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            return { status: 200, json: { imageSettings: conversation.imageSettings || DEFAULT_PROJECT_SETTINGS } };
        } catch (error) {
            console.error('Error fetching project settings:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = ImageController;