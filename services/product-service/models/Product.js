// services/product-service/models/Product.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ProductSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        unique: true,
        default: () => `prod_${uuidv4()}`,
        index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: false, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: false,
    versionKey: false,
});

ProductSchema.pre('save', function(next) {
  if (!this.isNew) { this.updatedAt = new Date(); }
  next();
});
 ProductSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

module.exports = mongoose.model('Product', ProductSchema);