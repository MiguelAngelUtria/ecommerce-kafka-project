// services/welcome-service/config/kafkaClient.js
const { Kafka, logLevel } = require('kafkajs');

const kafka = new Kafka({
    logLevel: logLevel.INFO, // Ajustar según necesidad
    brokers: process.env.KAFKA_BROKERS.split(','),
    clientId: process.env.KAFKA_CLIENT_ID,
});

// --- Productor ---
const producer = kafka.producer();
let producerConnected = false;

const connectProducer = async () => {
    try {
        await producer.connect();
        console.log('Kafka Producer connected successfully.');
        producerConnected = true;
        producer.on('producer.disconnect', () => {
            console.error('Kafka Producer disconnected.');
            producerConnected = false;
        });
    } catch (error) {
        console.error('Failed to connect Kafka Producer:', error);
        process.exit(1);
    }
};

const disconnectProducer = async () => {
    try {
        if (producerConnected) {
            await producer.disconnect();
            console.log('Kafka Producer disconnected.');
            producerConnected = false;
        }
    } catch (error) {
        console.error('Failed to disconnect Kafka Producer:', error);
    }
};

const sendMessage = async (topic, message) => {
    if (!producerConnected) {
        throw new Error('Kafka Producer is not connected.');
    }
    try {
        const messageToSend = { value: JSON.stringify(message.payload) };
         if (message.key) {
             messageToSend.key = message.key;
        }
        const result = await producer.send({
            topic: topic,
            messages: [messageToSend],
        });
        // console.log(`Message sent successfully to topic ${topic}.`); // Log opcional
        return result;
    } catch (error) {
        console.error(`Error sending message to topic ${topic}:`, error);
        throw error;
    }
};

// --- Consumidor ---
const consumer = kafka.consumer({ groupId: process.env.KAFKA_CONSUMER_GROUP_ID });
let consumerConnected = false;

const connectConsumer = async () => {
    try {
        await consumer.connect();
        console.log('Kafka Consumer connected successfully.');
        consumerConnected = true;
        consumer.on('consumer.disconnect', () => {
            console.error('Kafka Consumer disconnected.');
            consumerConnected = false;
        });
    } catch (error) {
        console.error('Failed to connect Kafka Consumer:', error);
        process.exit(1);
    }
};

const disconnectConsumer = async () => {
    try {
        if (consumerConnected) {
            // await consumer.stop() // Consider using stop for graceful message processing finish
            await consumer.disconnect();
            console.log('Kafka Consumer disconnected.');
            consumerConnected = false;
        }
    } catch (error) {
        console.error('Failed to disconnect Kafka Consumer:', error);
    }
};

const runConsumer = async (topic, eachMessageHandler) => {
    if (!consumerConnected) {
        throw new Error('Kafka Consumer is not connected.');
    }
    try {
        await consumer.subscribe({ topic: topic, fromBeginning: true });
        console.log(`Consumer subscribed to topic: ${topic}`);

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                // console.log(`Received message offset ${message.offset} from topic ${topic}`); // Log opcional
                try {
                    // El mensaje contiene el EventData completo enviado por user-service
                    const messageValue = JSON.parse(message.value.toString());
                    await eachMessageHandler(messageValue); // Llama a la lógica específica del servicio
                } catch (error) {
                    console.error(`Error processing message offset ${message.offset} from topic ${topic}:`, error);
                    // Aquí decides si reintentar, DLQ, o seguir. Al capturar el error, el offset se marcará como procesado.
                    // throw error; // Descomentar si quieres forzar reintento por Kafka
                }
            },
        });
    } catch (error) {
        console.error(`Error running consumer for topic ${topic}:`, error);
    }
};


module.exports = {
    connectProducer,
    disconnectProducer,
    sendMessage,
    connectConsumer,
    disconnectConsumer,
    runConsumer,
};