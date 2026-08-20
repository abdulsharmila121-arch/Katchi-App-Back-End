const mongoose = require('mongoose');

const mlaSchema = new mongoose.Schema({
    name: String,
    constituency: String,
    // உங்கள் மற்ற Fields-ஐ இங்கு சேர்க்கவும்
}, { timestamps: true });

module.exports = mongoose.model('Mla', mlaSchema);