// backend-inventario/routes/auth.routes.js

/**
 * @module routes/auth.routes
 * @description Módulo de rutas para autenticación y gestión de usuarios
 * @version 1.0.0
 * @requires express
 * @requires ../controllers/auth.controller
 */

import express from 'express';
import { registrarUsuario, loginUsuario } from '../controllers/auth.controller.js';

/**
 * @constant {Router} router - Router de Express para las rutas de autenticación
 * @description Instancia del router que manejará todas las rutas relacionadas con autenticación
 */
const router = express.Router();

// =======================================================
// RUTAS DE AUTENTICACIÓN
// =======================================================

/**
 * @route POST /api/auth/registro
 * @description Registra un nuevo usuario en el sistema
 * @group Autenticación - Operaciones de registro y login
 * @access Público
 * 
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.nombre - Nombre del usuario (opcional)
 * @param {string} req.body.apellido - Apellido del usuario (opcional)
 * @param {string} req.body.cedula - Cédula del usuario (opcional)
 * @param {string} req.body.correo_electronico - Correo electrónico (obligatorio)
 * @param {string} req.body.contrasena - Contraseña en texto plano (obligatorio)
 * @param {number} req.body.id_rol - ID del rol del usuario (obligatorio)
 * 
 * @returns {Object} 201 - Usuario registrado exitosamente
 * @returns {Object} 400 - Faltan campos obligatorios
 * @returns {Object} 409 - El correo electrónico ya está registrado
 * @returns {Object} 500 - Error interno del servidor
 * 
 * @example
 * // POST /api/auth/registro
 * {
 *   "nombre": "María",
 *   "apellido": "González",
 *   "correo_electronico": "maria@empresa.com",
 *   "contrasena": "passwordSeguro123",
 *   "id_rol": 2
 * }
 */
router.post('/registro', registrarUsuario);

/**
 * @route POST /api/auth/login
 * @description Autentica un usuario existente y genera un token JWT
 * @group Autenticación - Operaciones de registro y login
 * @access Público
 * 
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.correo_electronico - Correo electrónico del usuario
 * @param {string} req.body.contrasena - Contraseña en texto plano
 * 
 * @returns {Object} 200 - Login exitoso con token JWT
 * @returns {Object} 400 - Debe ingresar correo y contraseña
 * @returns {Object} 401 - Credenciales inválidas
 * @returns {Object} 500 - Error interno del servidor
 * 
 * @example
 * // POST /api/auth/login
 * {
 *   "correo_electronico": "maria@empresa.com",
 *   "contrasena": "passwordSeguro123"
 * }
 * 
 * @example
 * // Respuesta exitosa
 * {
 *   "message": "Login exitoso.",
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "usuario": {
 *     "id": 1,
 *     "rol": "Usuario"
 *   }
 * }
 */
router.post('/login', loginUsuario);

/**
 * @exports router
 * @description Router de Express configurado con todas las rutas de autenticación
 *              para ser utilizado en la aplicación principal.
 */
export default router;