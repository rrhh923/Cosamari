require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
// 1. MIDDLEWARES
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// --- AUTENTICACION SIMPLE POR CONTRASEÑA ---
if (!process.env.ADMIN_PASSWORD) {
    console.warn('ADVERTENCIA: ADMIN_PASSWORD no esta configurada en .env. Nadie podra desbloquear el panel.');
}

// Tokens de sesion validos, en memoria (se invalidan al reiniciar el servidor)
const sesionesValidas = new Set();

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
        const token = crypto.randomBytes(24).toString('hex');
        sesionesValidas.add(token);
        return res.status(200).json({ token });
    }
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
});

function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (token && sesionesValidas.has(token)) return next();
    return res.status(401).json({ error: 'No autorizado. Ingresa la contraseña.' });
}
// 2. CONEXION A LA BASE DE DATOS
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
// 3. MODELOS DE DATOS
// Modelo de Eventos
const eventSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'El titulo del evento es obligatorio'], trim: true },
    date: { type: Date, required: [true, 'La fecha de inicio es obligatoria'] },
    duration: { type: String, default: '' },
    allDay: { type: Boolean, default: false }
}, { timestamps: true }); 

const Event = mongoose.model('Event', eventSchema);

// Modelo de Legajos (fichas de personal)
const legajoSchema = new mongoose.Schema({
    persona: { type: String, required: [true, 'El nombre de la persona es obligatorio'], trim: true },
    dni: { type: String, default: '', trim: true },
    certificado: { type: String, default: '', trim: true },
    carnet: { type: String, default: '', trim: true },
    antecedentes: { type: String, default: '', trim: true }
}, { timestamps: true }); // timestamps guarda automaticamente la fecha de creacion

const Legajo = mongoose.model('Legajo', legajoSchema);
// 4. RUTAS DE LA API
// --- RUTAS DE EVENTOS ---
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema interno al obtener los eventos.' });
    }
});

app.post('/api/events', requireAuth, async (req, res) => {
    try {
        const { title, date } = req.body;
        if (!title || !date) return res.status(400).json({ error: 'El titulo y la fecha son campos obligatorios.' });
        
        const newEvent = new Event(req.body);
        const savedEvent = await newEvent.save();
        res.status(201).json(savedEvent); 
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema interno al guardar el evento.' });
    }
});

app.put('/api/events/:id', requireAuth, async (req, res) => {
    try {
        const updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedEvent) return res.status(404).json({ error: 'El evento no existe.' });
        res.status(200).json(updatedEvent);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el evento.' });
    }
});

app.delete('/api/events/:id', requireAuth, async (req, res) => {
    try {
        const deletedEvent = await Event.findByIdAndDelete(req.params.id);
        if (!deletedEvent) return res.status(404).json({ error: 'El evento no existe.' });
        res.status(200).json({ message: 'Evento eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el evento.' });
    }
});

// --- RUTAS DE LEGAJOS (fichas de personal) ---
app.get('/api/legajos', requireAuth, async (req, res) => {
    try {
        const legajos = await Legajo.find().sort({ createdAt: -1 }); // Los mas nuevos primero
        res.status(200).json(legajos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los legajos.' });
    }
});

app.post('/api/legajos', requireAuth, async (req, res) => {
    try {
        const { persona } = req.body;
        if (!persona) return res.status(400).json({ error: 'El nombre de la persona es obligatorio.' });

        const newLegajo = new Legajo(req.body);
        const savedLegajo = await newLegajo.save();
        res.status(201).json(savedLegajo);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el legajo.' });
    }
});

app.put('/api/legajos/:id', requireAuth, async (req, res) => {
    try {
        const updatedLegajo = await Legajo.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedLegajo) return res.status(404).json({ error: 'El legajo no existe.' });
        res.status(200).json(updatedLegajo);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el legajo.' });
    }
});

app.delete('/api/legajos/:id', requireAuth, async (req, res) => {
    try {
        const deletedLegajo = await Legajo.findByIdAndDelete(req.params.id);
        if (!deletedLegajo) return res.status(404).json({ error: 'El legajo no existe.' });
        res.status(200).json({ message: 'Legajo eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el legajo.' });
    }
});


app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint de la API no existe.' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// 5. INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`Servidor ejecutandose correctamente en el puerto ${PORT}`);
});