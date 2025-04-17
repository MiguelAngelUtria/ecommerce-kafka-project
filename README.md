Integrantes:
-Miguel Angel Utria
-Juan David Bertel
-Jhorman Ruiz
-Jesus Palacios

# Proyecto E-Commerce con Kafka (Backend)

Este proyecto implementa el backend para una plataforma de E-Commerce utilizando una arquitectura de microservicios orientada a eventos. Se basa en Node.js, Kafka para la comunicación entre servicios, y MongoDB tanto para el almacenamiento de datos de la aplicación como para el log de todos los eventos del sistema.

## Arquitectura General

El sistema se compone de los siguientes microservicios:

* **User Service:** Gestiona el registro de usuarios.
* **Welcome Service:** Consume eventos de registro y dispara el flujo de bienvenida.
* **Notification Service:** Recibe solicitudes de notificación (bienvenida, carrito, etc.), simula el envío y produce eventos para servicios de envío reales (ej. email).
* **Product Service:** Gestiona el catálogo de productos (a través de un seeder) y expone una API para listarlos.
* **Cart Service:** Gestiona los carritos de compra de los usuarios (añadir/eliminar items).
* **Order Service:** Procesa la creación de nuevas órdenes.

La comunicación entre estos servicios se realiza principalmente a través de un bus de eventos **Apache Kafka**.

**MongoDB** se utiliza para dos propósitos:
1.  Almacenar datos específicos de cada servicio (productos, carritos, órdenes).
2.  Almacenar un log completo de **todos los eventos** que fluyen por Kafka en una colección centralizada `events`, siguiendo la estructura definida en el documento del proyecto original.

Todo el entorno (Kafka, Zookeeper, MongoDB y los microservicios Node.js) está orquestado usando **Docker Compose**.

## Tecnologías Utilizadas

* Node.js (v18.x - según Dockerfile)
* Express.js (para servicios con API)
* MongoDB (Imagen oficial de Docker)
* Mongoose (ODM para MongoDB)
* Apache Kafka (Imágenes de Confluent Platform para Docker)
* KafkaJS (Cliente Kafka para Node.js)
* Docker & Docker Compose
* Dotenv (Manejo de variables de entorno)
* UUID (Generación de IDs únicos para eventos)
* Cors (Middleware para permitir peticiones a las APIs)
* @faker-js/faker (Dependencia de desarrollo para `product-service/seed.js`)

## Prerrequisitos

* Docker Desktop (o Docker Engine + Docker Compose v2) instalado.
* Node.js y npm (o yarn/pnpm) instalados en tu máquina local (necesario para `npm install` y para ejecutar el seeder manualmente).
* Git (opcional, para clonar el repositorio si lo subes).
* Una herramienta de cliente API como Postman o Insomnia (recomendado para probar).
* Un cliente de MongoDB como MongoDB Compass (opcional, para inspeccionar la base de datos).

## Estructura del Proyecto

ecommerce-kafka-project/
├── docker-compose.yml       # Orquestación de todos los contenedores
├── .dockerignore            # Archivos a ignorar por Docker en la raíz
└── services/                # Carpeta contenedora de los microservicios
├── user-service/        # Servicio de Usuarios
│   ├── config/
│   ├── models/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env             # Variables de entorno (ejemplo)
│   ├── package.json
│   └── server.js        # Punto de entrada (API)
├── welcome-service/     # Servicio de Bienvenida (Consumidor)
│   ├── config/
│   ├── models/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env
│   ├── package.json
│   └── consumer.js      # Punto de entrada (Consumidor Kafka)
├── notification-service/ # Servicio de Notificaciones (Consumidor/Productor)
│   ├── ... (estructura similar a welcome-service) ...
├── product-service/     # Servicio de Productos
│   ├── ... (estructura similar a user-service) ...
│   └── seed.js          # Script para poblar productos (con Faker.js)
├── cart-service/        # Servicio de Carrito
│   ├── ... (estructura similar a user-service) ...
│   └── models/Cart.js   # Modelo específico del carrito
└── order-service/       # Servicio de Órdenes
├── ... (estructura similar a user-service) ...
└── models/Order.js  # Modelo específico de órdenes
└── models/Product.js# Copia del modelo Product para validación

## Instalación y Ejecución

1.  **Clonar Repositorio (Si aplica):**
    ```bash
    git clone <url-del-repositorio>
    cd ecommerce-kafka-project
    ```
    O asegúrate de tener todos los archivos en la estructura descrita.

2.  **Instalar Dependencias de Node.js:** Es **importante** ejecutar `npm install` dentro de *cada* carpeta de servicio para instalar todas las dependencias (incluyendo las de desarrollo como Faker para el seeder):
    ```bash
    cd services/user-service && npm install && cd ../..
    cd services/welcome-service && npm install && cd ../..
    cd services/notification-service && npm install && cd ../..
    cd services/product-service && npm install && cd ../.. # ¡Importante para el seeder!
    cd services/cart-service && npm install && cd ../..
    cd services/order-service && npm install && cd ../..
    ```
    *(Navega a la raíz del proyecto `ecommerce-kafka-project` antes de continuar)*

3.  **Crear Archivos `.env`:** Asegúrate de que cada carpeta de servicio tenga su archivo `.env` basado en los ejemplos proporcionados anteriormente (conteniendo `MONGO_URI`, `KAFKA_BROKERS`, `PORT` si aplica, etc.).

4.  **Poblar Datos de Productos (Seeder - Manualmente Recomendado):** Ejecuta el seeder manualmente *antes* o *después* de levantar los contenedores:
    ```bash
    # Desde la raíz del proyecto:
    cd services/product-service
    node seed.js
    cd ../..
    ```
    *(Nota: Si prefieres ejecutarlo con Docker, necesitarás modificar `product-service/Dockerfile` para que instale todas las dependencias (`RUN npm install`) y usar `docker-compose run --rm product-seeder` después de descomentar el servicio en `docker-compose.yml`).*

5.  **Construir Imágenes Docker:**
    ```bash
    docker-compose build
    ```

6.  **Levantar todos los Servicios:**
    ```bash
    docker-compose up -d
    ```
    * El `-d` ejecuta los contenedores en segundo plano.

7.  **Verificar Servicios:**
    * `docker-compose ps`: Muestra los contenedores en ejecución.
    * `docker-compose logs -f`: Muestra los logs de todos los contenedores en tiempo real (usa `Ctrl+C` para salir).
    * `docker-compose logs -f <nombre_servicio>`: Muestra los logs de un servicio específico (ej. `docker-compose logs -f cart-service`).

8.  **Detener Servicios:**
    ```bash
    docker-compose down
    ```
    * **Para borrar también los datos de MongoDB:** `docker-compose down -v`
    * **Para borrar datos y las imágenes locales:** `docker-compose down -v --rmi local`

## Endpoints Principales de la API

* `user-service` (Puerto 3001):
    * `POST /api/users/register`: Registra un nuevo usuario.
* `product-service` (Puerto 3002):
    * `GET /api/products`: Lista todos los productos disponibles.
* `cart-service` (Puerto 3003):
    * `POST /api/cart/items`: Añade un item (o actualiza cantidad) al carrito de un usuario. (Body: `{ userId, productId, quantity }`)
    * `DELETE /api/cart/items/:productId`: Elimina un item del carrito. (Body: `{ userId }`)
    * `GET /api/cart/:userId`: Obtiene el contenido del carrito de un usuario.
* `order-service` (Puerto 3004):
    * `POST /api/orders`: Crea una nueva orden. (Body: `{ userId, items: [{ productId, quantity, price }] }`)
    * `GET /api/orders/:orderId`: Obtiene los detalles de una orden específica.

## Tópicos Principales de Kafka

* `user-registration`: Evento cuando un usuario se registra. Consumido por `welcome-service`.
* `notification-topic`: Solicitudes genéricas para enviar notificaciones. Producido por `welcome-service`, `cart-service`. Consumido por `notification-service`.
* `product-creation-log`: Log de auditoría cuando se crean/actualizan productos vía Seeder. Producido por `product-seeder`. (Actualmente no tiene consumidor).
* `cart-updates`: Evento cuando se añade/actualiza un item en el carrito. Producido por `cart-service`. (Actualmente no tiene consumidor).
* `cart-removals`: Evento cuando se elimina un item del carrito. Producido por `cart-service`. (Actualmente no tiene consumidor).
* `order-created`: Evento cuando una orden se crea exitosamente. Producido por `order-service`. (Destinado a ser consumido por un futuro `InvoiceService`).
* `email-service`: Evento que indica que una notificación está lista para ser enviada por el proveedor real de email. Producido por `notification-service`. (Actualmente no tiene consumidor).

## Log de Eventos en MongoDB

Todos los eventos importantes que fluyen a través de Kafka también se registran en la colección `events` de la base de datos `ecommerce_events` en MongoDB. Cada documento de evento sigue la estructura:

```json
{
  "eventId": "...",
  "timestamp": "...",
  "source": "NombreDelServicio",
  "topic": "topico_kafka_relacionado",
  "payload": { /* Datos originales o relevantes */ },
  "snapshot": { /* Resultado o estado después del evento */ }
}