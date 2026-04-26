import db from "../config/db.js";

export const registrarSalida = async (req, res) => {
  const { cabecera, items } = req.body; 
  
  if (!req.usuario || !req.usuario.id_usuario) {
      return res.status(401).json({ message: "No autorizado." });
  }
  const id_usuario = req.usuario.id_usuario;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: "No hay productos para despachar." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    for (const item of items) {
      // 1. Verificar stock disponible por seguridad (Doble validación)
      const [prod] = await connection.query("SELECT stock_actual, nombre_producto FROM productos WHERE id_producto = ?", [item.id_producto]);
      
      if (prod[0].stock_actual < item.cantidad) {
          throw new Error(`Stock insuficiente para ${prod[0].nombre_producto}. Disponible: ${prod[0].stock_actual}`);
      }

      // 2. Registrar en tabla salidas
      await connection.query(
        `INSERT INTO salidas 
        (id_producto, cantidad, precio_venta, punto_destino, motivo, placa_vehiculo, observaciones, id_usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id_producto, 
          item.cantidad, 
          item.precio, 
          cabecera.punto_destino, 
          cabecera.motivo,
          cabecera.placa_vehiculo,
          cabecera.observaciones, 
          id_usuario
        ]
      );

      // 3. Restar stock físico
      await connection.query(
        "UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ?",
        [item.cantidad, item.id_producto]
      );
    }

    await connection.commit();
    res.status(201).json({ message: "✅ Despacho masivo procesado exitosamente." });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error en salida masiva:", error.message);
    res.status(400).json({ message: error.message || "Error al procesar el despacho." });
  } finally {
    if (connection) connection.release();
  }
};