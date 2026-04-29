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
// Guardar una nueva Nota de Ingreso
export const guardarNotaIngreso = async (req, res) => {
    const { nota, productos } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction(); // Iniciamos transacción por seguridad

        // 1. Obtener el último secuencial para generar el siguiente (Ej: 0001)
        const [lastNote] = await connection.query("SELECT secuencial FROM notas_ingreso ORDER BY id_nota DESC LIMIT 1");
        let nuevoSecuencial = "0001";
        if (lastNote.length > 0) {
            const ultimoNum = parseInt(lastNote[0].secuencial, 10);
            nuevoSecuencial = (ultimoNum + 1).toString().padStart(4, '0');
        }

        // 2. Insertar la Cabecera
        const [resNota] = await connection.query(
            `INSERT INTO notas_ingreso (secuencial, fecha, hora, proveedor, orden_compra, proviene_de, estado_mercaderia, placa_vehiculo, aforo, observaciones, entregado_nombre, entregado_cargo, recibido_nombre, recibido_cargo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nuevoSecuencial, nota.fecha, nota.hora, nota.proveedor, nota.ordenCompra, nota.provieneDe, nota.estadoMercaderia, nota.placaVehiculo, nota.aforo, nota.observaciones, nota.entregadoPor.nombre, nota.entregadoPor.cargo, nota.recibidoPor.nombre, nota.recibidoPor.cargo]
        );

        const idNotaGenerada = resNota.insertId;

        // 3. Insertar los detalles (el arreglo de productos)
        const detalleQueries = productos.map(p => {
            return connection.query(
                `INSERT INTO notas_ingreso_detalle (id_nota, perdida, recibida, pendiente, descripcion_producto, guia_secuencial) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [idNotaGenerada, p.perdida, p.recibida, p.pendiente, p.descripcion, p.guia]
            );
        });

        await Promise.all(detalleQueries);

        await connection.commit(); // Todo bien, guardamos cambios físicos
        res.status(201).json({ message: "✅ Nota de Ingreso guardada con éxito", secuencial: nuevoSecuencial });

    } catch (error) {
        if (connection) await connection.rollback(); // Error, deshacemos todo
        console.error(error);
        res.status(500).json({ message: "Error al procesar el ingreso." });
    } finally {
        if (connection) connection.release();
    }
};

// Obtener todas las notas para la trazabilidad (Reporte)
export const obtenerHistorialNotas = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM notas_ingreso ORDER BY secuencial DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener historial." });
    }
};
// 1. Obtener todas las notas (Cabecera) para la tabla principal
export const obtenerNotasIngreso = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM notas_ingreso ORDER BY fecha_registro DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el historial de notas." });
    }
};

// 2. Obtener UNA nota con sus detalles (Para volver a generar el PDF)
export const obtenerDetalleNota = async (req, res) => {
    const { id } = req.params;
    try {
        const [cabecera] = await db.query("SELECT * FROM notas_ingreso WHERE id_nota = ?", [id]);
        const [detalles] = await db.query("SELECT * FROM notas_ingreso_detalle WHERE id_nota = ?", [id]);
        
        if (cabecera.length === 0) return res.status(404).json({ message: "Nota no encontrada" });

        res.json({ cabecera: cabecera[0], productos: detalles });
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el detalle." });
    }
};