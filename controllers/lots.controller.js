import db from "../config/db.js";

// Función auxiliar para sumar letras (AAA -> AAB)
const siguienteSecuencia = (secuencia) => {
    let chars = secuencia.split('');
    for (let i = 2; i >= 0; i--) {
        if (chars[i] === 'Z') {
            chars[i] = 'A';
        } else {
            chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
            break;
        }
    }
    return chars.join('');
};

// 1. CREAR LOTE NUEVO
export const crearLote = async (req, res) => {
    const { id_producto, marca, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets } = req.body;
    
    // Extraer el prefijo de 3 letras de la marca de forma segura
    const prefijo = marca.replace(/[^A-Z]/ig, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query("SELECT ultima_secuencia FROM secuencias_marcas WHERE prefijo_marca = ?", [prefijo]);
        
        let secuencia_usar = 'AAA';
        let nueva_secuencia = 'AAB';

        if (rows.length > 0) {
            secuencia_usar = rows[0].ultima_secuencia;
            nueva_secuencia = siguienteSecuencia(secuencia_usar);
            await connection.query("UPDATE secuencias_marcas SET ultima_secuencia = ? WHERE prefijo_marca = ?", [nueva_secuencia, prefijo]);
        } else {
            await connection.query("INSERT INTO secuencias_marcas (prefijo_marca, ultima_secuencia) VALUES (?, ?)", [prefijo, nueva_secuencia]);
        }

        const lote_base = `${prefijo}${secuencia_usar}`;
        const lote_masterbox = `${lote_base}M`;
        const lote_pallet = `${lote_base}P`;

        await connection.query(
            `INSERT INTO lotes_importacion (id_producto, lote_base, lote_masterbox, lote_pallet, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id_producto, lote_base, lote_masterbox, lote_pallet, cantidad_total, unidades_por_mb, total_mb, unidades_por_pallet, total_pallets]
        );

        await connection.commit();
        res.status(201).json({ message: "Lote generado exitosamente", lote_base, lote_masterbox, lote_pallet });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error al crear lote:", error);
        res.status(500).json({ message: "Error interno al generar el lote secuencial." });
    } finally {
        if (connection) connection.release();
    }
};

// 2. NUEVO: OBTENER HISTORIAL DE LOTES PLANIFICADOS
export const obtenerHistorialLotes = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT L.*, P.sku, P.nombre_producto, P.marca 
             FROM lotes_importacion L
             JOIN productos P ON L.id_producto = P.id_producto
             ORDER BY L.fecha_creacion DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener historial de lotes:", error);
        res.status(500).json({ message: "Error al cargar historial." });
    }
};