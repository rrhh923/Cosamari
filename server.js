require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
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
    res.json({mensaje: "hola"});
});
app.listen(PORT, () => {
    console.log(`server anda ${PORT}`)
});