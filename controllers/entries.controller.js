// backend-inventario/controllers/entries.controller.js
import db from "../config/db.js";

export const registrarIngreso = async (req, res) => {
  const { id_producto, cantidad, placa_vehiculo, nombre_chofer, observaciones } = req.body;
  const id_usuario = req.usuario.id_usuario; // Lo tomamos del Token (Seguridad)

  // Validación básica
  if (!id_producto || !cantidad || cantidad <= 0) {
    return res.status(400).json({ message: "Datos incompletos o cantidad inválida." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    // 1. INICIAR TRANSACCIÓN (Todo o nada)
    await connection.beginTransaction();

    // 2. Registrar el historial en la tabla 'ingresos'
    await connection.query(
      `INSERT INTO ingresos (id_producto, cantidad, placa_vehiculo, nombre_chofer, observaciones, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id_producto, cantidad, placa_vehiculo, nombre_chofer, observaciones, id_usuario]
    );

    // 3. Actualizar el Stock en la tabla 'productos' (Sumar)
    await connection.query(
      `UPDATE productos SET stock_actual = stock_actual + ? WHERE id_producto = ?`,
      [cantidad, id_producto]
    );

    // 4. CONFIRMAR CAMBIOS
    await connection.commit();

    res.status(201).json({ message: "✅ Ingreso registrado y Stock actualizado." });

  } catch (error) {
    // Si algo falla, deshacer todo
    if (connection) await connection.rollback();
    console.error("Error en ingreso:", error);
    res.status(500).json({ message: "Error al procesar el ingreso." });
  } finally {
    if (connection) connection.release();
  }
};