/**
 * @fileoverview Punto de entrada principal para el servidor de la API REST del proyecto Inventario.
 * Configura el servidor Express, middlewares, CORS y las rutas principales, incluyendo la autenticación.
 * @author [Tu Nombre/Empresa]
 * @version 1.0.0
 */

// ------------------------------------------------------------------
// Importaciones de Módulos Esenciales
// ------------------------------------------------------------------
import express from 'express';
// CORS (Cross-Origin Resource Sharing) es necesario para permitir peticiones desde el frontend.
import cors from 'cors'; 
import db from './config/db.js'; // Configuración de conexión a la Base de Datos (asume la conexión).
import dotenv from 'dotenv'; // Carga las variables de entorno del archivo .env.
import authRoutes from './routes/auth.routes.js'; // Rutas dedicadas a la autenticación (Login, Registro).
import { protegerRuta } from './middlewares/auth.middleware.js'; // Middleware para la protección de endpoints.

// ------------------------------------------------------------------
// Inicialización y Configuración Global
// ------------------------------------------------------------------

// Carga las variables de entorno para su uso en la aplicación (e.g., PORT, secretos).
dotenv.config();

// Inicializa la aplicación Express.
const app = express();
// Define el puerto de ejecución, usando la variable de entorno PORT o 3001 por defecto.
const PORT = process.env.PORT || 3001; 

// ------------------------------------------------------------------
// CONFIGURACIÓN DE MIDDLEWARE: CORS
// ------------------------------------------------------------------
/**
 * Opciones de configuración de CORS.
 * Restringe el acceso al API permitiendo únicamente solicitudes del frontend de React.
 * Esto previene peticiones no autorizadas de otros orígenes.
 */
const corsOptions = {
  // Origen permitido: Asegúrate de que este URL coincida exactamente con el host del frontend (Vite/React).
  origin: 'http://localhost:5173', 
  // Métodos HTTP permitidos.
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  // Habilita el envío de credenciales (cookies, encabezados de autorización).
  credentials: true,
};

// Aplica el middleware CORS a todas las rutas.
app.use(cors(corsOptions)); 
// ------------------------------------------------------------------

// Middleware para el manejo de payloads JSON. Permite leer `req.body` en formato JSON.
app.use(express.json());

// ------------------------------------------------------------------
// Definición de Rutas
// ------------------------------------------------------------------

// Rutas de Autenticación: Monta todas las rutas de `authRoutes` bajo el prefijo `/api/auth`.
app.use('/api/auth', authRoutes); 

// Ruta de Prueba: Verifica que el servidor esté operativo.
app.get('/', (req, res) => {
  res.send('Backend del proyecto Inventario funcionando');
});

// ------------------------------------------------------------------
// EJEMPLO DE RUTA PROTEGIDA (Requiere Autenticación)
// ------------------------------------------------------------------
/**
 * Endpoint de prueba que requiere un token JWT válido en la cabecera 'Authorization'.
 * @param {Function} protegerRuta - Middleware que verifica la autenticación.
 */
app.get('/api/inventario/test-protegida', protegerRuta, (req, res) => {
    // `req.usuario` es inyectado por el middleware `protegerRuta` si la autenticación es exitosa.
    res.json({ 
        message: '✅ Acceso a ruta protegida exitoso. Token verificado.',
        usuario_autenticado: {
            // Accede a las propiedades del usuario decodificadas del token.
            id: req.usuario.id_usuario,
            rol_id: req.usuario.id_rol
        }
    });
});
// ------------------------------------------------------------------


// ------------------------------------------------------------------
// Inicio del Servidor
// ------------------------------------------------------------------
// El servidor comienza a escuchar en el puerto especificado.
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`CORS habilitado para origen: http://localhost:5173`);
});