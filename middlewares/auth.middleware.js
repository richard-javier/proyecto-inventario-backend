// backend-inventario/middlewares/auth.middleware.js

/**
 * @module middlewares/auth.middleware
 * @description Middleware de autenticación JWT para proteger rutas
 * @version 1.0.0
 * @requires jsonwebtoken
 * @requires dotenv
 */

import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Configurar variables de entorno
dotenv.config();

/**
 * @constant {string} JWT_SECRET - Clave secreta para verificar tokens JWT
 * @description Obtenida desde variables de entorno para mayor seguridad
 */
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * @middleware protegerRuta
 * @description Middleware de autenticación que verifica la validez del token JWT
 *              en las peticiones HTTP. Si el token es válido, adjunta la información
 *              del usuario decodificada a la solicitud (req.usuario).
 *
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.headers - Encabezados de la solicitud
 * @param {string} req.headers.authorization - Encabezado de autorización (Bearer token)
 *
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función next de Express para continuar el flujo
 *
 * @returns {void|Object} Continúa al siguiente middleware o retorna error JSON
 *
 * @throws {401} Si no se proporciona token o el formato es incorrecto
 * @throws {403} Si el token es inválido, expirado o modificado
 *
 * @example
 * // Uso en rutas protegidas
 * app.get('/ruta-protegida', protegerRuta, (req, res) => {
 *   // req.usuario está disponible aquí
 *   res.json({ message: 'Acceso permitido', usuario: req.usuario });
 * });
 *
 * @example
 * // Encabezado Authorization requerido
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */
export const protegerRuta = (req, res, next) => {
  // 1. Obtener el token del encabezado Authorization
  const authHeader = req.headers["authorization"];

  /**
   * @description Verifica la presencia y formato correcto del encabezado Authorization
   * @constant {boolean} isHeaderValid - Indica si el encabezado es válido
   */
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Acceso denegado. No se proporcionó token o formato incorrecto.",
    });
  }

  /**
   * @description Extrae el token del encabezado Authorization
   * @constant {string} token - Token JWT sin el prefijo 'Bearer'
   *
   * @example
   * // Encabezado: "Bearer abc123.def456.ghi789"
   * // Token extraído: "abc123.def456.ghi789"
   */
  const token = authHeader.split(" ")[1];

  // Validar que el token no esté vacío después de extraerlo
  if (!token) {
    return res.status(401).json({
      message: "Acceso denegado. No se proporcionó token.",
    });
  }

  // 2. Verificar la validez del token JWT
  try {
    /**
     * @description Verifica y decodifica el token JWT usando la clave secreta
     * @constant {Object} decoded - Payload decodificado del token
     * @property {number} decoded.id_usuario - ID único del usuario
     * @property {number} decoded.id_rol - ID del rol del usuario
     * @property {number} decoded.iat - Fecha de emisión del token (timestamp)
     * @property {number} decoded.exp - Fecha de expiración del token (timestamp)
     */
    const decoded = jwt.verify(token, JWT_SECRET);

    /**
     * @description Adjunta los datos del usuario decodificados al objeto de solicitud
     * @property {Object} req.usuario - Información del usuario autenticado
     */
    req.usuario = decoded;

    // Continuar al siguiente middleware o controlador
    next();
  } catch (error) {
    /**
     * @description Maneja diferentes tipos de errores de verificación JWT
     * @param {Error} error - Error de verificación del token
     */

    // Determinar el tipo específico de error
    let errorMessage = "Token inválido o expirado.";

    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expirado. Por favor, inicie sesión nuevamente.";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Token inválido.";
    } else if (error.name === "NotBeforeError") {
      errorMessage = "Token no activo.";
    }

    console.error("Error de autenticación JWT:", error.name, errorMessage);

    return res.status(403).json({
      message: errorMessage,
    });
  }
};

/**
 * @middleware optionalAuth
 * @description Middleware opcional de autenticación que verifica el token si está presente,
 *              pero no rechaza la petición si no hay token. Útil para rutas que funcionan
 *              tanto para usuarios autenticados como anónimos.
 *
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función next de Express
 *
 * @example
 * // Uso en rutas opcionales
 * app.get('/ruta-opcional', optionalAuth, (req, res) => {
 *   if (req.usuario) {
 *     // Usuario autenticado
 *   } else {
 *     // Usuario anónimo
 *   }
 * });
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
      } catch (error) {
        // No rechazar la petición, simplemente no adjuntar usuario
        console.warn("Token opcional inválido:", error.message);
      }
    }
  }

  next();
};
