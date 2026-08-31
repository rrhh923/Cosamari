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
// Servir SOLO la carpeta public (donde está index.html).
// Importante: NO servir __dirname (raíz), porque expondría .env, server.js, etc.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

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
// En Render conviene NO cerrar el proceso ante un fallo de conexion:
// si el proceso muere, Render lo reinicia en bucle. En su lugar reintentamos
// y dejamos el servidor HTTP levantado (para que Render detecte el puerto abierto
// y para poder ver los logs).
mongoose.set('strictQuery', false);

async function conectarDB(reintento = 0) {
    if (!process.env.MONGO_URI) {
        console.error('ERROR: La variable de entorno MONGO_URI no esta configurada. ' +
            'Configurala en Render > Environment. El servidor sigue vivo pero la base de datos no funcionara.');
        return;
    }
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        console.log('Conectado exitosamente a MongoDB');
        await normalizarDatosExistentes();
    } catch (err) {
        const espera = Math.min(30000, 5000 * (reintento + 1)); // backoff hasta 30s
        console.error(`Error de conexion a MongoDB (intento ${reintento + 1}): ${err.message}`);
        console.error(`Reintentando en ${espera / 1000}s... ` +
            '(Si usas MongoDB Atlas, verifica que en Network Access este permitido 0.0.0.0/0.)');
        setTimeout(() => conectarDB(reintento + 1), espera);
    }
}
conectarDB();

// --- HELPERS DE FECHA ---
// Todas las fechas "de calendario" (notas del diario, asistencias) se guardan
// SIEMPRE a medianoche UTC del dia elegido. Sin esto, segun la zona horaria del
// navegador una nota podia guardarse en el dia anterior o siguiente.
function soloFecha(valor) {
    if (!valor) return null;
    if (typeof valor === 'string') {
        const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    }
    const d = new Date(valor);
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Fin del dia (23:59:59.999 UTC), para que los rangos "hasta" incluyan ese dia.
function finDelDia(valor) {
    const d = soloFecha(valor);
    if (!d) return null;
    return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// 3. MODELOS DE DATOS
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
    // Faltaba en el modelo: el formulario lo enviaba pero Mongoose lo descartaba,
    // asi que "Permisos de trabajo" nunca se guardaba.
    permisosTrabajo: { type: String, default: '', trim: true },
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
// Una sola nota por dia. Sin este indice se podian crear duplicados para la misma
// fecha y la pantalla mostraba el texto viejo (parecia que "no se guardaba").
diarioNotaSchema.index({ fecha: 1 }, { unique: true });
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
// Una sola fila por persona y dia (evita duplicados al sumar un grupo dos veces).
asistenciaRegistroSchema.index({ fecha: 1, persona: 1 }, { unique: true });
const AsistenciaRegistro = mongoose.model('AsistenciaRegistro', asistenciaRegistroSchema);

// 3.b LIMPIEZA DE DATOS EXISTENTES (se ejecuta una vez al conectar)
// Arregla registros viejos que quedaron guardados con hora (o corridos un dia)
// y elimina duplicados, para que los indices unicos se puedan crear.
async function normalizarDatosExistentes() {
    try {
        // --- Notas del diario: una sola por dia ---
        const notas = await DiarioNota.find({}).sort({ updatedAt: -1 });
        const vistos = new Map();
        for (const n of notas) {
            const dia = soloFecha(n.fecha);
            if (!dia) { await DiarioNota.deleteOne({ _id: n._id }); continue; }
            const clave = dia.toISOString();
            if (vistos.has(clave)) {
                // Nos quedamos con la mas reciente (ya ordenamos por updatedAt desc)
                await DiarioNota.deleteOne({ _id: n._id });
            } else {
                vistos.set(clave, true);
                if (n.fecha.getTime() !== dia.getTime()) {
                    await DiarioNota.updateOne({ _id: n._id }, { $set: { fecha: dia } });
                }
            }
        }

        // --- Asistencias: una sola por persona y dia ---
        const registros = await AsistenciaRegistro.find({}).sort({ updatedAt: -1 });
        const vistosAsis = new Map();
        for (const r of registros) {
            const dia = soloFecha(r.fecha);
            if (!dia || !r.persona) { await AsistenciaRegistro.deleteOne({ _id: r._id }); continue; }
            const clave = dia.toISOString() + '|' + r.persona.trim().toLowerCase();
            if (vistosAsis.has(clave)) {
                await AsistenciaRegistro.deleteOne({ _id: r._id });
            } else {
                vistosAsis.set(clave, true);
                const nombreLimpio = r.persona.trim();
                const cambios = {};
                if (r.fecha.getTime() !== dia.getTime()) cambios.fecha = dia;
                if (nombreLimpio !== r.persona) cambios.persona = nombreLimpio;
                if (Object.keys(cambios).length > 0) {
                    await AsistenciaRegistro.updateOne({ _id: r._id }, { $set: cambios });
                }
            }
        }

        // --- Nota general: dejar una sola ---
        const generales = await DiarioGeneral.find({}).sort({ updatedAt: -1 });
        for (let i = 1; i < generales.length; i++) {
            await DiarioGeneral.deleteOne({ _id: generales[i]._id });
        }

        // Las notas generales ahora se guardan por fecha. Si quedo texto del
        // esquema anterior (sin fecha), lo movemos a la nota del dia en que se
        // escribio, para no perderlo.
        const general = generales[0];
        if (general && general.texto && general.texto.trim()) {
            const diaOrigen = soloFecha(general.updatedAt || general.createdAt || new Date());
            const notaDelDia = await DiarioNota.findOne({ fecha: diaOrigen });
            if (!notaDelDia) {
                await DiarioNota.create({ fecha: diaOrigen, texto: general.texto });
            } else if (!notaDelDia.texto || !notaDelDia.texto.includes(general.texto.trim())) {
                notaDelDia.texto = [notaDelDia.texto, general.texto].filter(Boolean).join('\n\n');
                await notaDelDia.save();
            }
            await DiarioGeneral.updateOne({ _id: general._id }, { $set: { texto: '' } });
            console.log(`Notas generales anteriores movidas al ${diaOrigen.toISOString().slice(0, 10)}.`);
        }

        await Promise.all([
            DiarioNota.syncIndexes(),
            AsistenciaRegistro.syncIndexes()
        ]);
        console.log('Datos normalizados correctamente.');
    } catch (err) {
        console.error('Aviso: no se pudo normalizar los datos existentes:', err.message);
    }
}

// 4. RUTAS DE LA API
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
            if (req.query.desde) filtro.fecha.$gte = soloFecha(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = finDelDia(req.query.hasta);
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
            if (req.query.desde) filtro.fecha.$gte = soloFecha(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = finDelDia(req.query.hasta);
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
        const dia = soloFecha(fecha);
        if (!dia) return res.status(400).json({ error: 'La fecha es obligatoria y debe ser valida.' });
        const nota = await DiarioNota.findOneAndUpdate(
            { fecha: dia },
            { $set: { texto: texto || '' }, $setOnInsert: { fecha: dia } },
            { new: true, upsert: true }
        );
        res.status(200).json(nota);
    } catch (error) {
        console.error('Error guardando nota del diario:', error);
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

app.get(['/api/grupos', '/api/asistencia-grupos'], requireAuth, async (req, res) => {
    try {
        const grupos = await AsistenciaGrupo.find().sort({ nombre: 1 });
        res.status(200).json(grupos);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al obtener los grupos.' });
    }
});

app.post(['/api/grupos', '/api/asistencia-grupos'], requireAuth, async (req, res) => {
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

app.put(['/api/grupos/:id', '/api/asistencia-grupos/:id'], requireAuth, async (req, res) => {
    try {
        const actualizado = await AsistenciaGrupo.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!actualizado) return res.status(404).json({ error: 'El grupo no existe.' });
        res.status(200).json(actualizado);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al actualizar el grupo.' });
    }
});

app.delete(['/api/grupos/:id', '/api/asistencia-grupos/:id'], requireAuth, async (req, res) => {
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
            filtro.fecha = { $gte: soloFecha(req.query.fecha), $lte: finDelDia(req.query.fecha) };
        } else if (req.query.desde || req.query.hasta) {
            filtro.fecha = {};
            if (req.query.desde) filtro.fecha.$gte = soloFecha(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = finDelDia(req.query.hasta);
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
        const dia = soloFecha(fecha);
        const nombre = (persona || '').trim();
        if (!dia || !nombre) return res.status(400).json({ error: 'La fecha y la persona son obligatorias.' });

        // Evitar que la misma persona quede dos veces el mismo dia.
        // Comparamos sin distinguir mayusculas ni espacios de mas.
        const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const yaExiste = await AsistenciaRegistro.findOne({
            fecha: dia,
            persona: { $regex: `^${escapado}$`, $options: 'i' }
        });
        if (yaExiste) {
            if (estado && yaExiste.estado !== estado) {
                yaExiste.estado = estado;
                await yaExiste.save();
            }
            return res.status(200).json(yaExiste);
        }

        const registro = await AsistenciaRegistro.findOneAndUpdate(
            { fecha: dia, persona: nombre },
            { $set: { estado: estado || 'presente' }, $setOnInsert: { fecha: dia, persona: nombre } },
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
        const fechaDate = soloFecha(fecha);
        if (!fechaDate || !grupoId) return res.status(400).json({ error: 'La fecha y el grupo son obligatorios.' });
        const grupo = await AsistenciaGrupo.findById(grupoId);
        if (!grupo) return res.status(404).json({ error: 'El grupo no existe.' });
        if (!grupo.personas || grupo.personas.length === 0) {
            return res.status(400).json({ error: 'El grupo no tiene integrantes. Editalo y agrega personas.' });
        }
        // Solo agregamos a quienes todavia no estan cargados ese dia,
        // comparando sin distinguir mayusculas ni espacios de mas.
        const yaCargados = await AsistenciaRegistro.find({ fecha: fechaDate });
        const clavesExistentes = new Set(yaCargados.map(r => (r.persona || '').trim().toLowerCase()));

        const nuevos = [];
        const vistos = new Set();
        for (const p of grupo.personas) {
            const nombre = (p || '').trim();
            if (!nombre) continue;
            const clave = nombre.toLowerCase();
            if (clavesExistentes.has(clave) || vistos.has(clave)) continue;
            vistos.add(clave);
            nuevos.push({
                insertOne: { document: { fecha: fechaDate, persona: nombre, estado: 'presente' } }
            });
        }

        if (nuevos.length > 0) {
            // ordered:false -> si alguno choca con el indice unico, el resto igual entra
            await AsistenciaRegistro.bulkWrite(nuevos, { ordered: false }).catch(err => {
                if (err.code !== 11000) throw err;
            });
        }
        const registrosDelDia = await AsistenciaRegistro.find({ fecha: fechaDate }).sort({ persona: 1 });
        res.status(200).json(registrosDelDia);
    } catch (error) {
        console.error('Error agregando grupo al dia:', error);
        res.status(500).json({ error: 'Hubo un problema al agregar el grupo.' });
    }
});

app.post('/api/asistencias/marcar-todos', requireAuth, async (req, res) => {
    try {
        const { fecha, estado } = req.body;
        const fechaDate = soloFecha(fecha);
        if (!fechaDate) return res.status(400).json({ error: 'La fecha es obligatoria.' });
        await AsistenciaRegistro.updateMany({ fecha: fechaDate }, { estado: estado || 'presente' });
        const registrosDelDia = await AsistenciaRegistro.find({ fecha: fechaDate }).sort({ persona: 1 });
        res.status(200).json(registrosDelDia);
    } catch (error) {
        res.status(500).json({ error: 'Hubo un problema al marcar la asistencia.' });
    }
});

// Health check para Render (responde aunque la base de datos no este lista)
app.get('/healthz', (req, res) => {
    const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
    res.status(200).json({ ok: true, db: estados[mongoose.connection.readyState] || 'desconocido' });
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'El endpoint de la API no existe.' });
});

// Ruta por defecto: envía index.html desde la carpeta public
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 5. INICIAR SERVIDOR
// Escuchamos en 0.0.0.0 (requerido por Render) y en process.env.PORT.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ejecutandose correctamente en el puerto ${PORT}`);
});