import express from 'express';
import { 
    registrarUsuario, 
    loginUsuario, 
    forgotPassword,
    resetPassword,
    obtenerUsuarios, 
    actualizarUsuario, 
    eliminarUsuario, 
    cambiarEstadoUsuario, 
    cambiarPassword 
} from '../controllers/auth.controller.js';
import { protegerRuta, verificarRol } from '../middlewares/auth.middleware.js';

const router = express.Router();
const forgotPasswordAttempts = new Map();

const forgotPasswordRateLimit = (req, res, next) => {
    const windowMs = Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
    const maxAttempts = Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX || 5);
    const email = String(req.body?.correo_electronico || '').trim().toLowerCase();
    const key = `${req.ip}:${email}`;
    const now = Date.now();
    const current = forgotPasswordAttempts.get(key) || { count: 0, resetAt: now + windowMs };

    if (current.resetAt <= now) {
        forgotPasswordAttempts.set(key, { count: 1, resetAt: now + windowMs });
        return next();
    }

    if (current.count >= maxAttempts) {
        return res.status(429).json({ message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
    }

    current.count += 1;
    forgotPasswordAttempts.set(key, current);
    return next();
};

// 1. RUTA PÚBLICA (Login)
router.post('/login', loginUsuario);
router.post('/forgot-password', forgotPasswordRateLimit, forgotPassword);
router.post('/reset-password', resetPassword);

// 2. RUTAS PROTEGIDAS: Gestión de Usuarios (Solo Roles 1: Gerente y 2: Sistemas)
router.post('/registro', protegerRuta, verificarRol([1, 2]), registrarUsuario);
router.get('/usuarios', protegerRuta, verificarRol([1, 2]), obtenerUsuarios);
router.put('/usuarios/:id', protegerRuta, verificarRol([1, 2]), actualizarUsuario); // Modal de Edición
router.put('/usuarios/:id/estado', protegerRuta, verificarRol([1, 2]), cambiarEstadoUsuario); // Toggle On/Off
router.delete('/usuarios/:id', protegerRuta, verificarRol([1, 2]), eliminarUsuario); // Borrado Físico (Trash)

// 3. RUTA PROTEGIDA: Mi Perfil (Cualquier usuario que esté logueado)
router.post('/cambiar-password', protegerRuta, cambiarPassword);

export default router;
