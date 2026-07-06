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
// 3. MODELOS DE DATOS
// ==========================================

// Modelo de Eventos
const eventSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'El titulo del evento es obligatorio'], trim: true },
    date: { type: Date, required: [true, 'La fecha de inicio es obligatoria'] },
    duration: { type: String, default: '' },
    allDay: { type: Boolean, default: false }
}, { timestamps: true }); 

const Event = mongoose.model('Event', eventSchema);

// Modelo de Empleados
const employeeSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre del empleado es obligatorio'], trim: true }
}, { timestamps: true }); // timestamps guarda automaticamente la fecha de creacion

const Employee = mongoose.model('Employee', employeeSchema);

// ==========================================
// 4. RUTAS DE LA API
// ==========================================

// --- RUTAS DE EVENTOS ---
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema interno al obtener los eventos.' });
    }
});

app.post('/api/events', async (req, res) => {
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

app.put('/api/events/:id', async (req, res) => {
    try {
        const updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedEvent) return res.status(404).json({ error: 'El evento no existe.' });
        res.status(200).json(updatedEvent);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el evento.' });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        const deletedEvent = await Event.findByIdAndDelete(req.params.id);
        if (!deletedEvent) return res.status(404).json({ error: 'El evento no existe.' });
        res.status(200).json({ message: 'Evento eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el evento.' });
    }
});

// --- RUTAS DE EMPLEADOS ---
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await Employee.find().sort({ createdAt: -1 }); // Los mas nuevos primero
        res.status(200).json(employees);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los empleados.' });
    }
});

app.post('/api/employees', async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

        const newEmployee = new Employee({ nombre });
        const savedEmployee = await newEmployee.save();
        res.status(201).json(savedEmployee);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el empleado.' });
    }
});


app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint de la API no existe.' });
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