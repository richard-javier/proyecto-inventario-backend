// backend-inventario/server.js (Actualizado)
import express from 'express';
import db from './config/db.js'; 
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js'; 
import { protegerRuta } from './middlewares/auth.middleware.js'; // <-- Importar el middleware

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001; 

// Middleware para parsear JSON
app.use(express.json());

// Conectar las Rutas de Autenticación
app.use('/api/auth', authRoutes); 

// ------------------------------------------------------------------
// EJEMPLO DE RUTA PROTEGIDA (Nueva)
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
});