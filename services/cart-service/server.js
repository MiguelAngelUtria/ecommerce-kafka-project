// services/cart-service/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Importaciones
const connectDB = require('./config/db');
const Cart = require('./models/Cart');
const Event = require('./models/Event');
const { connectProducer, disconnectProducer, sendMessage } = require('./config/kafkaProducer');

// Conectar a DB y Kafka Producer
connectDB();
connectProducer();

const app = express();
const port = process.env.PORT || 3003;
const SOURCE_SERVICE_NAME = 'CartService';

// Middlewares
app.use(express.json());

// --- Rutas ---
app.get('/', (req, res) => {
    res.send('Cart Service is running!');
});

// --- Endpoint: Añadir Item al Carrito ---
app.post('/api/cart/items', async (req, res) => {
    const { userId, productId, quantity } = req.body;
    const currentTimestamp = new Date();
    console.log(`${SOURCE_SERVICE_NAME}: Request Add item for user ${userId}`, { productId, quantity });

    if (!userId || !productId || !quantity || parseInt(quantity) < 1) {
        return res.status(400).json({ message: 'Missing or invalid required fields: userId, productId, quantity (>=1).' });
    }

    const parsedQuantity = parseInt(quantity);
    const itemToAdd = { productId, quantity: parsedQuantity, addedAt: currentTimestamp };
    let updatedCart;
    const eventId = `evt_${uuidv4()}`;

    try {
        let cart = await Cart.findById(userId);

        if (cart) {
            // Carrito existe
            cart.updatedAt = currentTimestamp; // Actualizar manualmente
            const itemIndex = cart.items.findIndex(item => item.productId === productId);
            if (itemIndex > -1) { // Item ya existe, actualizar cantidad
                cart.items[itemIndex].quantity += parsedQuantity;
                cart.items[itemIndex].addedAt = currentTimestamp; // Actualizar fecha?
            } else { // Item nuevo, añadirlo
                cart.items.push(itemToAdd);
            }
            updatedCart = await cart.save();
        } else {
            // Carrito no existe, crearlo
            updatedCart = await Cart.create({
                _id: userId, userId: userId, items: [itemToAdd],
                createdAt: currentTimestamp, updatedAt: currentTimestamp // Establecer timestamps
            });
        }

        const totalItems = updatedCart.items.reduce((sum, item) => sum + item.quantity, 0);

        // Preparar evento CartUpdated
        const eventToLog = {
            eventId: eventId, timestamp: currentTimestamp, source: SOURCE_SERVICE_NAME,
            topic: process.env.KAFKA_CART_UPDATES_TOPIC,
            payload: { userId, productId, quantity: parsedQuantity },
            snapshot: {
                cartId: updatedCart._id, userId: updatedCart.userId,
                totalItems: totalItems, updatedAt: updatedCart.updatedAt,
            }
        };

        await sendMessage(process.env.KAFKA_CART_UPDATES_TOPIC, { key: userId, payload: eventToLog });
        const eventDoc = new Event(eventToLog);
        await eventDoc.save();
        console.log(`${SOURCE_SERVICE_NAME}: Event ${eventId} (CartUpdated) sent and saved for user ${userId}.`);

        res.status(200).json(updatedCart);

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error adding item for user ${userId}:`, error);
        res.status(500).json({ message: 'Internal Server Error adding item.' });
    }
});

// --- Endpoint: Eliminar Item del Carrito ---
app.delete('/api/cart/items/:productId', async (req, res) => {
    const { productId } = req.params;
    const { userId } = req.body; // UserId viene en el body según PDF
    const currentTimestamp = new Date();
    console.log(`${SOURCE_SERVICE_NAME}: Request Remove item ${productId} for user ${userId}`);

    if (!userId) {
        return res.status(400).json({ message: 'Missing required field in body: userId.' });
    }

    try {
        const cart = await Cart.findById(userId);
        if (!cart) {
            return res.status(404).json({ message: `Cart not found for user ${userId}` });
        }

        const itemIndex = cart.items.findIndex(item => item.productId === productId);
        if (itemIndex === -1) {
            return res.status(404).json({ message: `Product ${productId} not found in cart for user ${userId}` });
        }

        const removedItem = cart.items[itemIndex];
        const quantityRemoved = removedItem.quantity;

        cart.items.splice(itemIndex, 1); // Eliminar item
        cart.updatedAt = currentTimestamp; // Actualizar manualmente
        await cart.save();
        console.log(`${SOURCE_SERVICE_NAME}: Item ${productId} removed from cart for user ${userId}.`);

        // Evento 1: CartRemoval (Log)
        const removalEventId = `evt_${uuidv4()}`;
        const removalEventData = {
            eventId: removalEventId, timestamp: currentTimestamp, source: SOURCE_SERVICE_NAME,
            topic: process.env.KAFKA_CART_REMOVALS_TOPIC,
            payload: { userId, productId },
            snapshot: { userId, productId, quantityRemoved, removedAt: currentTimestamp }
        };
        await sendMessage(process.env.KAFKA_CART_REMOVALS_TOPIC, { key: userId, payload: removalEventData });
        const removalEventDoc = new Event(removalEventData);
        await removalEventDoc.save();
        console.log(`${SOURCE_SERVICE_NAME}: Event ${removalEventId} (CartRemoval) sent and saved.`);

        // Evento 2: Notification Request
        const notificationEventId = `evt_${uuidv4()}`;
        const notificationEventData = {
             eventId: notificationEventId, timestamp: currentTimestamp, source: SOURCE_SERVICE_NAME,
             topic: process.env.KAFKA_NOTIFICATION_TOPIC,
             payload: {
                 // Qué necesita saber NotificationService para el email de "Olvidaste algo?"
                 to: `user-${userId}@example.com`, // Placeholder - necesitaríamos el email real del usuario
                 subject: `¿Olvidaste algo en tu carrito?`,
                 content: `Hola ${userId}, vimos que eliminaste el producto con ID '${productId}' de tu carrito...`,
                 // Podríamos añadir más detalles si los tuviéramos
                 userId: userId,
                 productId: productId,
                 quantity: quantityRemoved,
                 reason: "ITEM_REMOVED_FROM_CART",
             },
             snapshot: { status: 'REMOVAL_NOTIFICATION_QUEUED', targetUserId: userId, originalEventId: removalEventId }
         };
        await sendMessage(process.env.KAFKA_NOTIFICATION_TOPIC, { key: userId, payload: notificationEventData });
        const notificationEventDoc = new Event(notificationEventData);
        await notificationEventDoc.save();
        console.log(`${SOURCE_SERVICE_NAME}: Event ${notificationEventId} (Removal Notification Request) sent and saved.`);

        res.status(204).send(); // Éxito sin contenido

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error removing item ${productId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Internal Server Error removing item.' });
    }
});

// --- Endpoint GET /api/cart/:userId (Opcional: para ver el carrito) ---
app.get('/api/cart/:userId', async (req, res) => {
    const { userId } = req.params;
    console.log(`${SOURCE_SERVICE_NAME}: Request Get cart for user ${userId}`);
    try {
        const cart = await Cart.findById(userId).select('-__v');
        if (!cart) {
            return res.status(200).json({ _id: userId, userId: userId, items: [], createdAt: null, updatedAt: null });
        }
        res.status(200).json(cart);
    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error fetching cart for user ${userId}:`, error);
        res.status(500).json({ message: 'Internal Server Error fetching cart.' });
    }
});

// Iniciar Servidor
const server = app.listen(port, () => {
    console.log(`${SOURCE_SERVICE_NAME} listening at http://localhost:${port}`);
});

// Manejo de cierre adecuado
const gracefulShutdown = async (signal) => {
    console.log(`${SOURCE_SERVICE_NAME}: Received signal ${signal}. Shutting down gracefully...`);
    server.close(async () => {
        console.log(`${SOURCE_SERVICE_NAME}: HTTP server closed.`);
        await disconnectProducer();
        await mongoose.disconnect();
        console.log(`${SOURCE_SERVICE_NAME}: Kafka producer and MongoDB connection closed.`);
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));