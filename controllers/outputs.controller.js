import db from "../config/db.js";
import axios from "axios"; 

export const registrarSalidaFormal = async (req, res) => {
    // 1. AHORA RECIBIMOS LA VARIABLE "ignorarIA" DESDE REACT
    const { cabecera, items, ignorarIA } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // =========================================================
        // 2. AUDITORÍA IA (SOLO SE EJECUTA SI NO HAY UN BYPASS)
        // =========================================================
        if (!ignorarIA) {
            for (let item of items) {
                try {
                    const iaResponse = await axios.post('http://localhost:5000/detectar_anomalia', {
                        cantidad: item.cantidad,
                        precio: item.precio
                    });

                    if (iaResponse.data.es_anomalia) {
                        await connection.rollback(); 
                        return res.status(400).json({ 
                            message: `⚠️ ALERTA DE IA: La salida de ${item.cantidad} uds del producto ${item.sku} a $${item.precio} genera un total anómalo para el historial. Si es un pedido legítimo, autorice la excepción.` 
                        });
                    }
                } catch (iaError) {
                    console.error("Error conectando con IA:", iaError.message);
                    await connection.rollback();
                    return res.status(503).json({ message: "❌ Error de conexión con el Motor de IA." });
                }
            }
        }

        // =========================================================
        // 3. GUARDAMOS EN MYSQL
        // =========================================================
        const [resSalida] = await connection.query(
            `INSERT INTO salidas (punto_destino, motivo, transportista, placa_vehiculo, observaciones) VALUES (?, ?, ?, ?, ?)`,
            [cabecera.punto_destino, cabecera.motivo, cabecera.transportista || 'N/A', cabecera.placa_vehiculo || 'N/A', cabecera.observaciones || '']
        );

        const id_salida = resSalida.insertId;

        const detalleQueries = items.map(item => {
            connection.query(
                `INSERT INTO salidas_detalle (id_salida, id_producto, cantidad, precio_salida) VALUES (?, ?, ?, ?)`,
                [id_salida, item.id_producto, item.cantidad, item.precio]
            );
            return connection.query(
                `UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ?`,
                [item.cantidad, item.id_producto]
            );
        });

        await Promise.all(detalleQueries);
        await connection.commit();
        
        res.status(201).json({ message: "✅ Despacho procesado con éxito." });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en salida:", error);
        res.status(500).json({ message: "Error interno al procesar el despacho.", error: error.message });
    } finally {
        if (connection) connection.release();
    }
};