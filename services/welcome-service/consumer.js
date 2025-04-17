// services/welcome-service/consumer.js
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const connectDB = require('./config/db');
const Event = require('./models/Event');
const {
    connectProducer,
    disconnectProducer,
    sendMessage,
    connectConsumer,
    disconnectConsumer,
    runConsumer,
} = require('./config/kafkaClient');

const KAFKA_TOPIC_CONSUME = process.env.KAFKA_TOPIC_CONSUME;
const KAFKA_TOPIC_PRODUCE = process.env.KAFKA_TOPIC_PRODUCE;
const SOURCE_SERVICE_NAME = 'WelcomeService';

// --- Lógica de Procesamiento para cada Mensaje de Registro ---
const handleRegistrationEvent = async (consumedEventData) => {
    console.log(`${SOURCE_SERVICE_NAME}: Processing eventId: ${consumedEventData.eventId} from topic ${KAFKA_TOPIC_CONSUME}`);

    // El mensaje consumido ('consumedEventData') es el objeto completo que envió user-service
    const originalPayload = consumedEventData.payload;
    const originalSnapshot = consumedEventData.snapshot;
    const consumedEventId = consumedEventData.eventId;

    const userEmail = originalPayload?.email;
    const userName = originalPayload?.name;
    const userId = originalSnapshot?.userId; // Obtenemos el userId del snapshot del evento anterior

    if (!userEmail || !userName || !userId) {
        console.error(`${SOURCE_SERVICE_NAME}: Missing user data in consumed eventId: ${consumedEventId}. Skipping.`);
        return;
    }

    // --- 1. Preparar evento para el Notification Service ---
    const notificationEventId = `evt_${uuidv4()}`;
    const notificationPayload = {
        to: userEmail,
        subject: '¡Bienvenido a nuestra plataforma!',
        content: `Hola ${userName}, gracias por registrarte en nuestro e-commerce. Tu ID de usuario es ${userId}.`,
    };
    const notificationEventData = {
        eventId: notificationEventId,
        timestamp: new Date(),
        source: SOURCE_SERVICE_NAME,
        topic: KAFKA_TOPIC_PRODUCE, // Tópico al que va este evento ('notification-topic')
        payload: notificationPayload,
        snapshot: { // Snapshot de *este* evento (notificación encolada)
            status: 'WELCOME_NOTIFICATION_QUEUED',
            targetUserId: userId,
            originalEventId: consumedEventId, // Enlazar al evento que lo causó
        }
    };

    // --- 2. Preparar evento de LOG de procesamiento de este servicio ---
    const processingLogEventId = `evt_${uuidv4()}`;
    const processingLogEventData = {
        eventId: processingLogEventId,
        timestamp: new Date(),
        source: SOURCE_SERVICE_NAME,
        topic: KAFKA_TOPIC_CONSUME, // Logueamos sobre el tópico que *consumimos*
        payload: consumedEventData, // Guardamos el evento original completo como payload del log
        snapshot: { // Snapshot de *este* evento de log
            status: 'PROCESSED_USER_REGISTRATION',
            downstreamEventId: notificationEventId, // ID del evento que generamos
            processedEventId: consumedEventId,     // ID del evento que procesamos
        }
    };

    try {
        // --- 3. Enviar evento al Notification Service ---
        await sendMessage(KAFKA_TOPIC_PRODUCE, {
             key: userEmail, // Usar email como key (opcional)
             payload: notificationEventData // Enviar el objeto completo del evento de notificación
        });
        console.log(`${SOURCE_SERVICE_NAME}: Event ${notificationEventId} (Notification Request) sent to Kafka topic ${KAFKA_TOPIC_PRODUCE}.`);

        // --- 4. Guardar AMBOS eventos (Notificación y Log) en MongoDB ---
        const eventToSaveNotif = new Event(notificationEventData);
        const eventToSaveLog = new Event(processingLogEventData);

        await Promise.all([
            eventToSaveNotif.save(),
            eventToSaveLog.save()
        ]);

        console.log(`${SOURCE_SERVICE_NAME}: Event ${notificationEventId} (Notification Request) saved to MongoDB.`);
        console.log(`${SOURCE_SERVICE_NAME}: Event ${processingLogEventId} (Processing Log) saved to MongoDB.`);

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error during processing or sending downstream event for original eventId ${consumedEventId}:`, error);
        // Considera re-lanzar el error si quieres que Kafka reintente
        // throw error;
    }
};

// --- Función Principal de Arranque ---
const startService = async () => {
    console.log(`Starting ${SOURCE_SERVICE_NAME}...`);

    // Conectar a dependencias
    await connectDB();
    await connectProducer();
    await connectConsumer();

    // Iniciar el consumidor
    await runConsumer(KAFKA_TOPIC_CONSUME, handleRegistrationEvent);

    console.log(`${SOURCE_SERVICE_NAME} started successfully and listening to ${KAFKA_TOPIC_CONSUME}.`);
};

// --- Manejo de Cierre Limpio ---
const gracefulShutdown = async (signal) => {
    console.log(`${SOURCE_SERVICE_NAME}: Received signal ${signal}. Shutting down gracefully...`);
    // La desconexión del consumidor puede tardar si está procesando un mensaje
    await disconnectConsumer();
    await disconnectProducer();
    await mongoose.disconnect();
    console.log(`${SOURCE_SERVICE_NAME}: Kafka consumer/producer and MongoDB connections closed.`);
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Arrancar el servicio
startService().catch(error => {
    console.error(`Failed to start ${SOURCE_SERVICE_NAME}:`, error);
    process.exit(1);
});