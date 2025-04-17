// services/notification-service/consumer.js
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
const SOURCE_SERVICE_NAME = 'NotificationService';

// --- Lógica de Procesamiento para cada Mensaje de Solicitud de Notificación ---
const handleNotificationRequestEvent = async (consumedEventData) => {
    console.log(`${SOURCE_SERVICE_NAME}: Processing notification request eventId: ${consumedEventData.eventId} from topic ${KAFKA_TOPIC_CONSUME}`);

    // El 'payload' del evento consumido DEBERÍA tener la estructura { to, subject, content }
    // según lo definido en los servicios que producen a 'notification-topic'.
    const notificationDetails = consumedEventData.payload;
    const consumedEventId = consumedEventData.eventId;
    const originalSource = consumedEventData.source; // De qué servicio vino la solicitud

    const { to, subject, content } = notificationDetails;

    if (!to || !subject || !content) {
        console.error(`${SOURCE_SERVICE_NAME}: Missing notification details (to, subject, content) in eventId: ${consumedEventId}. Skipping.`);
        return;
    }

    // --- 1. Simular el envío de la notificación ---
    console.log('--------------------------------------------------');
    console.log(`SIMULATING SENDING NOTIFICATION`);
    console.log(`   Service Origin: ${originalSource}`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    // console.log(`   Content: ${content}`); // Descomentar si quieres ver el contenido completo
    console.log('--------------------------------------------------');
    // Aquí iría la lógica real de envío (email, SMS, push)
    const simulatedSendSuccess = true;

    if (!simulatedSendSuccess) {
        console.error(`${SOURCE_SERVICE_NAME}: Failed to simulate sending notification for event ${consumedEventId}`);
        // Guardar evento de error si es necesario
        return;
    }

    // --- 2. Preparar evento para el Email Service (o similar) ---
    // Este evento confirma que intentamos enviar (o enviamos) la notificación
    const emailServiceEventId = `evt_${uuidv4()}`;
    const emailServiceEventData = {
        eventId: emailServiceEventId,
        timestamp: new Date(),
        source: SOURCE_SERVICE_NAME,
        topic: KAFKA_TOPIC_PRODUCE, // Tópico destino ('email-service')
        payload: { // Los detalles que necesitaría el servicio de envío real
            to,
            subject,
            content,
            // Podríamos añadir tipo: 'email' o 'sms'
        },
        snapshot: {
            status: 'NOTIFICATION_SENT_TO_PROVIDER', // O NOTIFICATION_SENT_SUCCESSFULLY
            notificationType: subject.includes('Bienvenido') ? 'WELCOME' : (subject.includes('Factura') ? 'INVOICE' : 'GENERIC'),
            originalEventId: consumedEventId, // ID del evento que procesamos
        }
    };

    // --- 3. Preparar evento de LOG de procesamiento de este servicio ---
    const processingLogEventId = `evt_${uuidv4()}`;
    const processingLogEventData = {
        eventId: processingLogEventId,
        timestamp: new Date(),
        source: SOURCE_SERVICE_NAME,
        topic: KAFKA_TOPIC_CONSUME, // Tópico que consumimos ('notification-topic')
        payload: consumedEventData, // Guardamos el evento original completo
        snapshot: {
            status: 'PROCESSED_NOTIFICATION_REQUEST_AND_SENT',
            downstreamEventId: emailServiceEventId, // ID del evento que generamos para email-service
            processedEventId: consumedEventId,
        }
    };

    try {
        // --- 4. Enviar evento al Email Service ---
        // El servicio 'email-service' (que no hemos creado) escucharía este tópico
        await sendMessage(KAFKA_TOPIC_PRODUCE, {
            key: to, // Usar email como key (opcional)
            payload: emailServiceEventData // Enviar el objeto completo
        });
        console.log(`${SOURCE_SERVICE_NAME}: Event ${emailServiceEventId} (Email Service Handover) sent to Kafka topic ${KAFKA_TOPIC_PRODUCE}.`);


        // --- 5. Guardar AMBOS eventos (Email Service y Log) en MongoDB ---
        const eventToSaveEmail = new Event(emailServiceEventData);
        const eventToSaveLog = new Event(processingLogEventData);

        await Promise.all([
            eventToSaveEmail.save(),
            eventToSaveLog.save()
        ]);

        console.log(`${SOURCE_SERVICE_NAME}: Event ${emailServiceEventId} (Email Service Handover) saved to MongoDB.`);
        console.log(`${SOURCE_SERVICE_NAME}: Event ${processingLogEventId} (Processing Log) saved to MongoDB.`);

    } catch (error) {
        console.error(`${SOURCE_SERVICE_NAME}: Error during sending downstream event or saving logs for original eventId ${consumedEventId}:`, error);
        // throw error; // Considera re-lanzar si quieres reintentos
    }
};

// --- Función Principal de Arranque ---
const startService = async () => {
    console.log(`Starting ${SOURCE_SERVICE_NAME}...`);
    await connectDB();
    await connectProducer();
    await connectConsumer();
    await runConsumer(KAFKA_TOPIC_CONSUME, handleNotificationRequestEvent);
    console.log(`${SOURCE_SERVICE_NAME} started successfully and listening to ${KAFKA_TOPIC_CONSUME}.`);
};

// --- Manejo de Cierre Limpio ---
const gracefulShutdown = async (signal) => {
    console.log(`${SOURCE_SERVICE_NAME}: Received signal ${signal}. Shutting down gracefully...`);
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