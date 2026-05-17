import db from "../config/db.js";

export const obtenerHistorial = async (req, res) => {
    try {
        const query = `
            SELECT 
                i.fecha_registro AS fecha,
                'INGRESO' AS tipo_movimiento,
                p.nombre_producto,
                p.sku AS codigo_barras,
                i.cantidad,
                CONCAT('Bodega: ', i.id_bodega) AS origen_destino,
                'Recepción WMS' AS documento_motivo,
                'Bodeguero WMS' AS responsable,
                CONCAT('Estibado en: ', i.id_ubicacion) AS observaciones
            FROM ingresos_fisicos_pallets i
            JOIN productos p ON i.id_producto = p.id_producto
            
            UNION ALL
            
            SELECT 
                s.fecha_registro AS fecha,
                'SALIDA' AS tipo_movimiento,
                p.nombre_producto,
                p.sku AS codigo_barras,
                sd.cantidad,
                s.punto_destino AS origen_destino,
                s.motivo AS documento_motivo,
                s.transportista AS responsable,
                s.observaciones
            FROM salidas s
            JOIN salidas_detalle sd ON s.id_salida = sd.id_salida
            JOIN productos p ON sd.id_producto = p.id_producto
            
            ORDER BY fecha DESC
        `;
        
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener el Kardex:", error);
        res.status(500).json({ message: "Error interno al consultar el historial.", error: error.message });
    }
};