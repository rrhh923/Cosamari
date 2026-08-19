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

// Modelo de EPP (Elementos de Proteccion Personal)
// La imagen se agregara mas adelante; por ahora solo nombre y fecha.
const eppSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre es obligatorio'], trim: true },
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] }
}, { timestamps: true });

const Epp = mongoose.model('Epp', eppSchema);

// Modelo de Vehiculos
const vehiculoSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre del vehiculo es obligatorio'], trim: true },
    patente: { type: String, default: '', trim: true }
}, { timestamps: true });

const Vehiculo = mongoose.model('Vehiculo', vehiculoSchema);

// Modelo de Registros de Vehiculo: uso (calendario) y mantenimiento
const vehiculoRegistroSchema = new mongoose.Schema({
    vehiculo: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', required: true },
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] },
    tipo: { type: String, enum: ['uso', 'mantenimiento'], required: true },
    // Para "uso" guarda quien lo usa; para "mantenimiento" guarda la descripcion.
    detalle: { type: String, default: '', trim: true }
}, { timestamps: true });

const VehiculoRegistro = mongoose.model('VehiculoRegistro', vehiculoRegistroSchema);
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

// --- RUTAS DE EPP ---
app.get('/api/epp', requireAuth, async (req, res) => {
    try {
        const items = await Epp.find().sort({ fecha: -1 });
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los EPP.' });
    }
});

app.post('/api/epp', requireAuth, async (req, res) => {
    try {
        const { nombre, fecha } = req.body;
        if (!nombre || !fecha) return res.status(400).json({ error: 'El nombre y la fecha son obligatorios.' });

        const newItem = new Epp(req.body);
        const savedItem = await newItem.save();
        res.status(201).json(savedItem);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el EPP.' });
    }
});

app.put('/api/epp/:id', requireAuth, async (req, res) => {
    try {
        const updatedItem = await Epp.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedItem) return res.status(404).json({ error: 'El EPP no existe.' });
        res.status(200).json(updatedItem);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el EPP.' });
    }
});

app.delete('/api/epp/:id', requireAuth, async (req, res) => {
    try {
        const deletedItem = await Epp.findByIdAndDelete(req.params.id);
        if (!deletedItem) return res.status(404).json({ error: 'El EPP no existe.' });
        res.status(200).json({ message: 'EPP eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el EPP.' });
    }
});

// --- RUTAS DE VEHICULOS ---
app.get('/api/vehiculos', requireAuth, async (req, res) => {
    try {
        const vehiculos = await Vehiculo.find().sort({ nombre: 1 });
        res.status(200).json(vehiculos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los vehiculos.' });
    }
});

app.post('/api/vehiculos', requireAuth, async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre del vehiculo es obligatorio.' });

        const newVehiculo = new Vehiculo(req.body);
        const savedVehiculo = await newVehiculo.save();
        res.status(201).json(savedVehiculo);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el vehiculo.' });
    }
});

app.put('/api/vehiculos/:id', requireAuth, async (req, res) => {
    try {
        const updatedVehiculo = await Vehiculo.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedVehiculo) return res.status(404).json({ error: 'El vehiculo no existe.' });
        res.status(200).json(updatedVehiculo);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el vehiculo.' });
    }
});

app.delete('/api/vehiculos/:id', requireAuth, async (req, res) => {
    try {
        const deletedVehiculo = await Vehiculo.findByIdAndDelete(req.params.id);
        if (!deletedVehiculo) return res.status(404).json({ error: 'El vehiculo no existe.' });
        // Borra tambien todos sus registros de uso/mantenimiento asociados
        await VehiculoRegistro.deleteMany({ vehiculo: req.params.id });
        res.status(200).json({ message: 'Vehiculo eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el vehiculo.' });
    }
});

// --- RUTAS DE REGISTROS DE VEHICULO (uso y mantenimiento) ---
// Soporta filtros opcionales por query string: ?vehiculo=ID  y/o  ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  y/o  ?tipo=uso|mantenimiento
app.get('/api/vehiculo-registros', requireAuth, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.vehiculo) filtro.vehiculo = req.query.vehiculo;
        if (req.query.tipo) filtro.tipo = req.query.tipo;
        if (req.query.desde || req.query.hasta) {
            filtro.fecha = {};
            if (req.query.desde) filtro.fecha.$gte = new Date(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = new Date(req.query.hasta);
        }
        const registros = await VehiculoRegistro.find(filtro).populate('vehiculo', 'nombre patente').sort({ fecha: 1 });
        res.status(200).json(registros);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los registros.' });
    }
});

app.post('/api/vehiculo-registros', requireAuth, async (req, res) => {
    try {
        const { vehiculo, fecha, tipo } = req.body;
        if (!vehiculo || !fecha || !tipo) return res.status(400).json({ error: 'Vehiculo, fecha y tipo son obligatorios.' });

        const nuevo = new VehiculoRegistro(req.body);
        const guardado = await nuevo.save();
        const populado = await guardado.populate('vehiculo', 'nombre patente');
        res.status(201).json(populado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el registro.' });
    }
});

app.put('/api/vehiculo-registros/:id', requireAuth, async (req, res) => {
    try {
        const actualizado = await VehiculoRegistro.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('vehiculo', 'nombre patente');
        if (!actualizado) return res.status(404).json({ error: 'El registro no existe.' });
        res.status(200).json(actualizado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el registro.' });
    }
});

app.delete('/api/vehiculo-registros/:id', requireAuth, async (req, res) => {
    try {
        const eliminado = await VehiculoRegistro.findByIdAndDelete(req.params.id);
        if (!eliminado) return res.status(404).json({ error: 'El registro no existe.' });
        res.status(200).json({ message: 'Registro eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el registro.' });
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