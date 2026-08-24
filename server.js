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
app.use(express.static(__dirname));  // <--- Cambio: sirve desde la raíz

// --- AUTENTICACION SIMPLE POR CONTRASEÑA ---
if (!process.env.ADMIN_PASSWORD) {
    console.warn('ADVERTENCIA: ADMIN_PASSWORD no esta configurada en .env. Nadie podra desbloquear el panel.');
}

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

// 3. MODELOS DE DATOS (sin cambios)
const eventSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'El titulo del evento es obligatorio'], trim: true },
    date: { type: Date, required: [true, 'La fecha de inicio es obligatoria'] },
    duration: { type: String, default: '' },
    allDay: { type: Boolean, default: false }
}, { timestamps: true });
const Event = mongoose.model('Event', eventSchema);

const legajoSchema = new mongoose.Schema({
    persona: { type: String, required: [true, 'El nombre de la persona es obligatorio'], trim: true },
    dni: { type: String, default: '', trim: true },
    certificado: { type: String, default: '', trim: true },
    carnet: { type: String, default: '', trim: true },
    antecedentes: { type: String, default: '', trim: true },
    experiencia: { type: String, enum: ['', 'junior', 'semi junior', 'senior', 'supervisor', 'gerente'], default: '' },
    cargo: { type: String, default: '', trim: true },
    departamento: { type: String, default: '', trim: true },
    telefono: { type: String, default: '', trim: true },
    edad: { type: Number, default: null },
    gmail: { type: String, default: '', trim: true },
    fechaNacimiento: { type: Date, default: null },
    fechaIngreso: { type: Date, default: null }
}, { timestamps: true });
const Legajo = mongoose.model('Legajo', legajoSchema);

const eppSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre es obligatorio'], trim: true },
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] }
}, { timestamps: true });
const Epp = mongoose.model('Epp', eppSchema);

const vehiculoSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre del vehiculo es obligatorio'], trim: true },
    patente: { type: String, default: '', trim: true }
}, { timestamps: true });
const Vehiculo = mongoose.model('Vehiculo', vehiculoSchema);

const vehiculoRegistroSchema = new mongoose.Schema({
    vehiculo: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', required: true },
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] },
    tipo: { type: String, enum: ['uso', 'mantenimiento'], required: true },
    detalle: { type: String, default: '', trim: true }
}, { timestamps: true });
const VehiculoRegistro = mongoose.model('VehiculoRegistro', vehiculoRegistroSchema);

const diarioNotaSchema = new mongoose.Schema({
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] },
    texto: { type: String, default: '' }
}, { timestamps: true });
const DiarioNota = mongoose.model('DiarioNota', diarioNotaSchema);

const diarioGeneralSchema = new mongoose.Schema({
    texto: { type: String, default: '' }
}, { timestamps: true });
const DiarioGeneral = mongoose.model('DiarioGeneral', diarioGeneralSchema);

const asistenciaGrupoSchema = new mongoose.Schema({
    nombre: { type: String, required: [true, 'El nombre del grupo es obligatorio'], trim: true },
    personas: { type: [String], default: [] }
}, { timestamps: true });
const AsistenciaGrupo = mongoose.model('AsistenciaGrupo', asistenciaGrupoSchema);

const asistenciaRegistroSchema = new mongoose.Schema({
    fecha: { type: Date, required: [true, 'La fecha es obligatoria'] },
    persona: { type: String, required: [true, 'La persona es obligatoria'], trim: true },
    estado: { type: String, enum: ['presente', 'ausente', 'tarde'], default: 'presente' }
}, { timestamps: true });
const AsistenciaRegistro = mongoose.model('AsistenciaRegistro', asistenciaRegistroSchema);

// 4. RUTAS DE LA API (sin cambios)
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

function normalizarLegajo(body) {
    const datos = { ...body };
    if (datos.edad === '' || datos.edad === undefined) datos.edad = null;
    if (datos.fechaNacimiento === '' || datos.fechaNacimiento === undefined) datos.fechaNacimiento = null;
    if (datos.fechaIngreso === '' || datos.fechaIngreso === undefined) datos.fechaIngreso = null;
    return datos;
}

app.get('/api/legajos', requireAuth, async (req, res) => {
    try {
        const legajos = await Legajo.find().sort({ createdAt: -1 });
        res.status(200).json(legajos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los legajos.' });
    }
});

app.get('/api/legajos/cumpleanos', requireAuth, async (req, res) => {
    try {
        const legajos = await Legajo.find({ fechaNacimiento: { $ne: null } });
        const hoy = new Date();
        const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const proximos = legajos
            .map(l => {
                const fn = new Date(l.fechaNacimiento);
                let cumpleAnioActual = Date.UTC(hoy.getFullYear(), fn.getUTCMonth(), fn.getUTCDate());
                if (cumpleAnioActual < hoyUTC) {
                    cumpleAnioActual = Date.UTC(hoy.getFullYear() + 1, fn.getUTCMonth(), fn.getUTCDate());
                }
                const diasFaltantes = Math.round((cumpleAnioActual - hoyUTC) / (1000 * 60 * 60 * 24));
                return { _id: l._id, persona: l.persona, fechaNacimiento: l.fechaNacimiento, diasFaltantes };
            })
            .filter(item => item.diasFaltantes >= 0 && item.diasFaltantes <= 7)
            .sort((a, b) => a.diasFaltantes - b.diasFaltantes);
        res.status(200).json(proximos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los cumpleaños.' });
    }
});

app.post('/api/legajos', requireAuth, async (req, res) => {
    try {
        const { persona } = req.body;
        if (!persona) return res.status(400).json({ error: 'El nombre de la persona es obligatorio.' });
        const newLegajo = new Legajo(normalizarLegajo(req.body));
        const savedLegajo = await newLegajo.save();
        res.status(201).json(savedLegajo);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el legajo.' });
    }
});

app.put('/api/legajos/:id', requireAuth, async (req, res) => {
    try {
        const updatedLegajo = await Legajo.findByIdAndUpdate(req.params.id, normalizarLegajo(req.body), { new: true });
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
        await VehiculoRegistro.deleteMany({ vehiculo: req.params.id });
        res.status(200).json({ message: 'Vehiculo eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el vehiculo.' });
    }
});

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

app.get('/api/diario-notas', requireAuth, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.desde || req.query.hasta) {
            filtro.fecha = {};
            if (req.query.desde) filtro.fecha.$gte = new Date(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = new Date(req.query.hasta);
        }
        const notas = await DiarioNota.find(filtro).sort({ fecha: 1 });
        res.status(200).json(notas);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener las notas.' });
    }
});

app.put('/api/diario-notas', requireAuth, async (req, res) => {
    try {
        const { fecha, texto } = req.body;
        if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria.' });
        const nota = await DiarioNota.findOneAndUpdate(
            { fecha: new Date(fecha) },
            { texto: texto || '' },
            { new: true, upsert: true }
        );
        res.status(200).json(nota);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar la nota.' });
    }
});

app.get('/api/diario-general', requireAuth, async (req, res) => {
    try {
        const general = await DiarioGeneral.findOne();
        res.status(200).json(general || { texto: '' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener la nota general.' });
    }
});

app.put('/api/diario-general', requireAuth, async (req, res) => {
    try {
        const { texto } = req.body;
        const general = await DiarioGeneral.findOneAndUpdate({}, { texto: texto || '' }, { new: true, upsert: true });
        res.status(200).json(general);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar la nota general.' });
    }
});

app.get('/api/asistencia-grupos', requireAuth, async (req, res) => {
    try {
        const grupos = await AsistenciaGrupo.find().sort({ nombre: 1 });
        res.status(200).json(grupos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los grupos.' });
    }
});

app.post('/api/asistencia-grupos', requireAuth, async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre del grupo es obligatorio.' });
        const nuevo = new AsistenciaGrupo(req.body);
        const guardado = await nuevo.save();
        res.status(201).json(guardado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar el grupo.' });
    }
});

app.put('/api/asistencia-grupos/:id', requireAuth, async (req, res) => {
    try {
        const actualizado = await AsistenciaGrupo.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!actualizado) return res.status(404).json({ error: 'El grupo no existe.' });
        res.status(200).json(actualizado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el grupo.' });
    }
});

app.delete('/api/asistencia-grupos/:id', requireAuth, async (req, res) => {
    try {
        const eliminado = await AsistenciaGrupo.findByIdAndDelete(req.params.id);
        if (!eliminado) return res.status(404).json({ error: 'El grupo no existe.' });
        res.status(200).json({ message: 'Grupo eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el grupo.' });
    }
});

app.get('/api/asistencias', requireAuth, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.fecha) {
            const d = new Date(req.query.fecha);
            const inicio = new Date(d); inicio.setUTCHours(0, 0, 0, 0);
            const fin = new Date(d); fin.setUTCHours(23, 59, 59, 999);
            filtro.fecha = { $gte: inicio, $lte: fin };
        } else if (req.query.desde || req.query.hasta) {
            filtro.fecha = {};
            if (req.query.desde) filtro.fecha.$gte = new Date(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = new Date(req.query.hasta);
        }
        const registros = await AsistenciaRegistro.find(filtro).sort({ fecha: 1, persona: 1 });
        res.status(200).json(registros);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener las asistencias.' });
    }
});

app.post('/api/asistencias', requireAuth, async (req, res) => {
    try {
        const { fecha, persona, estado } = req.body;
        if (!fecha || !persona) return res.status(400).json({ error: 'La fecha y la persona son obligatorias.' });
        const registro = await AsistenciaRegistro.findOneAndUpdate(
            { fecha: new Date(fecha), persona },
            { estado: estado || 'presente' },
            { new: true, upsert: true }
        );
        res.status(201).json(registro);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al guardar la asistencia.' });
    }
});

app.put('/api/asistencias/:id', requireAuth, async (req, res) => {
    try {
        const actualizado = await AsistenciaRegistro.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!actualizado) return res.status(404).json({ error: 'El registro no existe.' });
        res.status(200).json(actualizado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar la asistencia.' });
    }
});

app.delete('/api/asistencias/:id', requireAuth, async (req, res) => {
    try {
        const eliminado = await AsistenciaRegistro.findByIdAndDelete(req.params.id);
        if (!eliminado) return res.status(404).json({ error: 'El registro no existe.' });
        res.status(200).json({ message: 'Registro eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al eliminar el registro.' });
    }
});

app.post('/api/asistencias/grupo', requireAuth, async (req, res) => {
    try {
        const { fecha, grupoId } = req.body;
        if (!fecha || !grupoId) return res.status(400).json({ error: 'La fecha y el grupo son obligatorios.' });
        const grupo = await AsistenciaGrupo.findById(grupoId);
        if (!grupo) return res.status(404).json({ error: 'El grupo no existe.' });
        const fechaDate = new Date(fecha);
        const operaciones = grupo.personas.map(persona => ({
            updateOne: {
                filter: { fecha: fechaDate, persona },
                update: { $setOnInsert: { fecha: fechaDate, persona, estado: 'presente' } },
                upsert: true
            }
        }));
        if (operaciones.length > 0) await AsistenciaRegistro.bulkWrite(operaciones);
        const registrosDelDia = await AsistenciaRegistro.find({ fecha: fechaDate }).sort({ persona: 1 });
        res.status(200).json(registrosDelDia);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al agregar el grupo.' });
    }
});

app.post('/api/asistencias/marcar-todos', requireAuth, async (req, res) => {
    try {
        const { fecha, estado } = req.body;
        if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria.' });
        const fechaDate = new Date(fecha);
        await AsistenciaRegistro.updateMany({ fecha: fechaDate }, { estado: estado || 'presente' });
        const registrosDelDia = await AsistenciaRegistro.find({ fecha: fechaDate }).sort({ persona: 1 });
        res.status(200).json(registrosDelDia);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al marcar la asistencia.' });
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint de la API no existe.' });
});

// Ruta por defecto: envía index.html desde el mismo directorio
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));  // <--- Cambio
});

// 5. INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`Servidor ejecutandose correctamente en el puerto ${PORT}`);
});