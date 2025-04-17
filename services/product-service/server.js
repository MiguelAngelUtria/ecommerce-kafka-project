// services/product-service/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

// Importaciones
const connectDB = require('./config/db');
const Product = require('./models/Product'); // Modelo de Producto

// Conectar a DB
connectDB();

const app = express();
const port = process.env.PORT || 3002;
const SOURCE_SERVICE_NAME = 'ProductService';

// Middlewares
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
    res.send('Product Service is running!');
});

// --- Endpoint GET /api/products ---
app.get('/api/products', async (req, res) => {
    console.log(`${SOURCE_SERVICE_NAME}: Request received for GET /api/products`);
    try {
        // Buscar todos los productos, seleccionar campos específicos
        const products = await Product.find({})
           .select('productId name description price category createdAt updatedAt -_id'); // Excluir _id

        res.status(200).json(products);

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error fetching products:`, error);
        res.status(500).json({ message: 'Internal Server Error fetching products.' });
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
        await mongoose.disconnect();
        console.log(`${SOURCE_SERVICE_NAME}: MongoDB connection closed.`);
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));