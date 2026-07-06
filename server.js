require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MIDDLEWARES
// ==========================================
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// ==========================================
// 2. CONEXION A LA BASE DE DATOS
// ==========================================
if (!process.env.MONGO_URI) {
    console.error('ERROR FATAL: La variable de entorno MONGO_URI no esta configurada.');
    process.exit(1); 
}

mongoose.set('strictQuery', false); 
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado exitosamente a MongoDB'))
    .catch(err => {
        console.error('Error critico de conexion a MongoDB:', err);
        process.exit(1); 
    });

// ==========================================
// 3. MODELO DE DATOS
// ==========================================
const eventSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, 'El titulo del evento es obligatorio'],
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
}, { timestamps: true }); 

const Event = mongoose.model('Event', eventSchema);

// ==========================================
// 4. RUTAS DE LA API
// ==========================================

app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.status(200).json(events);
    } catch (error) {
        console.error('Error en GET /api/events:', error);
        res.status(500).json({ error: 'Hubo un problema interno al obtener los eventos.' });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, date } = req.body;
        
        if (!title || !date) {
            return res.status(400).json({ error: 'El titulo y la fecha son campos obligatorios.' });
        }

        const newEvent = new Event(req.body);
        const savedEvent = await newEvent.save();
        
        res.status(201).json(savedEvent); 
    } catch (error) {
        console.error('Error en POST /api/events:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Hubo un problema interno al guardar el evento.' });
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint (ruta) de la API que buscas no existe.' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 5. INICIAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor ejecutandose correctamente en el puerto ${PORT}`);
});