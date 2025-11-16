// backend-inventario/controllers/auth.controller.js (COMPLETO)
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"; // NECESARIO para generar el token
import dotenv from "dotenv";
import db from "../config/db.js";

dotenv.config();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET;

// =======================================================
// FUNCIÓN REGISTRAR USUARIO (Mantenida)
// =======================================================
export const registrarUsuario = async (req, res) => {
  const { nombre, apellido, cedula, correo_electronico, contrasena, id_rol } =
    req.body;

  if (!correo_electronico || !contrasena || !id_rol) {
    return res
      .status(400)
      .json({
        message: "Faltan campos obligatorios (correo, contraseña, rol).",
      });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [existingUsers] = await connection.query(
      "SELECT id_usuario FROM usuarios WHERE correo_electronico = ?",
      [correo_electronico]
    );

    if (existingUsers.length > 0) {
      return res
        .status(409)
        .json({ message: "El correo electrónico ya está registrado." });
    }

    const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);

    const [result] = await connection.query(
      `INSERT INTO usuarios (nombre, apellido, cedula, correo_electronico, contrasena_hash, id_rol)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, apellido, cedula, correo_electronico, contrasena_hash, id_rol]
    );

    res.status(201).json({
      message: "Usuario registrado exitosamente.",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al registrar usuario." });
  } finally {
    if (connection) connection.release();
  }
};

// =======================================================
// FUNCIÓN LOGIN USUARIO (NUEVA)
// =======================================================
export const loginUsuario = async (req, res) => {
  const { correo_electronico, contrasena } = req.body;

  if (!correo_electronico || !contrasena) {
    return res
      .status(400)
      .json({ message: "Debe ingresar correo electrónico y contraseña." });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // 1. Buscar al usuario y su hash. También unimos con la tabla roles para obtener el nombre del rol.
    // CÓDIGO CORREGIDO:
    const [users] = await connection.query(
      // Calificamos la columna 'id_rol' para que apunte a la tabla 'usuarios' (u)
      "SELECT id_usuario, contrasena_hash, u.id_rol, nombre_rol FROM usuarios u JOIN roles r ON u.id_rol = r.id_rol WHERE correo_electronico = ?",
      [correo_electronico]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    const user = users[0];

    // 2. Comparar la contraseña ingresada con el hash almacenado
    const isMatch = await bcrypt.compare(contrasena, user.contrasena_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    // 3. Generar el JSON Web Token (JWT)
    const payload = {
      id_usuario: user.id_usuario,
      id_rol: user.id_rol, // Incluimos el rol en el token, es esencial para la autorización
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" }); // Token válido por 1 día

    // 4. Enviar respuesta exitosa con el token (para que el Frontend lo guarde)
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
    if (connection) connection.release();
  }
};
