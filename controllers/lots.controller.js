import db from "../config/db.js";

// CREAR UN NUEVO LOTE PLANIFICADO
export const crearLote = async (req, res) => {
    // Recibimos todos los datos de React (Incluyendo el SKU)
    const { id_producto, sku, marca, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets } = req.body;

    try {
        // 1. Generar la nomenclatura del Lote (Ej: PRI-2604001)
        const fecha = new Date();
        const year = fecha.getFullYear().toString().slice(-2); // Año: 26
        const month = (fecha.getMonth() + 1).toString().padStart(2, '0'); // Mes: 04
        
        // Tomamos las primeras 3 letras del SKU (Ej: ZEB)
        const prefix = sku ? sku.substring(0, 3).toUpperCase() : 'LOT';

        // Contamos cuántos lotes se han hecho hoy para hacer el secuencial (001, 002...)
        const [rows] = await db.query("SELECT COUNT(*) as count FROM lotes_planificados WHERE DATE(fecha_creacion) = CURDATE()");
        const secuencial = (rows[0].count + 1).toString().padStart(3, '0');

        // Construimos los 3 códigos oficiales
        const lote_base = `${prefix}-${year}${month}${secuencial}`;
        const lote_masterbox = `MB-${lote_base}`;
        const lote_pallet = `PLT-${lote_base}`;

        // 2. Guardar en la Base de Datos
        const [result] = await db.query(
            `INSERT INTO lotes_planificados 
            (id_producto, marca, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets, lote_base, lote_masterbox, lote_pallet, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREADO')`,
            [id_producto, marca, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets, lote_base, lote_masterbox, lote_pallet]
        );

        // 3. Responder al Frontend con JSON puro
        res.status(201).json({
            id_lote: result.insertId,
            lote_base,
            lote_masterbox,
            lote_pallet
        });

    } catch (error) {
        console.error("Error en crearLote:", error);
        // Si hay error, devolvemos JSON para que React NO se rompa con HTML
        res.status(500).json({ message: "Error interno del servidor al crear el lote.", error: error.message });
    }
};

// OBTENER HISTORIAL PARA LA TABLA INFERIOR
export const obtenerHistorialLotes = async (req, res) => {
    try {
        // Hacemos JOIN con la tabla de productos para obtener el nombre y el SKU real
        const [rows] = await db.query(`
            SELECT l.*, p.sku, p.nombre_producto 
            FROM lotes_planificados l
            JOIN productos p ON l.id_producto = p.id_producto
            ORDER BY l.fecha_creacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener historial:", error);
        res.status(500).json({ message: "Error al obtener historial" });
    }
};