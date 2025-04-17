// services/product-service/seed.js
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker/locale/es'); // ¡Requiere @faker-js/faker instalado!

// Importar Modelos y Configuraciones
const connectDB = require('./config/db');
const Product = require('./models/Product');
const Event = require('./models/Event');
const { connectProducer, disconnectProducer, sendMessage } = require('./config/kafkaProducer');

const KAFKA_PRODUCT_LOG_TOPIC = process.env.KAFKA_PRODUCT_LOG_TOPIC;
const SOURCE_SEEDER = 'ProductSeederFaker';
const NUM_PRODUCTS_TO_SEED = 25;

const PREDEFINED_CATEGORIES = ['Tecnología', 'Accesorios', 'Ropa', 'Hogar', 'Juguetes', 'Deportes', 'Libros'];

// --- Generar Datos Falsos ---
const generateFakeProducts = (count) => {
    const products = [];
    console.log(`Generating ${count} fake products...`);
    for (let i = 0; i < count; i++) {
        const productData = {
            productId: `prod_${uuidv4()}`,
            name: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            price: parseFloat(faker.commerce.price({ min: 5, max: 3000, dec: 2 })),
            category: faker.helpers.arrayElement(PREDEFINED_CATEGORIES),
        };
        products.push(productData);
    }
    console.log(`${count} fake products generated.`);
    return products;
};


const seedDatabase = async () => {
    console.log(`Starting database seeding with ${NUM_PRODUCTS_TO_SEED} Faker.js products...`);
    const fakeProducts = generateFakeProducts(NUM_PRODUCTS_TO_SEED);

    try {
        await connectDB();
        await connectProducer();

        console.log(`Deleting existing events from source: ${SOURCE_SEEDER}...`);
        await Event.deleteMany({ source: SOURCE_SEEDER });
        // await Product.deleteMany({}); // Descomentar si quieres REEMPLAZAR productos cada vez

        console.log(`Seeding ${fakeProducts.length} products into database...`);
        for (const productData of fakeProducts) {
            const product = await Product.findOneAndUpdate(
                { productId: productData.productId },
                productData,
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            );

            const eventId = `evt_${uuidv4()}`;
            const eventData = {
                eventId: eventId,
                timestamp: new Date(),
                source: SOURCE_SEEDER,
                topic: KAFKA_PRODUCT_LOG_TOPIC,
                payload: productData,
                snapshot: {
                    _id: product._id, productId: product.productId, name: product.name,
                    description: product.description, price: product.price, category: product.category,
                    createdAt: product.createdAt, updatedAt: product.updatedAt
                }
            };

            await sendMessage(KAFKA_PRODUCT_LOG_TOPIC, { key: product.productId, payload: eventData });
            const eventToSave = new Event(eventData);
            await eventToSave.save();
        }

        console.log('Seeding finished successfully.');

    } catch (error) {
        console.error('Error during database seeding:', error);
    } finally {
        await disconnectProducer();
        await mongoose.disconnect();
        console.log('Kafka producer and MongoDB connection closed.');
        // No usamos process.exit(0) aquí para que pueda ser llamado desde otros scripts si es necesario
    }
};

// Ejecutar solo si se llama directamente al script
if (require.main === module) {
    seedDatabase().then(() => {
        console.log("Seeding script finished execution.");
    }).catch(err => {
        console.error("Seeding script failed:", err);
        process.exit(1);
    });
}

// Exportar por si se quiere llamar desde otro lado (menos común para un seeder)
module.exports = seedDatabase;