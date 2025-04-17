// services/cart-service/models/Cart.js
const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
    productId: { type: String, required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, default: Date.now },
}, { _id: false });

const CartSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // userId
    userId: { type: String, required: true, index: true },
    items: [CartItemSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: false,
    versionKey: false,
});

CartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.isNew) { this._id = this.userId; }
  next();
});
 CartSchema.pre('findOneAndUpdate', function(next) {
    // Nota: findOneAndUpdate actualiza directamente en DB, puede que no ejecute save hooks.
    // Para actualizar updatedAt consistentemente aquí, podrías añadirlo en la operación de update.
    // O usar findById y luego save() como hacemos en la lógica del servicio.
    // Por simplicidad, confiaremos en la lógica del servicio para actualizar updatedAt.
    next();
});

module.exports = mongoose.model('Cart', CartSchema);