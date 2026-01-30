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

const corsOptions = {
  origin: 'http://localhost:5173', 
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});