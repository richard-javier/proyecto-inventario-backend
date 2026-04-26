import db from "../config/db.js";

// 1. OBTENER LOTES PENDIENTES
export const obtenerLotesPendientes = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT L.*, P.sku, P.nombre_producto, P.marca 
       FROM lotes_importacion L
       JOIN productos P ON L.id_producto = P.id_producto
       WHERE L.estado = 'CREADO'`
    );
    res.json(rows);
  } catch (error) {
    console.error("❌ Error al obtener lotes:", error);
    res.status(500).json({ message: "Error interno." });
  }
};

// 2. PROCESAR EL PALLET Y ACTUALIZAR INVENTARIO (MÁGICO)
export const registrarIngresoFormal = async (req, res) => {
  const { cabecera, itemRecibido } = req.body;
  const id_usuario = req.usuario?.id_usuario || 1; 

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction(); 

    // A) Guardar el historial de ingreso
    await connection.query(
      `INSERT INTO ingresos 
      (id_usuario, id_lote_planificado, proveedor, nro_documento, dui, id_bodega_destino, placa_vehiculo, id_aforo, guardias_armados, ubicacion_bodega, cantidad_ingresada, costo_unitario, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, itemRecibido.id_lote_planificado, cabecera.proveedor, cabecera.nro_documento, cabecera.dui, 
        cabecera.id_bodega, cabecera.placa_vehiculo || 'N/A', cabecera.id_aforo, cabecera.guardias_armados || 0, 
        itemRecibido.id_ubicacion, itemRecibido.cantidad_ingresar, itemRecibido.costo_unitario, cabecera.observaciones || ''
      ]
    );

    // B) Bloquear la ubicación física en el rack
    await connection.query("UPDATE cat_ubicaciones SET estado = 'OCUPADO' WHERE id_ubicacion = ?", [itemRecibido.id_ubicacion]);

    // C) Actualizar el catálogo (Stock, Precio y Ubicación)
    await connection.query(
      `UPDATE productos 
       SET stock_actual = stock_actual + ?, precio = ?, 
           ubicacion_bodega = CASE 
               WHEN ubicacion_bodega = 'Por Asignar' THEN ? 
               WHEN ubicacion_bodega LIKE CONCAT('%', ?, '%') THEN ubicacion_bodega 
               ELSE CONCAT(ubicacion_bodega, ', ', ?) 
           END
       WHERE id_producto = ?`,
      [itemRecibido.cantidad_ingresar, itemRecibido.costo_unitario, itemRecibido.id_ubicacion, itemRecibido.id_ubicacion, itemRecibido.id_ubicacion, itemRecibido.id_producto]
    );

    // D) Sumar 1 pallet al control del Lote
    await connection.query("UPDATE lotes_importacion SET pallets_ingresados = pallets_ingresados + 1 WHERE id_lote = ?", [itemRecibido.id_lote_planificado]);
    
    // E) Verificar si ya llegaron TODOS los pallets. Si sí, cerrar el lote.
    const [checkLote] = await connection.query("SELECT pallets_ingresados, total_pallets FROM lotes_importacion WHERE id_lote = ?", [itemRecibido.id_lote_planificado]);
    if (checkLote[0].pallets_ingresados >= checkLote[0].total_pallets) {
        await connection.query("UPDATE lotes_importacion SET estado = 'INGRESADO' WHERE id_lote = ?", [itemRecibido.id_lote_planificado]);
    }

    await connection.commit(); 
    res.status(201).json({ message: `✅ Pallet ingresado en ${itemRecibido.id_ubicacion}. Inventario actualizado.` });
  } catch (error) {
    if (connection) await connection.rollback(); 
    console.error("❌ Error interno:", error);
    res.status(500).json({ message: "Error interno al procesar el Pallet." });
  } finally {
    if (connection) connection.release();
  }
};