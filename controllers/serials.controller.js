import db from "../config/db.js";

export const asegurarTablaSeriales = async (connection = db) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS seriales_equipos (
      id_serial INT AUTO_INCREMENT PRIMARY KEY,
      serial VARCHAR(100) NOT NULL UNIQUE,
      id_producto INT NOT NULL,
      sku VARCHAR(120),
      nombre_producto VARCHAR(255),
      pallet_lpn VARCHAR(140),
      masterbox_lpn VARCHAR(140),
      ubicacion_bodega VARCHAR(80),
      bodega_actual VARCHAR(20),
      estado ENUM('EN_BODEGA', 'ENVIADO') NOT NULL DEFAULT 'EN_BODEGA',
      punto_destino VARCHAR(255),
      motivo_salida VARCHAR(120),
      id_salida INT,
      fecha_serializacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_salida DATETIME,
      usuario_responsable VARCHAR(160),
      INDEX idx_estado (estado),
      INDEX idx_producto (id_producto),
      INDEX idx_pallet (pallet_lpn),
      INDEX idx_masterbox (masterbox_lpn)
    )
  `);
};

const obtenerSerialesPorEstado = async (estado, res) => {
  try {
    await asegurarTablaSeriales();
    const [rows] = await db.query(
      `SELECT *,
              CASE
                WHEN id_salida IS NULL THEN NULL
                ELSE CONCAT('NE-', LPAD(id_salida, 6, '0'))
              END AS numero_egreso
       FROM seriales_equipos
       WHERE estado = ?
       ORDER BY COALESCE(fecha_salida, fecha_serializacion) DESC, id_serial DESC`,
      [estado]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error al consultar seriales.", error: error.message });
  }
};

export const obtenerSerialesEnBodega = async (req, res) => {
  await obtenerSerialesPorEstado("EN_BODEGA", res);
};

export const obtenerSerialesEnviados = async (req, res) => {
  await obtenerSerialesPorEstado("ENVIADO", res);
};
