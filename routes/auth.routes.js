// backend-inventario/routes/auth.routes.js (Actualizado)
import express from 'express';
// Asegúrate de importar la nueva función
import { registrarUsuario, loginUsuario } from '../controllers/auth.controller.js'; 

const router = express.Router();

// Rutas de Autenticación
router.post('/registro', registrarUsuario);
router.post('/login', loginUsuario); // <-- RUTA POST para el Login

export default router;