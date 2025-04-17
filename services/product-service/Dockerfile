# services/product-service/Dockerfile

# 1. Usar una imagen base oficial de Node.js (Alpine es más ligera)
FROM node:18-alpine

# 2. Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# 3. Copiar package.json y package-lock.json (o yarn.lock)
COPY package*.json ./

# 4. Instalar dependencias de producción
# ¡Ojo! Si quisieras ejecutar el seeder (que usa Faker.js) DESDE DENTRO del contenedor Docker
# necesitarías instalar TODAS las dependencias, no solo las de producción.
# Por ahora, asumimos que el seeder se ejecuta manualmente fuera o que no se incluye Faker.js en producción.
RUN npm install

# 5. Copiar el resto del código de la aplicación
COPY . .

# 6. Exponer el puerto (3002 para este servicio)
EXPOSE 3002

# 7. Comando para ejecutar la API cuando el contenedor inicie
CMD ["node", "server.js"]