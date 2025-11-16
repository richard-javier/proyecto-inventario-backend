import express from 'express';
import cors from 'cors'; // <-- 1. Importar la librería CORS
import db from './config/db.js'; 
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js'; 
import { protegerRuta } from './middlewares/auth.middleware.js';

dotenv.config();

const app = express();
// Usamos el puerto del .env (3001)
const PORT = process.env.PORT || 3001; 

// ------------------------------------------------------------------
// CONFIGURACIÓN DE CORS (SOLUCIÓN AL ERROR DE ORIGEN CRUZADO)
// Permite peticiones SÓLO desde tu frontend de React (http://localhost:5173).
const corsOptions = {
  // Asegúrate de que este puerto coincida con el puerto de Vite/React
  origin: 'http://localhost:5173', 
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
};

app.use(cors(corsOptions)); // <-- 2. Aplicar el middleware CORS
// ------------------------------------------------------------------

// Middleware para parsear JSON
app.use(express.json());

// Conectar las Rutas de Autenticación
app.use('/api/auth', authRoutes); 

// ------------------------------------------------------------------
// EJEMPLO DE RUTA PROTEGIDA
// ------------------------------------------------------------------
app.get('/api/inventario/test-protegida', protegerRuta, (req, res) => {
    // Si llegamos aquí, el usuario está autenticado y req.usuario es accesible
    res.json({ 
        message: '✅ Acceso a ruta protegida exitoso.',
        usuario_autenticado: {
            id: req.usuario.id_usuario,
            rol_id: req.usuario.id_rol
        }
    });
});
// ------------------------------------------------------------------


// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Backend del proyecto Inventario funcionando');
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`CORS habilitado para http://localhost:5173`);
});