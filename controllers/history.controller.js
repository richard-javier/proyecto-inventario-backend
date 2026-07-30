import db from "../config/db.js";
import { asegurarTablaSeriales } from "./serials.controller.js";
import { limpiarSkuBodega, normalizarSkusExistentes, permitirSkuDuplicadoPorUbicacion } from "./sku.controller.js";

// 1. OBTENER KARDEX COMPLETO
export const obtenerHistorial = async (req, res) => {
    try {
        const query = `
            SELECT i.fecha_registro AS fecha, 'INGRESO' AS tipo_movimiento, p.nombre_producto, p.sku AS codigo_barras,
                i.cantidad, CONCAT('Bodega: ', i.id_bodega) AS origen_destino, 'Recepción WMS' AS documento_motivo,
                i.usuario_responsable AS responsable, CONCAT('Estibado en: ', i.id_ubicacion) AS observaciones
            FROM ingresos_fisicos_pallets i JOIN productos p ON i.id_producto = p.id_producto
            
            UNION ALL
            
            SELECT s.fecha_registro AS fecha, 'SALIDA' AS tipo_movimiento, p.nombre_producto, p.sku AS codigo_barras,
                sd.cantidad, s.punto_destino AS origen_destino, s.motivo AS documento_motivo,
                s.usuario_responsable AS responsable, s.observaciones
            FROM salidas s JOIN salidas_detalle sd ON s.id_salida = sd.id_salida JOIN productos p ON sd.id_producto = p.id_producto
            
            UNION ALL
            
            SELECT m.fecha_registro AS fecha, m.tipo_movimiento, p.nombre_producto, p.sku AS codigo_barras,
                m.cantidad, CONCAT(m.origen, ' -> ', m.destino) AS origen_destino, 'Trazabilidad WMS' AS documento_motivo,
                m.usuario_responsable AS responsable, 'Movimiento Físico Confirmado' AS observaciones
            FROM movimientos_internos m JOIN productos p ON m.id_producto = p.id_producto
            
            ORDER BY fecha DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error interno al consultar el historial.", error: error.message });
    }
};

// 2. REGISTRAR MOVIMIENTOS INTERNOS (TRANSFERENCIAS PARCIALES Y CLONACIÓN DE LOTE)
export const registrarMovimientoInterno = async (req, res) => {
    const { id_producto, tipo_movimiento, cantidad, origen, destino, ubicacion_nueva, seriales = [] } = req.body;
    let connection;
    
    if (!id_producto || !cantidad) {
        return res.status(400).json({ message: "Error Crítico: Faltan datos de transferencia." });
    }

    try {
        connection = await db.getConnection();
        await asegurarTablaSeriales(connection);
        await normalizarSkusExistentes(connection);
        await connection.beginTransaction();

        const id_usuario_token = req.usuario ? req.usuario.id_usuario : null;
        let nombreResponsable = "Usuario Desconocido";
        if (id_usuario_token) {
            const [userDb] = await connection.query("SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?", [id_usuario_token]);
            if (userDb.length > 0) nombreResponsable = `${userDb[0].nombre} ${userDb[0].apellido}`;
        }

        // 1. Obtener toda la data del producto original
        const [prodData] = await connection.query(`SELECT * FROM productos WHERE id_producto = ?`, [id_producto]);
        if (prodData.length === 0) throw new Error("Producto original no encontrado en la base de datos.");
        const p = prodData[0];

        const qtyTransfer = parseInt(cantidad);
        const currentStock = parseInt(p.stock_actual);

        if (qtyTransfer > currentStock) {
            throw new Error(`Stock insuficiente. Solo hay ${currentStock} disponibles.`);
        }

        // ---------------------------------------------------------
        // ESCENARIO A: TRANSFERENCIA PARCIAL (SPLITTING DE LOTE)
        // ---------------------------------------------------------
        if (qtyTransfer < currentStock) {
            // 1. Restar la cantidad del producto original
            await connection.query(`UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ?`, [qtyTransfer, id_producto]);

            await permitirSkuDuplicadoPorUbicacion(connection);
            const skuProducto = limpiarSkuBodega(p.sku);

            // 2. Verificamos si este mismo producto ya existe en la ubicación de destino
            const [cloneExists] = await connection.query(`SELECT id_producto FROM productos WHERE sku = ? AND ubicacion_bodega = ?`, [skuProducto, ubicacion_nueva]);

            if (cloneExists.length > 0) {
                // Si ya existe ese producto clonado en esa misma percha, solo le sumamos el stock
                await connection.query(`UPDATE productos SET stock_actual = stock_actual + ? WHERE id_producto = ?`, [qtyTransfer, cloneExists[0].id_producto]);
            } else {
                // Modificamos el código de barras para evitar error de UNIQUE Constraint
                const newCodigoBarras = p.codigo_barras ? `${p.codigo_barras}-${destino}` : null;

                // Creamos el nuevo registro "hijo" idéntico al padre
                try {
                    await connection.query(`
                        INSERT INTO productos 
                        (sku, part_number, codigo_barras, nombre_producto, tipo_producto, sub_categoria, modelo, marca, tecnologia, color, status_equipo, propiedad, especificaciones, precio, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        skuProducto, p.part_number, newCodigoBarras, p.nombre_producto, p.tipo_producto, p.sub_categoria, 
                        p.modelo, p.marca, p.tecnologia, p.color, p.status_equipo, p.propiedad, 
                        p.especificaciones, p.precio, qtyTransfer, p.stock_minimo, p.stock_maximo, ubicacion_nueva
                    ]);
                } catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY') throw error;

                    const sufijoUbicacion = ubicacion_nueva.replace(/[^A-Z0-9]/gi, '');
                    const uniqueCodigoBarras = p.codigo_barras ? `${p.codigo_barras}-${destino}-${sufijoUbicacion}` : null;

                    await connection.query(`
                        INSERT INTO productos 
                        (sku, part_number, codigo_barras, nombre_producto, tipo_producto, sub_categoria, modelo, marca, tecnologia, color, status_equipo, propiedad, especificaciones, precio, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        skuProducto, p.part_number, uniqueCodigoBarras, p.nombre_producto, p.tipo_producto, p.sub_categoria, 
                        p.modelo, p.marca, p.tecnologia, p.color, p.status_equipo, p.propiedad, 
                        p.especificaciones, p.precio, qtyTransfer, p.stock_minimo, p.stock_maximo, ubicacion_nueva
                    ]);
                }
            }

            // Ocupar la nueva ubicación en la matriz de estantes
            await connection.query(`UPDATE cat_ubicaciones SET estado = 'OCUPADO' WHERE id_ubicacion = ?`, [ubicacion_nueva]);

        } 
        // ---------------------------------------------------------
        // ESCENARIO B: TRANSFERENCIA TOTAL (Mover todo el bloque)
        // ---------------------------------------------------------
        else {
            // Liberar ubicación vieja
            if (p.ubicacion_bodega && p.ubicacion_bodega !== 'Por Asignar') {
                await connection.query(`UPDATE cat_ubicaciones SET estado = 'LIBRE' WHERE id_ubicacion = ?`, [p.ubicacion_bodega]);
            }

            await permitirSkuDuplicadoPorUbicacion(connection);
            const skuProducto = limpiarSkuBodega(p.sku);

            // Ocupar ubicación nueva
            await connection.query(`UPDATE cat_ubicaciones SET estado = 'OCUPADO' WHERE id_ubicacion = ?`, [ubicacion_nueva]);
            
            // Actualizar solo ubicación; el SKU del producto se conserva sin sufijos de bodega
            await connection.query(`UPDATE productos SET ubicacion_bodega = ?, sku = ? WHERE id_producto = ?`, [ubicacion_nueva, skuProducto, id_producto]);
        }

        // Insertar siempre en Kardex Interno para la trazabilidad
        await connection.query(
            `INSERT INTO movimientos_internos (tipo_movimiento, id_producto, cantidad, origen, destino, usuario_responsable) VALUES (?, ?, ?, ?, ?, ?)`,
            [tipo_movimiento, id_producto, qtyTransfer, origen, destino, nombreResponsable]
        );

        if (Array.isArray(seriales) && seriales.length > 0) {
            const [productoDestinoData] = await connection.query(
                `SELECT id_producto, sku, nombre_producto, ubicacion_bodega FROM productos WHERE ubicacion_bodega = ? ORDER BY id_producto DESC LIMIT 1`,
                [ubicacion_nueva]
            );
            const productoDestino = productoDestinoData[0] || { id_producto, sku: p.sku, nombre_producto: p.nombre_producto, ubicacion_bodega: ubicacion_nueva };

            for (const item of seriales) {
                if (!item.serial) continue;
                await connection.query(
                    `INSERT INTO seriales_equipos
                    (serial, id_producto, sku, nombre_producto, pallet_lpn, masterbox_lpn, ubicacion_bodega, bodega_actual, estado, usuario_responsable)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_BODEGA', ?)
                    ON DUPLICATE KEY UPDATE
                        id_producto = VALUES(id_producto),
                        sku = VALUES(sku),
                        nombre_producto = VALUES(nombre_producto),
                        pallet_lpn = VALUES(pallet_lpn),
                        masterbox_lpn = VALUES(masterbox_lpn),
                        ubicacion_bodega = VALUES(ubicacion_bodega),
                        bodega_actual = VALUES(bodega_actual),
                        estado = 'EN_BODEGA',
                        punto_destino = NULL,
                        motivo_salida = NULL,
                        id_salida = NULL,
                        fecha_salida = NULL,
                        usuario_responsable = VALUES(usuario_responsable)`,
                    [
                        item.serial,
                        productoDestino.id_producto,
                        productoDestino.sku,
                        productoDestino.nombre_producto,
                        item.pallet || null,
                        item.masterBox || null,
                        productoDestino.ubicacion_bodega || ubicacion_nueva,
                        destino,
                        nombreResponsable
                    ]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Transferencia parcial ejecutada y lote dividido correctamente." });
    } catch(e) {
        if(connection) await connection.rollback();
        console.error("Error en Transferencia:", e);
        res.status(500).json({ message: "Error al registrar movimiento: " + e.message });
    } finally {
        if(connection) connection.release();
    }
};
