const mongoose = require('mongoose');

const imageMessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    imageUrl: String,
    referenceImages: [{
        type: String
    }],
    imageChatId: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        required: true,
        unique: true
    }
},
    { timestamps: true }
);

module.exports = mongoose.model('ImageMessage', imageMessageSchema);