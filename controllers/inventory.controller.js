import db from "../config/db.js";

// 1. OBTENER TODOS LOS PRODUCTOS
export const obtenerProductos = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM productos ORDER BY fecha_creacion DESC");
    res.json(rows);
  } catch (error) {
    console.error("❌ Error al obtener productos:", error);
    res.status(500).json({ message: "Error interno al obtener el catálogo." });
  }
};

// 2. CREAR UN NUEVO PRODUCTO
export const crearProducto = async (req, res) => {
  const { 
    sku, codigo_barras, nombre_producto, tipo_producto, marca, tecnologia, 
    color, status_equipo, propiedad, manual_tipo, software_tipo, 
    especificaciones, stock_minimo, stock_maximo 
  } = req.body;

  if (!sku || !nombre_producto) {
    return res.status(400).json({ message: "El SKU y el Nombre Comercial son obligatorios." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    // CORRECCIÓN APLICADA: Ahora los 17 campos coinciden con los 17 valores (?)
    const [result] = await connection.query(
      `INSERT INTO productos 
      (sku, codigo_barras, nombre_producto, tipo_producto, marca, tecnologia, color, 
       status_equipo, propiedad, manual_tipo, software_tipo, especificaciones, 
       stock_actual, precio, ubicacion_bodega, stock_minimo, stock_maximo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sku, 
        codigo_barras || sku, 
        nombre_producto, 
        tipo_producto || 'General', 
        marca || 'N/A',  
        tecnologia || 'N/A', 
        color || 'N/A', 
        status_equipo || 'Nuevo', 
        propiedad || 'EMPRESA', 
        manual_tipo || 'N/A', 
        software_tipo || 'N/A', 
        especificaciones || '', 
        0, // stock_actual nace en 0
        0, // precio nace en 0
        'Por Asignar', // ubicacion por defecto
        stock_minimo || 5, 
        stock_maximo || 50
      ]
    );
    res.status(201).json({ message: "✅ Producto creado exitosamente", id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Error: El SKU ya está registrado en el catálogo." });
    }
    console.error("❌ Error al guardar producto:", error);
    res.status(500).json({ message: "Error interno al guardar en la base de datos." });
  } finally {
    if (connection) connection.release();
  }
};

// 3. ACTUALIZAR UN PRODUCTO EXISTENTE
export const actualizarProducto = async (req, res) => {
  const { id } = req.params;
  const { nombre_producto, especificaciones, stock_minimo, stock_maximo } = req.body;
  
  try {
    const [result] = await db.query(
      "UPDATE productos SET nombre_producto = ?, especificaciones = ?, stock_minimo = ?, stock_maximo = ? WHERE id_producto = ?",
      [nombre_producto, especificaciones, stock_minimo, stock_maximo, id]
    );
    
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Producto no encontrado en el sistema." });
    }
    res.json({ message: "✅ Producto actualizado correctamente." });
  } catch (error) {
    console.error("❌ Error al actualizar producto:", error);
    res.status(500).json({ message: "Error interno al actualizar." });
  }
};

// 4. ELIMINAR UN PRODUCTO DEL CATÁLOGO
export const eliminarProducto = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM productos WHERE id_producto = ?", [id]);
    
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json({ message: "✅ Producto eliminado del catálogo." });
  } catch (error) {
    console.error("❌ Error al eliminar producto:", error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({ message: "No se puede eliminar porque este producto ya tiene movimientos en bodega." });
    }
    res.status(500).json({ message: "Error interno al intentar eliminar." });
  }
};

// 5. OBTENER DATOS MAESTROS
export const obtenerMaestros = async (req, res) => {
  try {
    const [status] = await db.query("SELECT * FROM cat_status");
    const [tipos] = await db.query("SELECT * FROM cat_tipo_producto");
    const [marcas] = await db.query("SELECT * FROM cat_marcas");
    const [tecnologias] = await db.query("SELECT * FROM cat_tecnologia");
    const [propiedades] = await db.query("SELECT * FROM cat_propiedad");
    const [manuales] = await db.query("SELECT * FROM cat_manual");
    const [softwares] = await db.query("SELECT * FROM cat_software");
    const [colores] = await db.query("SELECT * FROM cat_color");
    
    // NUEVO: Consultamos las bodegas y los aforos
    const [bodegas] = await db.query("SELECT * FROM cat_bodegas");
    const [aforos] = await db.query("SELECT * FROM cat_aforo");   
    // NUEVO: Traemos solo las ubicaciones que nadie está usando
    const [ubicaciones] = await db.query("SELECT * FROM cat_ubicaciones WHERE estado = 'LIBRE'");

    res.json({
      status, tipoProducto: tipos, marca: marcas, tecnologia: tecnologias,
      propiedad: propiedades, manual: manuales, software: softwares, color: colores,
      bodegas, aforos, ubicaciones // <-- Añadido aquí
    });
// ...resto de la función...
  } catch (error) {
    console.error("❌ Error al obtener datos maestros:", error);
    res.status(500).json({ message: "Error al cargar diccionarios de la BD." });
  }
};
// 6. AGREGAR NUEVO DATO MAESTRO (Marcas, Tipos, Colores)
export const agregarDatoMaestro = async (req, res) => {
  const { tipo_maestro, codigo, descripcion } = req.body;
  
  if (!tipo_maestro || !codigo || !descripcion) {
    return res.status(400).json({ message: "Faltan datos requeridos." });
  }

  // Identificamos en qué tabla guardar según lo que envíe React
  let tabla = "";
  if (tipo_maestro === 'marca') tabla = "cat_marcas";
  else if (tipo_maestro === 'tipo') tabla = "cat_tipo_producto";
  else if (tipo_maestro === 'color') tabla = "cat_color";
  else return res.status(400).json({ message: "Tipo de maestro inválido." });

  try {
    // Usamos el código en mayúsculas por estándar de la matriz
    await db.query(`INSERT INTO ${tabla} (id, descripcion) VALUES (?, ?)`, [codigo.toUpperCase(), descripcion]);
    res.status(201).json({ message: `✅ ${descripcion} agregado correctamente al catálogo.` });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "❌ Error: Ese código ya existe en el sistema." });
    }
    console.error("❌ Error al guardar maestro:", error);
    res.status(500).json({ message: "Error interno al guardar en la base de datos." });
  }
};