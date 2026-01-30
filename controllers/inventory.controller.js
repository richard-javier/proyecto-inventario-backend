// backend-inventario/controllers/inventory.controller.js
import db from "../config/db.js";

// --- FUNCIÓN 1: OBTENER TODOS (Historial Completo) ---
export const obtenerProductos = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    // Traemos TODO (*), incluyendo la columna 'estado', ordenado por el más reciente
    const [productos] = await connection.query(
      "SELECT * FROM productos ORDER BY id_producto DESC"
    );
    res.json(productos); 
  } catch (error) {
    console.error("Error al obtener inventario:", error);
    res.status(500).json({ message: "Error del servidor al leer datos." });
  } finally {
    if (connection) connection.release();
  }
};

// --- FUNCIÓN 2: CREAR PRODUCTO ---
export const crearProducto = async (req, res) => {
  const { 
    nombre_producto, marca, modelo, color, codigo_barras, 
    stock_actual, stock_minimo, stock_maximo, ubicacion_bodega 
  } = req.body;

  if (!nombre_producto || !codigo_barras) {
    return res.status(400).json({ message: "Faltan datos obligatorios." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [result] = await connection.query(
      `INSERT INTO productos 
      (nombre_producto, marca, modelo, color, codigo_barras, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre_producto, marca, modelo, color, codigo_barras, stock_actual, stock_minimo, stock_maximo, ubicacion_bodega]
    );
    res.status(201).json({ message: "Producto creado", id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "El Código de Barras ya existe." });
    }
    console.error(error);
    res.status(500).json({ message: "Error al guardar." });
  } finally {
    if (connection) connection.release();
  }
};

// --- FUNCIÓN 3: ACTUALIZAR (Edición y Reactivación) ---
export const actualizarProducto = async (req, res) => {
  const { id } = req.params;
  // Agregamos 'estado' para permitir la reactivación desde el frontend
  const { nombre_producto, marca, modelo, color, stock_minimo, stock_maximo, ubicacion_bodega, estado } = req.body;
  
  let connection;
  try {
    connection = await db.getConnection();
    
    // Construimos la query dinámica (o fija con todos los campos)
    await connection.query(
      `UPDATE productos SET 
       nombre_producto = ?, 
       marca = ?, 
       modelo = ?, 
       color = ?, 
       stock_minimo = ?, 
       stock_maximo = ?, 
       ubicacion_bodega = ?,
       estado = ? 
       WHERE id_producto = ?`,
      [nombre_producto, marca, modelo, color, stock_minimo, stock_maximo, ubicacion_bodega, estado, id]
    );
    res.json({ message: "Producto actualizado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar" });
  } finally {
    if (connection) connection.release();
  }
};

// --- FUNCIÓN 4: ARCHIVAR / DESCONTINUAR (Soft Delete) ---
export const eliminarProducto = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    
    // 1. Validar Stock Físico (Regla de Negocio Tesis)
    const [producto] = await connection.query("SELECT stock_actual FROM productos WHERE id_producto = ?", [id]);
    
    if (!producto || producto.length === 0) {
        return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (producto[0].stock_actual > 0) {
        return res.status(400).json({ message: "No se puede descontinuar un producto con Stock físico activo." });
    }

    // 2. Ejecutar Soft Delete (Cambiar estado a INACTIVO)
    await connection.query("UPDATE productos SET estado = 'INACTIVO' WHERE id_producto = ?", [id]);
    
    res.json({ message: "Producto archivado (Historial preservado)" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  } finally {
    if (connection) connection.release();
  }
};