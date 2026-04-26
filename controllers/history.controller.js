import db from "../config/db.js";

export const obtenerHistorial = async (req, res) => {
  try {
    // 1. OBTENER INGRESOS (Con la nueva estructura WMS)
    // Usamos 'AS' para traducir los nombres de la BD a lo que React y la gráfica esperan leer
    const queryIngresos = `
      SELECT 
        i.id_ingreso AS id_movimiento,
        'INGRESO' AS tipo_movimiento,
        i.fecha_arribo AS fecha,
        i.cantidad_ingresada AS cantidad,
        p.nombre_producto,
        p.sku,
        i.observaciones
      FROM ingresos i
      JOIN lotes_importacion l ON i.id_lote_planificado = l.id_lote
      JOIN productos p ON l.id_producto = p.id_producto
    `;
    
    const [ingresos] = await db.query(queryIngresos);

    // 2. OBTENER SALIDAS (Bloque seguro por si aún no hemos actualizado esa tabla)
    let salidas = [];
    try {
        const [rowsSalidas] = await db.query(`
            SELECT 
                id_salida AS id_movimiento,
                'SALIDA' AS tipo_movimiento,
                fecha_salida AS fecha,
                cantidad,
                'Salida de Bodega' AS observaciones
            FROM salidas
        `);
        salidas = rowsSalidas;
    } catch (e) {
        // Si la tabla salidas no existe o tiene otra estructura temporalmente, no rompe el sistema
        console.log("Aviso: Tabla salidas pendiente de sincronización.");
    }

    // 3. UNIFICAR Y ORDENAR
    // Juntamos ingresos y salidas, y los ordenamos del más reciente al más antiguo
    const historialCompleto = [...ingresos, ...salidas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(historialCompleto);
  } catch (error) {
    console.error("❌ Error al obtener historial:", error);
    res.status(500).json({ message: "Error al cargar historial." });
  }
};