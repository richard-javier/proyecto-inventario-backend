import db from "../config/db.js";
import { limpiarSkuBodega, normalizarSkusExistentes, permitirSkuDuplicadoPorUbicacion } from "./sku.controller.js";

export const obtenerLotesPendientes = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT l.*, p.nombre_producto, p.sku FROM lotes_planificados l JOIN productos p ON l.id_producto = p.id_producto WHERE l.estado IN ('CREADO', 'EN_PROCESO')`);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error interno al consultar lotes.", error: error.message });
    }
};

export const registrarIngresoFormal = async (req, res) => {
    const { cabecera, itemRecibido } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await normalizarSkusExistentes(connection);
        await connection.beginTransaction();

        const id_usuario_token = req.usuario ? req.usuario.id_usuario : null;
        let nombreResponsable = "Usuario Desconocido";
        if (id_usuario_token) {
            const [userDb] = await connection.query("SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?", [id_usuario_token]);
            if (userDb.length > 0) nombreResponsable = `${userDb[0].nombre} ${userDb[0].apellido}`;
        }

        const cantidadIngresar = parseInt(itemRecibido.cantidad_ingresar, 10);
        const ubicacionIngreso = itemRecibido.id_ubicacion;
        const [prodData] = await connection.query(`SELECT * FROM productos WHERE id_producto = ? FOR UPDATE`, [itemRecibido.id_producto]);
        if (prodData.length === 0) throw new Error("Producto no encontrado para el ingreso.");

        const productoBase = prodData[0];
        const ubicacionActual = (productoBase.ubicacion_bodega || '').trim();
        const productoSinUbicacion = !ubicacionActual || ubicacionActual === 'Por Asignar' || ubicacionActual === 'Sin Asignar';
        let idProductoIngreso = itemRecibido.id_producto;

        if (productoSinUbicacion || ubicacionActual === ubicacionIngreso) {
            await connection.query(
                `UPDATE productos SET stock_actual = stock_actual + ?, ubicacion_bodega = ? WHERE id_producto = ?`,
                [cantidadIngresar, ubicacionIngreso, itemRecibido.id_producto]
            );
        } else {
            const [productoEnUbicacion] = await connection.query(
                `SELECT id_producto FROM productos
                 WHERE id_producto <> ?
                   AND part_number <=> ?
                   AND nombre_producto = ?
                   AND modelo <=> ?
                   AND marca <=> ?
                   AND ubicacion_bodega = ?
                 LIMIT 1`,
                [itemRecibido.id_producto, productoBase.part_number, productoBase.nombre_producto, productoBase.modelo, productoBase.marca, ubicacionIngreso]
            );

            if (productoEnUbicacion.length > 0) {
                idProductoIngreso = productoEnUbicacion[0].id_producto;
                await connection.query(`UPDATE productos SET stock_actual = stock_actual + ? WHERE id_producto = ?`, [cantidadIngresar, idProductoIngreso]);
            } else {
                await permitirSkuDuplicadoPorUbicacion(connection);
                const baseSku = limpiarSkuBodega(productoBase.sku || 'SKU');
                const sufijoUbicacion = ubicacionIngreso.replace(/[^A-Z0-9]/gi, '');
                let newCodigoBarras = productoBase.codigo_barras ? `${productoBase.codigo_barras}-${sufijoUbicacion}` : null;

                try {
                    const [insertResult] = await connection.query(`
                        INSERT INTO productos
                        (sku, part_number, codigo_barras, nombre_producto, tipo_producto, sub_categoria, modelo, marca, tecnologia, color, status_equipo, propiedad, especificaciones, precio, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        baseSku, productoBase.part_number, newCodigoBarras, productoBase.nombre_producto, productoBase.tipo_producto, productoBase.sub_categoria,
                        productoBase.modelo, productoBase.marca, productoBase.tecnologia, productoBase.color, productoBase.status_equipo, productoBase.propiedad,
                        productoBase.especificaciones, productoBase.precio, cantidadIngresar, productoBase.stock_minimo, productoBase.stock_maximo, ubicacionIngreso
                    ]);
                    idProductoIngreso = insertResult.insertId;
                } catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY') throw error;

                    const randomSuffix = Math.floor(Math.random() * 1000);
                    newCodigoBarras = productoBase.codigo_barras ? `${productoBase.codigo_barras}-${sufijoUbicacion}-${randomSuffix}` : null;

                    const [insertResult] = await connection.query(`
                        INSERT INTO productos
                        (sku, part_number, codigo_barras, nombre_producto, tipo_producto, sub_categoria, modelo, marca, tecnologia, color, status_equipo, propiedad, especificaciones, precio, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        baseSku, productoBase.part_number, newCodigoBarras, productoBase.nombre_producto, productoBase.tipo_producto, productoBase.sub_categoria,
                        productoBase.modelo, productoBase.marca, productoBase.tecnologia, productoBase.color, productoBase.status_equipo, productoBase.propiedad,
                        productoBase.especificaciones, productoBase.precio, cantidadIngresar, productoBase.stock_minimo, productoBase.stock_maximo, ubicacionIngreso
                    ]);
                    idProductoIngreso = insertResult.insertId;
                }
            }
        }

        await connection.query(
            `INSERT INTO ingresos_fisicos_pallets (id_bodega, id_lote_planificado, id_producto, cantidad, costo_unitario, id_ubicacion, tipo_asignacion, usuario_responsable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [cabecera.id_bodega, itemRecibido.id_lote_planificado, idProductoIngreso, cantidadIngresar, itemRecibido.costo_unitario, ubicacionIngreso, itemRecibido.tipo_asignacion || 'Dinámica', nombreResponsable]
        );

        await connection.query(`UPDATE cat_ubicaciones SET estado = 'OCUPADO' WHERE id_ubicacion = ?`, [ubicacionIngreso]);

        const [loteData] = await connection.query(`SELECT pallets_ingresados, total_pallets FROM lotes_planificados WHERE id_lote = ?`, [itemRecibido.id_lote_planificado]);
        const palletsActuales = loteData[0].pallets_ingresados + 1;
        const nuevoEstado = palletsActuales >= loteData[0].total_pallets ? 'INGRESADO' : 'EN_PROCESO';

        await connection.query(`UPDATE lotes_planificados SET pallets_ingresados = ?, estado = ? WHERE id_lote = ?`, [palletsActuales, nuevoEstado, itemRecibido.id_lote_planificado]);

        await connection.commit();
        res.status(201).json({ message: "Pallet ingresado exitosamente al sistema." });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: "Error interno del servidor al procesar el ingreso." });
    } finally {
        if (connection) connection.release();
    }
};
