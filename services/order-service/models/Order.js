// services/order-service/models/Order.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const OrderItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, required: true }, // Guardar nombre del producto
    quantity: { type: Number, required: true, min: 1 },
    priceAtOrder: { type: Number, required: true }, // Precio al momento de la orden
}, { _id: false });

const OrderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
        default: () => `ORD-${uuidv4().substring(0, 8).toUpperCase()}`,
        index: true,
    },
    userId: { type: String, required: true, index: true },
    items: [OrderItemSchema],
    totalAmount: { type: Number, required: true },
    status: {
        type: String,
        required: true,
        enum: ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED', 'FAILED'],
        default: 'PENDING_PAYMENT',
        index: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true, // Usar timestamps automáticos de Mongoose
    versionKey: false,
});

module.exports = mongoose.model('Order', OrderSchema);