// services/user-service/server.js
require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');

// Importaciones de Configuración y Modelos
const connectDB = require('./config/db');
const Event = require('./models/Event');
const { connectProducer, disconnectProducer, sendMessage } = require('./config/kafkaProducer');

// Conectar a la Base de Datos
connectDB();

// Conectar el Productor de Kafka
connectProducer();

const app = express();
const port = process.env.PORT || 3001;
const SOURCE_SERVICE_NAME = 'UserService';

// Middlewares
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
    res.send('User Service is running!');
});

// --- Endpoint de Registro (Implementado) ---
app.post('/api/users/register', async (req, res) => {
    console.log(`${SOURCE_SERVICE_NAME}: Received registration request for email: ${req.body?.email}`);
    const { name, lastName, email, password, phone } = req.body;

    // --- Validación básica ---
    if (!name || !email || !password) {
        console.error(`${SOURCE_SERVICE_NAME}: Registration failed - Missing required fields for email: ${email}`);
        return res.status(400).json({ message: 'Missing required fields: name, email, password' });
    }

    const eventId = `evt_${uuidv4()}`;
    const timestamp = new Date();
    const kafkaTopic = 'user-registration'; // Tópico inicial del flujo

    // Simular generación de ID de usuario
    const userId = `usr_${uuidv4().substring(0, 8)}`;

    // --- Crear el objeto del Evento ---
    const eventData = {
        eventId: eventId,
        timestamp: timestamp,
        source: SOURCE_SERVICE_NAME,
        topic: kafkaTopic, // El tópico al que se ENVIARÁ este evento
        payload: { // Datos de entrada que iniciaron el evento (SIN password)
            name,
            lastName,
            email,
            phone,
        },
        snapshot: { // Resultado o estado después de este evento específico
            userId: userId,
            status: 'REGISTERED_PENDING_WELCOME', // Estado inicial después del registro
        },
    };

    try {
        // --- 1. Enviar evento a Kafka ---
        await sendMessage(kafkaTopic, {
            key: email, // Usar email como clave para particionamiento
            payload: eventData // Enviamos todo el evento
        });
         console.log(`${SOURCE_SERVICE_NAME}: Event ${eventId} sent to Kafka topic ${kafkaTopic}`);

        // --- 2. Guardar el evento en MongoDB ---
        const eventToSave = new Event(eventData);
        await eventToSave.save();
        console.log(`${SOURCE_SERVICE_NAME}: Event ${eventId} saved to MongoDB.`);

        // --- 3. Responder al cliente ---
        res.status(201).json({
            message: 'User registration initiated successfully!',
            userId: userId,
            eventId: eventId
        });

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error processing registration for ${email}. EventId: ${eventId}`, error);
        res.status(500).json({ message: 'Internal Server Error during registration processing.' });
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
        await disconnectProducer(); // Desconectar productor de Kafka
        await mongoose.disconnect(); // Desconectar Mongoose
        console.log(`${SOURCE_SERVICE_NAME}: Kafka and MongoDB connections closed.`);
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));