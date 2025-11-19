// backend-inventario/config/db.js

/**
 * @module config/db
 * @description Módulo de configuración y conexión a la base de datos MySQL
 * @version 1.0.0
 * @requires mysql2/promise
 * @requires dotenv
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Configurar variables de entorno
dotenv.config();

/**
 * @constant {Object} pool - Pool de conexiones a la base de datos MySQL
 * @description Configuración del pool de conexiones utilizando variables de entorno
 *
 * @property {string} host - Host de la base de datos (DB_HOST)
 * @property {string} user - Usuario de la base de datos (DB_USER)
 * @property {string} password - Contraseña del usuario (DB_PASSWORD)
 * @property {string} database - Nombre de la base de datos (DB_DATABASE)
 * @property {boolean} waitForConnections - Esperar por conexiones disponibles cuando el límite sea alcanzado
 * @property {number} connectionLimit - Número máximo de conexiones en el pool (10)
 * @property {number} queueLimit - Límite de solicitudes en cola (0 = sin límite)
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * @function testDatabaseConnection
 * @async
 * @description Función auto-ejecutable para probar la conexión a la base de datos
 *              al inicializar el módulo. Verifica que las credenciales y configuración
 *              sean correctas.
 *
 * @throws {Error} Si la conexión falla, se captura y muestra el error
 *
 * @example
 * // Al importar el módulo, automáticamente prueba la conexión
 * // y muestra mensaje de éxito o error en consola
 */
(async function testDatabaseConnection() {
  try {
    // Obtener una conexión del pool para verificar la conectividad
    const connection = await pool.getConnection();
    console.log("✅ Conexión exitosa a la base de datos MySQL.");

    // Liberar la conexión de vuelta al pool
    connection.release();
  } catch (error) {
    console.error("❌ Error al conectar con la base de datos:", error.message);

    // En entornos de producción, podrías querer terminar la aplicación
    // process.exit(1);
  }
})();

/**
 * @exports pool
 * @description Exporta el pool de conexiones configurado para ser utilizado
 *              en otros módulos de la aplicación.
 */
export default pool;
