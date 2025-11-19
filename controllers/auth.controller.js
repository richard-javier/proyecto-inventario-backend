// backend-inventario/controllers/auth.controller.js

/**
 * @module controllers/auth.controller
 * @description Controlador de autenticación para registro y login de usuarios
 * @version 1.0.0
 * @requires bcrypt
 * @requires jsonwebtoken
 * @requires dotenv
 * @requires ../config/db
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../config/db.js";

// Configurar variables de entorno
dotenv.config();

/**
 * @constant {number} saltRounds - Número de rondas de sal para bcrypt
 * @description Define la complejidad del hash de contraseñas (10 = balance entre seguridad y rendimiento)
 */
const saltRounds = 10;

/**
 * @constant {string} JWT_SECRET - Clave secreta para firmar tokens JWT
 * @description Obtenida desde variables de entorno para mayor seguridad
 */
const JWT_SECRET = process.env.JWT_SECRET;

// =======================================================
// FUNCIÓN REGISTRAR USUARIO
// =======================================================

/**
 * @function registrarUsuario
 * @async
 * @description Registra un nuevo usuario en el sistema con contraseña hasheada
 *
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.nombre - Nombre del usuario (opcional)
 * @param {string} req.body.apellido - Apellido del usuario (opcional)
 * @param {string} req.body.cedula - Cédula del usuario (opcional)
 * @param {string} req.body.correo_electronico - Correo electrónico (obligatorio)
 * @param {string} req.body.contrasena - Contraseña en texto plano (obligatorio)
 * @param {number} req.body.id_rol - ID del rol del usuario (obligatorio)
 *
 * @param {Object} res - Objeto de respuesta Express
 *
 * @returns {Object} Respuesta JSON con resultado del registro
 *
 * @throws {400} Si faltan campos obligatorios
 * @throws {409} Si el correo electrónico ya está registrado
 * @throws {500} Error interno del servidor
 *
 * @example
 * // POST /api/auth/registro
 * {
 *   "nombre": "Juan",
 *   "apellido": "Pérez",
 *   "correo_electronico": "juan@example.com",
 *   "contrasena": "miContraseña123",
 *   "id_rol": 2
 * }
 */
export const registrarUsuario = async (req, res) => {
  const { nombre, apellido, cedula, correo_electronico, contrasena, id_rol } =
    req.body;

  // Validar campos obligatorios
  if (!correo_electronico || !contrasena || !id_rol) {
    return res.status(400).json({
      message: "Faltan campos obligatorios (correo, contraseña, rol).",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // Verificar si el usuario ya existe
    const [existingUsers] = await connection.query(
      "SELECT id_usuario FROM usuarios WHERE correo_electronico = ?",
      [correo_electronico]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "El correo electrónico ya está registrado.",
      });
    }

    // Hashear contraseña antes de almacenarla
    const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);

    // Insertar nuevo usuario en la base de datos
    const [result] = await connection.query(
      `INSERT INTO usuarios (nombre, apellido, cedula, correo_electronico, contrasena_hash, id_rol)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, apellido, cedula, correo_electronico, contrasena_hash, id_rol]
    );

    // Respuesta exitosa
    res.status(201).json({
      message: "Usuario registrado exitosamente.",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    res.status(500).json({
      message: "Error interno del servidor al registrar usuario.",
    });
  } finally {
    // Liberar conexión a la base de datos
    if (connection) connection.release();
  }
};

// =======================================================
// FUNCIÓN LOGIN USUARIO
// =======================================================

/**
 * @function loginUsuario
 * @async
 * @description Autentica un usuario existente y genera un token JWT
 *
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.correo_electronico - Correo electrónico del usuario
 * @param {string} req.body.contrasena - Contraseña en texto plano
 *
 * @param {Object} res - Objeto de respuesta Express
 *
 * @returns {Object} Respuesta JSON con token JWT y datos del usuario
 *
 * @throws {400} Si faltan credenciales
 * @throws {401} Si las credenciales son inválidas
 * @throws {500} Error interno del servidor
 *
 * @example
 * // POST /api/auth/login
 * {
 *   "correo_electronico": "juan@example.com",
 *   "contrasena": "miContraseña123"
 * }
 *
 * // Respuesta exitosa
 * {
 *   "message": "Login exitoso.",
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "usuario": {
 *     "id": 1,
 *     "rol": "Administrador"
 *   }
 * }
 */
export const loginUsuario = async (req, res) => {
  const { correo_electronico, contrasena } = req.body;

  // Validar presencia de credenciales
  if (!correo_electronico || !contrasena) {
    return res.status(400).json({
      message: "Debe ingresar correo electrónico y contraseña.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();

    /**
     * @description Consulta que obtiene usuario y su rol mediante JOIN
     * @constant {Array} users - Resultado de la consulta con datos del usuario
     */
    const [users] = await connection.query(
      `SELECT id_usuario, contrasena_hash, u.id_rol, nombre_rol 
       FROM usuarios u 
       JOIN roles r ON u.id_rol = r.id_rol 
       WHERE correo_electronico = ?`,
      [correo_electronico]
    );

    // Verificar si el usuario existe
    if (users.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    const user = users[0];

    // Comparar contraseña proporcionada con hash almacenado
    const isMatch = await bcrypt.compare(contrasena, user.contrasena_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    /**
     * @constant {Object} payload - Payload del token JWT
     * @property {number} id_usuario - ID único del usuario
     * @property {number} id_rol - ID del rol para autorización
     */
    const payload = {
      id_usuario: user.id_usuario,
      id_rol: user.id_rol, // Esencial para autorización en rutas protegidas
    };

    // Generar token JWT válido por 1 día
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    // Respuesta exitosa con token y datos del usuario
    res.status(200).json({
      message: "Login exitoso.",
      token: token,
      usuario: {
        id: user.id_usuario,
        rol: user.nombre_rol,
      },
    });
  } catch (error) {
    console.error("Error durante el login:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  } finally {
    // Liberar conexión a la base de datos
    if (connection) connection.release();
  }
};
