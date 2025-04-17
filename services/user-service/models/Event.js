// services/user-service/models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    timestamp: {
        type: Date,
        required: true,
        index: true,
    },
    source: {
        type: String,
        required: true,
        index: true,
    },
    topic: {
        type: String,
        required: true,
        index: true,
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    snapshot: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
    },
}, {
    timestamps: false,
    versionKey: false,
});

module.exports = mongoose.model('Event', EventSchema);