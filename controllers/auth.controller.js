import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../config/db.js";

dotenv.config();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_super_seguro";

// 1. REGISTRAR USUARIO
export const registrarUsuario = async (req, res) => {
  const { nombre, apellido, cedula, telefono, correo_electronico, contrasena, id_rol } = req.body;
  if (!correo_electronico || !contrasena || !id_rol) return res.status(400).json({ message: "Faltan campos obligatorios." });

  let connection;
  try {
    connection = await db.getConnection();
    const [existing] = await connection.query("SELECT id_usuario FROM usuarios WHERE correo_electronico = ? OR cedula = ?", [correo_electronico, cedula]);
    if (existing.length > 0) return res.status(409).json({ message: "El correo o la cédula ya están registrados." });

    const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);

    await connection.query(
      `INSERT INTO usuarios (nombre, apellido, cedula, telefono, correo_electronico, contrasena_hash, id_rol, estado) VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo')`,
      [nombre, apellido, cedula, telefono || "No registrado", correo_electronico, contrasena_hash, id_rol]
    );
    res.status(201).json({ message: "Personal registrado exitosamente." });
  } catch (error) { res.status(500).json({ message: "Error al registrar." }); } 
  finally { if (connection) connection.release(); }
};

// 2. LOGIN (Corregido: Filtra por correo electrónico)
export const loginUsuario = async (req, res) => {
  const { correo_electronico, contrasena } = req.body;
  let connection;
  try {
    connection = await db.getConnection();

    // ERROR CORREGIDO: Faltaba el WHERE correo_electronico = ?
    const [users] = await connection.query(
      `SELECT u.id_usuario, u.nombre, u.contrasena_hash, u.id_rol, u.estado, r.nombre_rol 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.correo_electronico = ?`, 
      [correo_electronico]
    );

    if (users.length === 0) return res.status(401).json({ message: "Credenciales inválidas." });

    const user = users[0];
    // CORRECCIÓN: MySQL guarda 'Inactivo', no 'INACTIVO'
    if (user.estado === "Inactivo") return res.status(403).json({ message: "Esta cuenta ha sido desactivada. Contacte a Sistemas." });

    const isMatch = await bcrypt.compare(contrasena, user.contrasena_hash);
    if (!isMatch) return res.status(401).json({ message: "Credenciales inválidas." });

    const token = jwt.sign({ id_usuario: user.id_usuario, id_rol: user.id_rol }, JWT_SECRET, { expiresIn: "1d" });

    res.status(200).json({ message: "Login exitoso.", token, usuario: { id: user.id_usuario, rol: user.nombre_rol, nombre: user.nombre } });
  } catch (error) { res.status(500).json({ message: "Error en el servidor." }); } 
  finally { if (connection) connection.release(); }
};

// 3. OBTENER DIRECTORIO
export const obtenerUsuarios = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [users] = await connection.query(
      `SELECT id_usuario, nombre, apellido, cedula, telefono, correo_electronico, estado, 
       DATE_FORMAT(fecha_creacion, '%d-%m-%Y %H:%i') as fecha, u.id_rol, IFNULL(r.nombre_rol, 'Sin Rol') as nombre_rol 
       FROM usuarios u LEFT JOIN roles r ON u.id_rol = r.id_rol ORDER BY id_usuario DESC`
    );
    res.status(200).json(users);
  } catch (error) { res.status(500).json({ message: "Error al obtener usuarios." }); } 
  finally { if (connection) connection.release(); }
};

// 4. ACTUALIZAR DATOS DE USUARIO (Editar Completo)
export const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, cedula, telefono, correo_electronico, estado } = req.body;

  if (!nombre || !apellido || !correo_electronico) return res.status(400).json({ message: "Faltan datos obligatorios." });

  let connection;
  try {
    connection = await db.getConnection();
    const [result] = await connection.query(
      `UPDATE usuarios SET nombre=?, apellido=?, cedula=?, telefono=?, correo_electronico=?, estado=? WHERE id_usuario=?`,
      [nombre, apellido, cedula, telefono || null, correo_electronico, estado, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: "Usuario no encontrado." });
    res.status(200).json({ message: "Usuario actualizado." });
  } catch (error) { res.status(500).json({ message: "Error al actualizar usuario." }); } 
  finally { if (connection) connection.release(); }
};

// 5. ELIMINAR USUARIO DEFINITIVAMENTE
export const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.query(`DELETE FROM usuarios WHERE id_usuario = ?`, [id]);
    res.status(200).json({ message: "Usuario eliminado correctamente del sistema." });
  } catch (error) {
    res.status(409).json({ message: "No se puede eliminar porque ya tiene registros asociados. En su lugar, Inactívelo." });
  } finally { if (connection) connection.release(); }
};

// =======================================================
// CAMBIAR ESTADO USUARIO (Toggle Activo/Inactivo)
// =======================================================
export const cambiarEstadoUsuario = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body; 

  let connection;
  try {
    connection = await db.getConnection();
    await connection.query(
      `UPDATE usuarios SET estado = ? WHERE id_usuario = ?`,
      [estado, id]
    );
    res.status(200).json({ message: `Estado actualizado a ${estado}.` });
  } catch (error) {
    res.status(500).json({ message: "Error al cambiar el estado del usuario." });
  } finally {
    if (connection) connection.release();
  }
};

// 6. CAMBIAR CONTRASEÑA (Mi Perfil)
export const cambiarPassword = async (req, res) => {
  const { id_usuario, password_actual, password_nueva } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    const [users] = await connection.query(`SELECT contrasena_hash FROM usuarios WHERE id_usuario = ?`, [id_usuario]);
    if (users.length === 0) return res.status(404).json({ message: "Usuario no encontrado." });

    const isMatch = await bcrypt.compare(password_actual, users[0].contrasena_hash);
    if (!isMatch) return res.status(400).json({ message: "La contraseña actual es incorrecta." });

    const nuevoHash = await bcrypt.hash(password_nueva, saltRounds);
    await connection.query(`UPDATE usuarios SET contrasena_hash = ? WHERE id_usuario = ?`, [nuevoHash, id_usuario]);

    res.status(200).json({ message: "Contraseña actualizada exitosamente." });
  } catch (error) { res.status(500).json({ message: "Error al cambiar contraseña." }); } 
  finally { if (connection) connection.release(); }
};