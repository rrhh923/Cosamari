require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MIDDLEWARES (Configuraciones base)
// ==========================================
app.use(cors()); // Evita bloqueos de origen cruzado (Cross-Origin Resource Sharing)
app.use(express.json()); // Permite al servidor leer JSON en los requests
app.use(express.static(path.join(__dirname, 'public'))); // Sirve los archivos de la carpeta 'public'

// ==========================================
// 2. CONEXIÓN A LA BASE DE DATOS
// ==========================================
if (!process.env.MONGO_URI) {
    console.error('❌ ERROR FATAL: La variable de entorno MONGO_URI no está configurada.');
    process.exit(1); // Detiene el servidor porque sin base de datos no puede funcionar
}

mongoose.set('strictQuery', false); // Evita advertencias en consolas modernas de Mongoose
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado exitosamente a MongoDB'))
    .catch(err => {
        console.error('❌ Error crítico de conexión a MongoDB:', err);
        process.exit(1); // Detiene el servidor si falla la conexión
    });

// ==========================================
// 3. MODELO DE DATOS (Esquema)
// ==========================================
const eventSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, 'El título del evento es obligatorio'],
        trim: true 
    },
    date: { 
        type: Date, 
        required: [true, 'La fecha de inicio es obligatoria'] 
    },
    duration: { 
        type: String, 
        default: '' 
    },
    allDay: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true }); // timestamps crea automáticamente las fechas de 'createdAt' y 'updatedAt'

const Event = mongoose.model('Event', eventSchema);

// ==========================================
// 4. RUTAS DE LA API (Endpoints)
// ==========================================

// GET: Obtener todos los eventos ordenados por fecha
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.status(200).json(events);
    } catch (error) {
        console.error('Error en GET /api/events:', error);
        res.status(500).json({ error: 'Hubo un problema interno al obtener los eventos.' });
    }
});

// POST: Crear un nuevo evento con validaciones
app.post('/api/events', async (req, res) => {
    try {
        const { title, date } = req.body;
        
        // Validación extra de seguridad desde el backend
        if (!title || !date) {
            return res.status(400).json({ error: 'El título y la fecha son campos obligatorios.' });
        }

        const newEvent = new Event(req.body);
        const savedEvent = await newEvent.save();
        
        res.status(201).json(savedEvent); // 201 significa "Creado exitosamente"
    } catch (error) {
        console.error('Error en POST /api/events:', error);
        
        // Si el error es de validación de Mongoose, mandar un 400 (Bad Request)
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Hubo un problema interno al guardar el evento.' });
    }
});

// Ruta 404 para cualquier otra petición a /api/ que no exista
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint (ruta) de la API que buscas no existe.' });
});

// Fallback: Si alguien recarga una página que no es /api, enviar siempre el index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 5. INICIAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose correctamente en el puerto ${PORT}`);
});