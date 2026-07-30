export const limpiarSkuBodega = (sku = '') => {
    return sku.toString().trim().replace(/-B\d{2}[A-Z0-9-]*$/i, '');
};

export const permitirSkuDuplicadoPorUbicacion = async (connection) => {
    const [indexes] = await connection.query(`
        SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_index
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'productos'
          AND NON_UNIQUE = 0
          AND INDEX_NAME <> 'PRIMARY'
        GROUP BY INDEX_NAME
        HAVING columns_index = 'sku'
    `);

    for (const index of indexes) {
        await connection.query(`ALTER TABLE productos DROP INDEX \`${index.INDEX_NAME}\``);
    }
};

export const normalizarSkusExistentes = async (connection) => {
    await permitirSkuDuplicadoPorUbicacion(connection);

    const [productos] = await connection.query(`
        SELECT id_producto, sku
        FROM productos
        WHERE sku REGEXP '-B[0-9]{2}'
    `);

    for (const producto of productos) {
        const skuLimpio = limpiarSkuBodega(producto.sku);
        if (skuLimpio && skuLimpio !== producto.sku) {
            await connection.query(
                `UPDATE productos SET sku = ? WHERE id_producto = ?`,
                [skuLimpio, producto.id_producto]
            );
        }
    }
};
