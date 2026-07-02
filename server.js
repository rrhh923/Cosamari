require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
console.log("oioioiioi URI", process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI)
   .then(() => console.log ('conectado'))
   .catch(err => console.error('error:', err));
app.get('/api/saludo', (req, res) => {
    res.json({mensaje: "hola"});
});
app.listen(PORT, () => {
    console.log(`server anda ${PORT}`)
});