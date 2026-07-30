import db from "../config/db.js";
import axios from "axios"; 
import { asegurarTablaSeriales } from "./serials.controller.js";
import { getEmailFrom, getFrontendUrl, sendMail } from "../config/mailer.js";

const IA_BASE_URL = process.env.IA_BASE_URL || "http://127.0.0.1:5000";

const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const asegurarTablaAuditoriaIA = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS auditoria_ia (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            destino VARCHAR(255),
            cantidad_total INT NOT NULL DEFAULT 0,
            motor_ia VARCHAR(100),
            estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
            payload_salida JSON,
            nombre_usuario VARCHAR(160),
            INDEX idx_estado (estado),
            INDEX idx_fecha (fecha)
        )
    `);

    const columnasNecesarias = [
        ["fecha", "ALTER TABLE auditoria_ia ADD COLUMN fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
        ["destino", "ALTER TABLE auditoria_ia ADD COLUMN destino VARCHAR(255)"],
        ["cantidad_total", "ALTER TABLE auditoria_ia ADD COLUMN cantidad_total INT NOT NULL DEFAULT 0"],
        ["motor_ia", "ALTER TABLE auditoria_ia ADD COLUMN motor_ia VARCHAR(100)"],
        ["estado", "ALTER TABLE auditoria_ia ADD COLUMN estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'"],
        ["payload_salida", "ALTER TABLE auditoria_ia ADD COLUMN payload_salida JSON"],
        ["nombre_usuario", "ALTER TABLE auditoria_ia ADD COLUMN nombre_usuario VARCHAR(160)"]
    ];

    for (const [columna, alterSql] of columnasNecesarias) {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS existe
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'auditoria_ia'
               AND COLUMN_NAME = ?`,
            [columna]
        );

        if (rows[0].existe === 0) {
            await connection.query(alterSql);
        }
    }
};

const registrarBloqueoIA = async ({
    connection,
    cabecera,
    origen,
    items,
    cantidadTotal,
    motorIA,
    nombreResponsable,
    motivoDeteccion
}) => {
    const payloadCongelado = JSON.stringify({ cabecera, origen, items });

    const [auditoriaResult] = await connection.query(
        `INSERT INTO auditoria_ia (destino, cantidad_total, motor_ia, estado, payload_salida, nombre_usuario) VALUES (?, ?, ?, 'PENDIENTE', ?, ?)`,
        [cabecera.punto_destino, cantidadTotal, motorIA, payloadCongelado, nombreResponsable]
    );
    await connection.commit();

    const idAuditoria = auditoriaResult.insertId;
    const frontendUrl = getFrontendUrl();
    const revisarUrl = `${frontendUrl}/ai-audit?auditoria=${idAuditoria}`;
    const aprobarUrl = `${revisarUrl}&accion=aprobar`;
    const rechazarUrl = `${revisarUrl}&accion=rechazar`;
    const destinatarioCorreo = process.env.AI_AUDIT_ALERT_TO;
    let correoEnviado = false;
    let correoMensaje = "No se configuró AI_AUDIT_ALERT_TO para recibir alertas de auditoría IA.";

    const mailOptions = {
        from: getEmailFrom(),
        to: destinatarioCorreo,
        subject: `URGENTE: Anomalía Logística Bloqueada #${idAuditoria}`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #d93025; border-radius: 10px;">
                <h2 style="color: #d93025;">PREVENCIÓN DE FRAUDE - SINCOT AI</h2>
                <p>El motor <strong>${escapeHtml(motorIA)}</strong> ha bloqueado una transacción inusual intentada por <strong>${escapeHtml(nombreResponsable)}</strong>.</p>
                <p><strong>Motivo:</strong> ${escapeHtml(motivoDeteccion)}</p>
                <ul>
                    <li><strong>Auditoría:</strong> #${idAuditoria}</li>
                    <li><strong>Destino:</strong> ${escapeHtml(cabecera.punto_destino)}</li>
                    <li><strong>Cantidad Total:</strong> ${cantidadTotal} unidades</li>
                </ul>
                <p>Abra uno de estos enlaces, inicie sesión si el sistema lo solicita y confirme la resolución en la pantalla de auditoría.</p>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px;">
                    <a href="${aprobarUrl}" style="background-color: #137333; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Aprobar despacho</a>
                    <a href="${rechazarUrl}" style="background-color: #d93025; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Denegar despacho</a>
                    <a href="${revisarUrl}" style="background-color: #1a73e8; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Revisar en el Sistema</a>
                </div>
               </div>`
    };

    try {
        if (destinatarioCorreo) {
            await sendMail(mailOptions);
            correoEnviado = true;
            correoMensaje = `Correo enviado a ${destinatarioCorreo}.`;
        }
    } catch (mailErr) {
        correoMensaje = `El correo de IA no se pudo enviar: ${mailErr.message}`;
        console.error("Aviso:", correoMensaje);
    }

    return { idAuditoria, correoEnviado, correoMensaje };
};

export const registrarSalidaFormal = async (req, res) => {
    const { cabecera, origen, items, ignorarIA } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await asegurarTablaSeriales(connection);
        await asegurarTablaAuditoriaIA(connection);
        await connection.beginTransaction(); 

        const id_usuario_token = req.usuario ? req.usuario.id_usuario : null;
        let nombreResponsable = "Usuario Desconocido";

        if (id_usuario_token) {
            const [userDb] = await connection.query("SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?", [id_usuario_token]);
            if (userDb.length > 0) nombreResponsable = `${userDb[0].nombre} ${userDb[0].apellido}`;
        }

        let cantidadTotal = 0; let precioSuma = 0;
        items.forEach(item => {
            cantidadTotal += parseInt(item.cantidad);
            precioSuma += (parseFloat(item.precio) * parseInt(item.cantidad));
        });
        let precioPromedio = cantidadTotal > 0 ? (precioSuma / cantidadTotal) : 0;

        if (!ignorarIA) {
            try {
                const iaResponse = await axios.post(`${IA_BASE_URL}/detectar_anomalia`, { cantidad: cantidadTotal, precio: precioPromedio, motor_ia: 'ISO' });
                const motorIA = iaResponse.data.motor_utilizado || 'Isolation Forest';
                const detectadoPorModelo = Boolean(iaResponse.data.es_anomalia);

                if (detectadoPorModelo) {
                    const motivoDeteccion = `El modelo ${motorIA} clasificó la salida como anómala.`;

                    const auditoriaIA = await registrarBloqueoIA({
                        connection,
                        cabecera,
                        origen,
                        items,
                        cantidadTotal,
                        motorIA,
                        nombreResponsable,
                        motivoDeteccion
                    });

                    return res.status(403).json({
                        message: auditoriaIA.correoEnviado
                            ? `⚠️ ALERTA DE IA: Esta salida fue detectada como anómala por ${motorIA}. No se puede despachar hasta que Gerencia la autorice en el sistema. Se envió la notificación por correo.`
                            : `⚠️ ALERTA DE IA: Esta salida fue detectada como anómala por ${motorIA}. No se puede despachar hasta que Gerencia la autorice en el sistema, pero el correo no pudo enviarse.`,
                        requiere_autorizacion_gerencia: true,
                        motor_ia: motorIA,
                        id_auditoria: auditoriaIA.idAuditoria,
                        correo_enviado: auditoriaIA.correoEnviado,
                        correo_mensaje: auditoriaIA.correoMensaje
                    });
                }
            } catch (iaError) {
                await connection.rollback();
                return res.status(503).json({ message: "❌ Error de conexión con el Motor de IA." });
            }
        }

        const [resSalida] = await connection.query(
            `INSERT INTO salidas (punto_destino, motivo, transportista, placa_vehiculo, observaciones, usuario_responsable) VALUES (?, ?, ?, ?, ?, ?)`,
            [cabecera.punto_destino, cabecera.motivo, cabecera.transportista || 'N/A', cabecera.placa_vehiculo || 'N/A', cabecera.observaciones || '', nombreResponsable]
        );
        const id_salida = resSalida.insertId;

        // 🚀 CIRUGÍA WMS: Cambiamos a for...of para evitar crash por consultas simultáneas
        for (const item of items) {
            await connection.query(`INSERT INTO salidas_detalle (id_salida, id_producto, cantidad, precio_salida) VALUES (?, ?, ?, ?)`, [id_salida, item.id_producto, item.cantidad, item.precio]);
            
            const [prodData] = await connection.query(`SELECT stock_actual, ubicacion_bodega FROM productos WHERE id_producto = ?`, [item.id_producto]);
            if (prodData.length > 0) {
                const stockRestante = prodData[0].stock_actual - item.cantidad;
                if (stockRestante <= 0) {
                    const ubiVieja = prodData[0].ubicacion_bodega;
                    if (ubiVieja && ubiVieja !== 'Por Asignar' && ubiVieja !== 'Sin Asignar') {
                        await connection.query(`UPDATE cat_ubicaciones SET estado = 'LIBRE' WHERE id_ubicacion = ?`, [ubiVieja]);
                    }
                    await connection.query(`UPDATE productos SET stock_actual = 0, ubicacion_bodega = NULL WHERE id_producto = ?`, [item.id_producto]);
                } else {
                    await connection.query(`UPDATE productos SET stock_actual = ? WHERE id_producto = ?`, [stockRestante, item.id_producto]);
                }
            }

            if (item.codigo) {
                const codigo = item.codigo.toString().trim().toUpperCase();
                let filtroCodigo = "serial = ?";
                if (codigo.startsWith("PLT-")) filtroCodigo = "pallet_lpn = ?";
                if (codigo.startsWith("MB-")) filtroCodigo = "masterbox_lpn = ?";

                await connection.query(
                    `UPDATE seriales_equipos
                     SET estado = 'ENVIADO',
                         punto_destino = ?,
                         motivo_salida = ?,
                         id_salida = ?,
                         fecha_salida = NOW(),
                         bodega_actual = NULL
                     WHERE ${filtroCodigo}
                       AND id_producto = ?
                       AND estado = 'EN_BODEGA'`,
                    [cabecera.punto_destino, cabecera.motivo, id_salida, codigo, item.id_producto]
                );
            }
        }

        await connection.commit(); 
        res.status(201).json({
            message: "✅ Despacho procesado con éxito.",
            id_salida,
            numero_egreso: `NE-${String(id_salida).padStart(6, '0')}`
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en salida:", error);
        res.status(500).json({ message: "Error interno al procesar el despacho.", error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

export const obtenerAuditorias = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await asegurarTablaAuditoriaIA(connection);
        const [rows] = await connection.query(`
            SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') as fecha, IFNULL(nombre_usuario, 'Usuario Desconocido') as usuario, 
            destino, cantidad_total as cantidad, motor_ia as motor, estado, payload_salida 
            FROM auditoria_ia ORDER BY id DESC
        `);

        const auditoriasDetalladas = rows.map(row => {
            let detalles = { bodega: 'Desconocida', items: [] };
            try {
                if (row.payload_salida) {
                    const payload = typeof row.payload_salida === 'string' ? JSON.parse(row.payload_salida) : row.payload_salida;
                    detalles.bodega = payload.origen?.bodega || 'Desconocida';
                    detalles.items = payload.items || [];
                }
            } catch (e) { console.error("Error al leer payload", e); }
            return { ...row, bodega_origen: detalles.bodega, productos: detalles.items };
        });
        res.json(auditoriasDetalladas);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener auditorías." });
    } finally {
        if (connection) connection.release();
    }
};

export const resolverAuditoria = async (req, res) => {
    const { id_auditoria, accion } = req.body;
    let connection;
    try {
        connection = await db.getConnection();
        await asegurarTablaSeriales(connection);
        await asegurarTablaAuditoriaIA(connection);
        await connection.beginTransaction();

        await connection.query(`UPDATE auditoria_ia SET estado = ? WHERE id = ?`, [accion, id_auditoria]);

        if (accion === 'APROBADO') {
            const [rows] = await connection.query(`SELECT payload_salida, nombre_usuario FROM auditoria_ia WHERE id = ?`, [id_auditoria]);
            if (rows.length > 0) {
                const payload = typeof rows[0].payload_salida === 'string' ? JSON.parse(rows[0].payload_salida) : rows[0].payload_salida;
                const { cabecera, items } = payload;
                const resp = rows[0].nombre_usuario;

                const [resSalida] = await connection.query(
                    `INSERT INTO salidas (punto_destino, motivo, transportista, placa_vehiculo, observaciones, usuario_responsable) VALUES (?, ?, ?, ?, ?, ?)`,
                    [cabecera.punto_destino, cabecera.motivo, cabecera.transportista || 'N/A', cabecera.placa_vehiculo || 'N/A', 'AUTORIZADO POR GERENCIA IA. ' + (cabecera.observaciones || ''), resp]
                );

                const id_salida = resSalida.insertId;
                
                // 🚀 CIRUGÍA WMS: Lo mismo aquí, for...of para evitar bloqueos
                for (const item of items) {
                    await connection.query(`INSERT INTO salidas_detalle (id_salida, id_producto, cantidad, precio_salida) VALUES (?, ?, ?, ?)`, [id_salida, item.id_producto, item.cantidad, item.precio]);
                    
                    const [prodData] = await connection.query(`SELECT stock_actual, ubicacion_bodega FROM productos WHERE id_producto = ?`, [item.id_producto]);
                    if (prodData.length > 0) {
                        const stockRestante = prodData[0].stock_actual - item.cantidad;
                        if (stockRestante <= 0) {
                            const ubiVieja = prodData[0].ubicacion_bodega;
                            if (ubiVieja && ubiVieja !== 'Por Asignar' && ubiVieja !== 'Sin Asignar') await connection.query(`UPDATE cat_ubicaciones SET estado = 'LIBRE' WHERE id_ubicacion = ?`, [ubiVieja]);
                            await connection.query(`UPDATE productos SET stock_actual = 0, ubicacion_bodega = NULL WHERE id_producto = ?`, [item.id_producto]);
                        } else {
                            await connection.query(`UPDATE productos SET stock_actual = ? WHERE id_producto = ?`, [stockRestante, item.id_producto]);
                        }
                    }

                    if (item.codigo) {
                        const codigo = item.codigo.toString().trim().toUpperCase();
                        let filtroCodigo = "serial = ?";
                        if (codigo.startsWith("PLT-")) filtroCodigo = "pallet_lpn = ?";
                        if (codigo.startsWith("MB-")) filtroCodigo = "masterbox_lpn = ?";

                        await connection.query(
                            `UPDATE seriales_equipos
                             SET estado = 'ENVIADO',
                                 punto_destino = ?,
                                 motivo_salida = ?,
                                 id_salida = ?,
                                 fecha_salida = NOW(),
                                 bodega_actual = NULL
                             WHERE ${filtroCodigo}
                               AND id_producto = ?
                               AND estado = 'EN_BODEGA'`,
                            [cabecera.punto_destino, cabecera.motivo, id_salida, codigo, item.id_producto]
                        );
                    }
                }
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
