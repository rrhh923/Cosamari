require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Evento = require('./models/Evento');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.MONGO_URI) {
    console.error('ERROR: falta la variable de entorno MONGO_URI (configurala en Render > Environment)');
} else {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('conectado a MongoDB'))
        .catch(err => console.error('error de conexión a MongoDB:', err));
}

app.get('/api/saludo', (req, res) => {
    res.json({ mensaje: "hola" });
});

// Obtener todos los eventos
app.get('/api/eventos', async (req, res) => {
    try {
        const eventos = await Evento.find().sort({ fecha: 1, horaInicio: 1 });
        res.json(eventos);
    } catch (err) {
        console.error('error al obtener eventos:', err);
        res.status(500).json({ error: 'No se pudieron obtener los eventos' });
    }
});

// Crear un nuevo evento
app.post('/api/eventos', async (req, res) => {
    try {
        const { nombre, fecha, todoElDia, horaInicio, duracionMinutos } = req.body;

        if (!nombre || !fecha) {
            return res.status(400).json({ error: 'Falta nombre o fecha del evento' });
        }

        const nuevoEvento = new Evento({
            nombre,
            fecha,
            todoElDia: !!todoElDia,
            horaInicio: todoElDia ? '' : (horaInicio || ''),
            duracionMinutos: todoElDia ? 0 : (duracionMinutos || 0)
        });

        await nuevoEvento.save();
        res.status(201).json(nuevoEvento);
    } catch (err) {
        console.error('error al crear evento:', err);
        res.status(500).json({ error: 'No se pudo crear el evento' });
    }
});

// Eliminar un evento
app.delete('/api/eventos/:id', async (req, res) => {
    try {
        await Evento.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('error al eliminar evento:', err);
        res.status(500).json({ error: 'No se pudo eliminar el evento' });
    }
});

app.listen(PORT, () => {
    console.log(`server anda ${PORT}`);
});