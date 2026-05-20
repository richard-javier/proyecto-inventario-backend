import db from "../config/db.js";
import axios from "axios"; 
import nodemailer from "nodemailer";

// ==========================================
// CONFIGURACIÓN DE CORREOS
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'rjcp1420l@gmail.com', // <-- PON TU CORREO
        pass: 'nkrs gwwi ljon jtfa' // <-- PON TU CLAVE
    }
});

// 1. CONTROLADOR PRINCIPAL DE SALIDAS
export const registrarSalidaFormal = async (req, res) => {
    const { cabecera, origen, items, ignorarIA } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction(); 

        // Trazabilidad: Obtenemos el ID del usuario desde el token (inyectado por el middleware)
        const id_usuario_token = req.usuario ? req.usuario.id_usuario : null;
        let nombreResponsable = "Usuario Desconocido";

        if (id_usuario_token) {
            const [userDb] = await connection.query("SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?", [id_usuario_token]);
            if (userDb.length > 0) {
                nombreResponsable = `${userDb[0].nombre} ${userDb[0].apellido}`;
            }
        }

        let cantidadTotal = 0;
        let precioSuma = 0;

        items.forEach(item => {
            cantidadTotal += parseInt(item.cantidad);
            precioSuma += (parseFloat(item.precio) * parseInt(item.cantidad));
        });
        let precioPromedio = cantidadTotal > 0 ? (precioSuma / cantidadTotal) : 0;

        // =========================================================
        // AUDITORÍA IA
        // =========================================================
        if (!ignorarIA) {
            try {
                const iaResponse = await axios.post('http://localhost:5000/detectar_anomalia', {
                    cantidad: cantidadTotal,
                    precio: precioPromedio,
                    motor_ia: 'ISO'
                });

                if (iaResponse.data.es_anomalia) {
                    await connection.rollback(); // Protegemos bodega

                    const payloadCongelado = JSON.stringify({ cabecera, origen, items });
                    
                    // 🛡️ AQUÍ ESTÁ EL CAMBIO: Guardamos el 'nombreResponsable' real
                    await connection.query(
                        `INSERT INTO auditoria_ia (destino, cantidad_total, motor_ia, estado, payload_salida, nombre_usuario) VALUES (?, ?, ?, 'PENDIENTE', ?, ?)`,
                        [cabecera.punto_destino, cantidadTotal, iaResponse.data.motor_utilizado, payloadCongelado, nombreResponsable]
                    );

                    const mailOptions = {
                        from: '"SINCOT IA Security" <seguridad@sincot.com>',
                        to: 'rjcp142000@hotmail.com', 
                        subject: '⚠️ URGENTE: Anomalía Logística Bloqueada',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #d93025; border-radius: 10px;">
                                <h2 style="color: #d93025;">PREVENCIÓN DE FRAUDE - SINCOT AI</h2>
                                <p>El motor <strong>${iaResponse.data.motor_utilizado}</strong> ha bloqueado una transacción inusual intentada por <strong>${nombreResponsable}</strong>.</p>
                                <ul>
                                    <li><strong>Destino:</strong> ${cabecera.punto_destino}</li>
                                    <li><strong>Cantidad Total:</strong> ${cantidadTotal} unidades</li>
                                </ul>
                                <a href="http://localhost:5173/ai-audit" style="background-color: #1a73e8; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Revisar en el Sistema</a>
                            </div>
                        `
                    };

                    await transporter.sendMail(mailOptions);
                    
                    return res.status(403).json({ 
                        message: `⚠️ ALERTA DE IA: La salida genera un patrón anómalo. Se ha notificado a Gerencia.` 
                    });
                }
            } catch (iaError) {
                console.error("Error conectando con IA:", iaError.message);
                await connection.rollback();
                return res.status(503).json({ message: "❌ Error de conexión con el Motor de IA." });
            }
        }

        // =========================================================
        // GUARDADO NORMAL
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

// 2. OBTENER AUDITORÍAS (Actualizado con detalles completos de productos)
export const obtenerAuditorias = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const [rows] = await connection.query(`
            SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') as fecha, 
            IFNULL(nombre_usuario, 'Usuario Desconocido') as usuario, 
            destino, cantidad_total as cantidad, 
            motor_ia as motor, estado, payload_salida 
            FROM auditoria_ia ORDER BY id DESC
        `);

        // Traducimos el payload_salida para que React lo pueda leer fácilmente
        const auditoriasDetalladas = rows.map(row => {
            let detalles = { bodega: 'Desconocida', items: [] };
            try {
                if (row.payload_salida) {
                    const payload = typeof row.payload_salida === 'string' ? JSON.parse(row.payload_salida) : row.payload_salida;
                    detalles.bodega = payload.origen?.bodega || 'Desconocida';
                    detalles.items = payload.items || [];
                }
            } catch (e) { console.error("Error al leer payload de auditoría", e); }
            
            return {
                ...row,
                bodega_origen: detalles.bodega,
                productos: detalles.items
            };
        });

        res.json(auditoriasDetalladas);
    } catch (error) {
        console.error("Error auditoria:", error);
        res.status(500).json({ message: "Error al obtener auditorías." });
    } finally {
        if (connection) connection.release();
    }
};

// 3. RESOLVER AUDITORÍAS
export const resolverAuditoria = async (req, res) => {
    const { id_auditoria, accion } = req.body;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(`UPDATE auditoria_ia SET estado = ? WHERE id = ?`, [accion, id_auditoria]);

        if (accion === 'APROBADO') {
            const [rows] = await connection.query(`SELECT payload_salida FROM auditoria_ia WHERE id = ?`, [id_auditoria]);
            if (rows.length > 0) {
                const payload = typeof rows[0].payload_salida === 'string' ? JSON.parse(rows[0].payload_salida) : rows[0].payload_salida;
                const { cabecera, items } = payload;

                const [resSalida] = await connection.query(
                    `INSERT INTO salidas (punto_destino, motivo, transportista, placa_vehiculo, observaciones) VALUES (?, ?, ?, ?, ?)`,
                    [cabecera.punto_destino, cabecera.motivo, cabecera.transportista || 'N/A', cabecera.placa_vehiculo || 'N/A', 'AUTORIZADO POR GERENCIA IA. ' + (cabecera.observaciones || '')]
                );

                const id_salida = resSalida.insertId;

                const detalleQueries = items.map(item => {
                    connection.query(`INSERT INTO salidas_detalle (id_salida, id_producto, cantidad, precio_salida) VALUES (?, ?, ?, ?)`, [id_salida, item.id_producto, item.cantidad, item.precio]);
                    return connection.query(`UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ?`, [item.cantidad, item.id_producto]);
                });
                await Promise.all(detalleQueries);
            }
        }

        await connection.commit();
        res.status(200).json({ message: `Despacho ${accion} correctamente.` });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: "Error al resolver la auditoría." });
    } finally {
        if (connection) connection.release();
    }
};