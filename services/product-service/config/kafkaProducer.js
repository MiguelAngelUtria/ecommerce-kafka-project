// services/product-service/config/kafkaProducer.js
const { Kafka, logLevel } = require('kafkajs');

const kafka = new Kafka({
    logLevel: logLevel.INFO,
    brokers: process.env.KAFKA_BROKERS.split(','),
    clientId: process.env.KAFKA_CLIENT_ID,
});

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
        // console.log(`Message sent successfully to topic ${topic}.`);
        return result;
    } catch (error) {
        console.error(`Error sending message to topic ${topic}:`, error);
        throw error;
    }
};

module.exports = {
    connectProducer,
    disconnectProducer,
    sendMessage,
};