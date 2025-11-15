// backend-inventario/config/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Prueba la conexión al arrancar el módulo
try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión exitosa a la base de datos MySQL.');
    connection.release();
} catch (error) {
    console.error('❌ Error al conectar con la base de datos:', error.message);
}

export default pool;