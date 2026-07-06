require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Recuerda que tu index.html debe estar dentro de una carpeta llamada "public"
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.MONGO_URI) {
    console.error('ERROR: falta la variable de entorno MONGO_URI (configurala en Render > Environment)');
} else {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('Conectado a MongoDB'))
        .catch(err => console.error('Error de conexión a MongoDB:', err));
}

// --- ESQUEMA DE BASE DE DATOS ---
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    duration: { type: String }, 
    allDay: { type: Boolean, default: false }
});

const Event = mongoose.model('Event', eventSchema);

// --- RUTAS DE LA API ---

// Obtener todos los eventos
app.get('/api/events', async (req, res) => {
    try {
        // Ordenamos los eventos por fecha de forma ascendente
        const events = await Event.find().sort({ date: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los eventos' });
    }
});

// Crear un nuevo evento
app.post('/api/events', async (req, res) => {
    try {
        const newEvent = new Event(req.body);
        await newEvent.save();
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar el evento' });
    }
});

app.listen(PORT, () => {
    console.log(`Server corriendo en el puerto ${PORT}`);
});