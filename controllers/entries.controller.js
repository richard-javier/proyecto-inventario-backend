import db from "../config/db.js";

// 1. OBTENER LOTES PENDIENTES (Para el escáner)
export const obtenerLotesPendientes = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT l.*, p.nombre_producto, p.sku 
            FROM lotes_planificados l
            JOIN productos p ON l.id_producto = p.id_producto
            WHERE l.estado IN ('CREADO', 'EN_PROCESO')
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener lotes pendientes:", error);
        res.status(500).json({ message: "Error interno al consultar lotes.", error: error.message });
    }
};

// 2. REGISTRAR INGRESO FÍSICO EN PERCHA (El escáner WMS)
export const registrarIngresoFormal = async (req, res) => {
    const { cabecera, itemRecibido } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // A) Guardar en la nueva tabla de ingresos WMS (Historial de qué entró y dónde)
        await connection.query(
            `INSERT INTO ingresos_fisicos_pallets 
            (id_bodega, id_lote_planificado, id_producto, cantidad, costo_unitario, id_ubicacion, tipo_asignacion) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                cabecera.id_bodega, 
                itemRecibido.id_lote_planificado, 
                itemRecibido.id_producto, 
                itemRecibido.cantidad_ingresar, 
                itemRecibido.costo_unitario, 
                itemRecibido.id_ubicacion, 
                itemRecibido.tipo_asignacion || 'Dinámica'
            ]
        );

        // B) ¡LA MAGIA DEL WMS! Bloquear la ubicación física para que no vuelva a aparecer en React
        await connection.query(
            `UPDATE cat_ubicaciones SET estado = 'OCUPADO' WHERE id_ubicacion = ?`, 
            [itemRecibido.id_ubicacion]
        );

        // C) Actualizar el stock físico general del producto (+ cantidad ingresada)
        await connection.query(
            `UPDATE productos SET stock_actual = stock_actual + ? WHERE id_producto = ?`,
            [itemRecibido.cantidad_ingresar, itemRecibido.id_producto]
        );

        // D) Actualizar el progreso del lote (Saber si ya terminamos de guardar todos los pallets)
        const [loteData] = await connection.query(
            `SELECT pallets_ingresados, total_pallets FROM lotes_planificados WHERE id_lote = ?`, 
            [itemRecibido.id_lote_planificado]
        );
        
        const palletsActuales = loteData[0].pallets_ingresados + 1;
        const totalPallets = loteData[0].total_pallets;
        
        const nuevoEstado = palletsActuales >= totalPallets ? 'INGRESADO' : 'EN_PROCESO';

        await connection.query(
            `UPDATE lotes_planificados SET pallets_ingresados = ?, estado = ? WHERE id_lote = ?`,
            [palletsActuales, nuevoEstado, itemRecibido.id_lote_planificado]
        );

        await connection.commit();
        res.status(201).json({ message: "Pallet ingresado exitosamente al sistema." });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error crítico en registrarIngresoFormal:", error);
        res.status(500).json({ message: "Error interno del servidor al procesar el ingreso." });
    } finally {
        if (connection) connection.release();
    }
};