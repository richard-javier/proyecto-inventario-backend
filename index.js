// backend-inventario/index.js

import express from 'express';
import cors from 'cors'; 
import db from './config/db.js'; 
import dotenv from 'dotenv'; 
import authRoutes from './routes/auth.routes.js'; 
import { protegerRuta } from './middlewares/auth.middleware.js'; 

// --- AGREGA ESTA LÍNEA AQUÍ ARRIBA ---
import inventoryRoutes from './routes/inventory.routes.js'; 
// -------------------------------------

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001; 
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,https://SINCOT,https://sincot.local')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}):5173$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https:\/\/(SINCOT|sincot\.local)$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
};

app.use(cors(corsOptions)); 
app.use(express.json());

// Definición de Rutas
app.use('/api/auth', authRoutes); 

// --- AGREGA ESTA LÍNEA AQUÍ ABAJO ---
app.use('/api/inventario', inventoryRoutes);
// -------------------------------------

app.get('/', (req, res) => {
  res.send('Backend del proyecto Inventario funcionando');
});

// ... (El resto de tu código sigue igual)

app.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor corriendo en http://${HOST}:${PORT}`);
});
