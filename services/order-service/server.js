// services/order-service/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Importaciones
const connectDB = require('./config/db');
const Order = require('./models/Order');
const Product = require('./models/Product'); // Para validar productos
const Event = require('./models/Event');
const { connectProducer, disconnectProducer, sendMessage } = require('./config/kafkaProducer');

// Conectar a DB y Kafka Producer
connectDB();
connectProducer();

const app = express();
const port = process.env.PORT || 3004;
const SOURCE_SERVICE_NAME = 'OrderService';

// Middlewares
app.use(express.json());

// --- Rutas ---
app.get('/', (req, res) => {
    res.send('Order Service is running!');
});

// --- Endpoint: Crear Orden ---
app.post('/api/orders', async (req, res) => {
    const { userId, items } = req.body;
    const currentTimestamp = new Date();
    console.log(`${SOURCE_SERVICE_NAME}: Request Create order for user ${userId}`, { itemCount: items?.length });

    // Validación básica de entrada
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Missing or invalid fields: userId, items (must be a non-empty array).' });
    }
    const validationErrors = [];
    for (const item of items) {
        if (!item.productId || !item.quantity || parseInt(item.quantity) < 1 || item.price === undefined || parseFloat(item.price) < 0) {
             validationErrors.push(`Invalid item data: ${JSON.stringify(item)}. Each item needs productId, quantity (>=1), and price (>=0).`);
        }
    }
     if (validationErrors.length > 0) {
        return res.status(400).json({ message: 'Invalid items data.', errors: validationErrors });
    }


    const orderItems = [];
    let calculatedTotalAmount = 0;
    const productFetchErrors = [];

    try {
        // Validar productos y obtener nombres/precios actuales (si quisiéramos usarlos)
        console.log(`${SOURCE_SERVICE_NAME}: Validating products...`);
        const productIds = items.map(item => item.productId);
        const productsFromDB = await Product.find({ productId: { $in: productIds } });
        const productMap = new Map(productsFromDB.map(p => [p.productId, p]));

        for (const requestedItem of items) {
             const product = productMap.get(requestedItem.productId);
             const reqQuantity = parseInt(requestedItem.quantity);
             const reqPrice = parseFloat(requestedItem.price); // Usaremos el precio del request

             if (!product) {
                 productFetchErrors.push(`Product with ID ${requestedItem.productId} not found.`);
                 continue;
             }

             // Aquí podrías añadir lógica de stock si el modelo Product lo tuviera
             // if (product.stock < reqQuantity) { productFetchErrors.push(...); }

             orderItems.push({
                 productId: product.productId,
                 name: product.name,
                 quantity: reqQuantity,
                 priceAtOrder: reqPrice, // Guardamos el precio que vino en el request
             });

             calculatedTotalAmount += reqQuantity * reqPrice;
         }

        if (productFetchErrors.length > 0) {
            console.error(`${SOURCE_SERVICE_NAME}: Order rejected for user ${userId} due to product errors:`, productFetchErrors);
            return res.status(400).json({ message: 'One or more products invalid or not found.', errors: productFetchErrors });
        }

        calculatedTotalAmount = Math.round(calculatedTotalAmount * 100) / 100;

        // Crear y guardar la orden
        const newOrder = new Order({
            userId: userId,
            items: orderItems,
            totalAmount: calculatedTotalAmount,
            status: 'PENDING_PAYMENT',
            // orderId se genera por defecto
        });

        const savedOrder = await newOrder.save();
        console.log(`${SOURCE_SERVICE_NAME}: Order ${savedOrder.orderId} created for user ${userId}.`);

        // Preparar y enviar evento OrderCreated
        const eventId = `evt_${uuidv4()}`;
        const eventData = {
            eventId: eventId, timestamp: currentTimestamp, source: SOURCE_SERVICE_NAME,
            topic: process.env.KAFKA_ORDER_CREATED_TOPIC,
            payload: {
                orderId: savedOrder.orderId, userId: savedOrder.userId,
                items: savedOrder.items.map(item => ({ // Payload limpio para downstream
                    productId: item.productId, name: item.name,
                    quantity: item.quantity, priceAtOrder: item.priceAtOrder
                })),
                totalAmount: savedOrder.totalAmount, orderStatus: savedOrder.status,
                orderCreatedAt: savedOrder.createdAt
            },
            snapshot: {
                orderId: savedOrder.orderId, status: savedOrder.status,
                totalAmount: savedOrder.totalAmount, itemCount: savedOrder.items.length,
            }
        };

        await sendMessage(process.env.KAFKA_ORDER_CREATED_TOPIC, { key: savedOrder.userId, payload: eventData });
        const eventDoc = new Event(eventData);
        await eventDoc.save();
        console.log(`${SOURCE_SERVICE_NAME}: Event ${eventId} (OrderCreated) sent and saved for order ${savedOrder.orderId}.`);

        // Responder al cliente
        res.status(201).json(savedOrder);

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error creating order for user ${userId}:`, error);
        if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Order validation failed.', errors: error.errors });
        }
        res.status(500).json({ message: 'Internal Server Error creating order.' });
    }
});

// --- Endpoint GET /api/orders/:orderId (Opcional) ---
app.get('/api/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;
     console.log(`${SOURCE_SERVICE_NAME}: Request Get order ${orderId}`);
    try {
        const order = await Order.findOne({ orderId: orderId });
        if (!order) {
            return res.status(404).json({ message: `Order ${orderId} not found.` });
        }
        res.status(200).json(order);
    } catch (error) {
         console.error(`${SOURCE_SERVICE_NAME}: Error fetching order ${orderId}:`, error);
         res.status(500).json({ message: 'Internal Server Error fetching order.' });
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