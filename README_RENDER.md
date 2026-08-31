# Desplegar en Render

## Qué se arregló (para que funcione en Render)

1. **La página no cargaba (error principal).** El servidor servía los archivos y el
   `index.html` desde la raíz del proyecto (`__dirname`), pero el archivo está en
   `public/index.html`. Ahora sirve correctamente desde `public/`.
2. **Fuga de seguridad grave.** Al servir la raíz, cualquiera podía abrir
   `https://tu-app/.env` y ver tu usuario/contraseña de MongoDB y la contraseña de
   admin. Ahora sólo se sirve la carpeta `public/`, así que `.env`, `server.js`,
   `package.json`, etc. ya **no** quedan expuestos.
3. **Reinicio en bucle en Render.** Si MongoDB no conectaba, el código hacía
   `process.exit(1)` y Render reiniciaba el servicio una y otra vez. Ahora la
   conexión reintenta con backoff y el servidor web sigue vivo (Render detecta el
   puerto abierto y podés ver los logs).
4. **Puerto y host.** Se escucha en `0.0.0.0` y en `process.env.PORT` (lo exige Render).
5. **Health check.** Se agregó `GET /healthz` para el chequeo de salud de Render.

El frontend no se tocó: ya usaba rutas relativas `/api/...`, así que funciona como
un único servicio en Render.

## Pasos para desplegar

1. **Subí el proyecto a GitHub** (sin `node_modules` ni `.env`; el `.gitignore` ya
   los excluye). Render instala las dependencias solo.

2. En **MongoDB Atlas → Network Access**, agregá la IP `0.0.0.0/0` (permitir desde
   cualquier lugar). Si no, Render no podrá conectarse a la base.

3. En **Render**:
   - Opción A (recomendada): con el archivo `render.yaml` incluido, entrá a
     **New → Blueprint**, elegí tu repo y Render lee la configuración sola.
   - Opción B (manual): **New → Web Service**, elegí el repo y configurá:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Health Check Path:** `/healthz`

4. En **Environment** del servicio, definí las variables:
   - `MONGO_URI` → tu cadena de conexión de Atlas (idealmente el formato
     `mongodb+srv://...`).
   - `ADMIN_PASSWORD` → la contraseña para desbloquear el panel.

   No definas `PORT`: lo pone Render automáticamente.

5. Deploy. Cuando termine, abrí la URL pública. Deberías ver la app; en los logs
   debería aparecer `Conectado exitosamente a MongoDB`.

## Probar localmente

```bash
npm install
cp .env.example .env      # y completá MONGO_URI y ADMIN_PASSWORD
npm start
# abrir http://localhost:3000
```
