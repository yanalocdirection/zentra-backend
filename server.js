const express = require('express');
const cors = require('cors');
require('dotenv').config();

const stationsRoutes = require('./routes/stations');
const reservationsRoutes = require('./routes/reservations');
const authRoutes = require('./routes/auth');
const paymentsRoutes = require('./routes/payments');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API ZENTRA active');
});

app.use('/api', authRoutes);
app.use('/api', stationsRoutes);
app.use('/api', reservationsRoutes);
app.use('/api', paymentsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur ZENTRA démarré sur http://localhost:${PORT}`);
});