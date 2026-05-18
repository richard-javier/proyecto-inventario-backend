import express from 'express';
import { 
    registrarUsuario, 
    loginUsuario, 
    obtenerUsuarios, 
    actualizarUsuario, 
    eliminarUsuario, 
    cambiarEstadoUsuario, 
    cambiarPassword 
} from '../controllers/auth.controller.js';
import { protegerRuta, verificarRol } from '../middlewares/auth.middleware.js';

const router = express.Router();

// 1. RUTA PÚBLICA (Login)
router.post('/login', loginUsuario);

// 2. RUTAS PROTEGIDAS: Gestión de Usuarios (Solo Roles 1: Gerente y 2: Sistemas)
router.post('/registro', protegerRuta, verificarRol([1, 2]), registrarUsuario);
router.get('/usuarios', protegerRuta, verificarRol([1, 2]), obtenerUsuarios);
router.put('/usuarios/:id', protegerRuta, verificarRol([1, 2]), actualizarUsuario); // Modal de Edición
router.put('/usuarios/:id/estado', protegerRuta, verificarRol([1, 2]), cambiarEstadoUsuario); // Toggle On/Off
router.delete('/usuarios/:id', protegerRuta, verificarRol([1, 2]), eliminarUsuario); // Borrado Físico (Trash)

// 3. RUTA PROTEGIDA: Mi Perfil (Cualquier usuario que esté logueado)
router.post('/cambiar-password', protegerRuta, cambiarPassword);

export default router;