import db from "../config/db.js";

// 1. OBTENER TODOS LOS PRODUCTOS
export const obtenerProductos = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM productos ORDER BY fecha_creacion DESC",
    );
    res.json(rows);
  } catch (error) {
    console.error("❌ Error al obtener productos:", error);
    res.status(500).json({ message: "Error interno al obtener el catálogo." });
  }
};

// 2. CREAR UN NUEVO PRODUCTO (ACTUALIZADO CON IA Y LÓGICA DE ZEBRA)
export const crearProducto = async (req, res) => {
  const {
    sku_interno_prefix,
    part_number,
    nombre,
    modelo,
    marca,
    categoria,
    sub_categoria,
    codigo_barras,
    precio_ref,
    tecnologia,
    color,
    status_equipo,
    propiedad,
    descripcion,
    stock_minimo,
    stock_maximo,
  } = req.body;

  if (!sku_interno_prefix || !nombre) {
    return res
      .status(400)
      .json({ message: "El prefijo del SKU y el Nombre son obligatorios." });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // -- A. GENERAR EL SKU SECUENCIAL MÁGICO --
    // Busca el último producto que empiece con el prefijo enviado (Ej: PRI-IND-ZEB)
    const [rows] = await connection.query(
      `SELECT sku FROM productos WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1`,
      [`${sku_interno_prefix}-%`],
    );

    let nuevoNumero = 1;
    if (rows.length > 0) {
      const ultimoSKU = rows[0].sku;
      const partes = ultimoSKU.split("-");
      const ultimoNum = parseInt(partes[partes.length - 1], 10);
      if (!isNaN(ultimoNum)) nuevoNumero = ultimoNum + 1;
    }

    // Formatea el número a 3 dígitos (Ej: 001, 042)
    const skuFinal = `${sku_interno_prefix}-${nuevoNumero.toString().padStart(3, "0")}`;

    // -- B. GUARDAR EN LA BASE DE DATOS --
    // Se inserta usando los nombres de columnas exactos de tu base de datos
    const [result] = await connection.query(
      `INSERT INTO productos 
      (sku, part_number, codigo_barras, nombre_producto, tipo_producto, sub_categoria, modelo, marca, 
       tecnologia, color, status_equipo, propiedad, especificaciones, precio, 
       stock_actual, stock_minimo, stock_maximo, ubicacion_bodega) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skuFinal,
        part_number || "N/A",
        codigo_barras || null, // Se pone nulo si está vacío para evitar error de UNIQUE
        nombre,
        categoria || "General", // En BD es tipo_producto
        sub_categoria || "N/A",
        modelo || "N/A",
        marca || "N/A",
        tecnologia || "N/A",
        color || "N/A",
        status_equipo || "Nuevo",
        propiedad || "EMPRESA",
        descripcion || "", // En BD es especificaciones
        precio_ref || 0.0, // En BD es precio
        0, // stock_actual nace en 0
        stock_minimo || 5,
        stock_maximo || 50,
        "Por Asignar",
      ],
    );

    res
      .status(201)
      .json({
        message: "✅ Producto creado exitosamente",
        id: result.insertId,
        sku_final: skuFinal,
      });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({
          message:
            "Error: El Código de Barras (GTIN) ya está registrado en el catálogo.",
        });
    }
    console.error("❌ Error al guardar producto:", error);
    res
      .status(500)
      .json({ message: "Error interno al guardar en la base de datos." });
  } finally {
    if (connection) connection.release();
  }
};

// 3. ACTUALIZAR UN PRODUCTO EXISTENTE (Ahora soporta Descontinuar/Reactivar)
export const actualizarProducto = async (req, res) => {
  const { id } = req.params;
  const { nombre_producto, especificaciones, stock_minimo, stock_maximo, status_equipo } = req.body;
  
  try {
    const [result] = await db.query(
      "UPDATE productos SET nombre_producto = ?, especificaciones = ?, stock_minimo = ?, stock_maximo = ?, status_equipo = COALESCE(?, status_equipo) WHERE id_producto = ?",
      [nombre_producto, especificaciones, stock_minimo, stock_maximo, status_equipo, id]
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
    const [result] = await db.query(
      "DELETE FROM productos WHERE id_producto = ?",
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json({ message: "✅ Producto eliminado del catálogo." });
  } catch (error) {
    console.error("❌ Error al eliminar producto:", error);
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res
        .status(409)
        .json({
          message:
            "No se puede eliminar porque este producto ya tiene movimientos en bodega.",
        });
    }
    res.status(500).json({ message: "Error interno al intentar eliminar." });
  }
};

// 5. OBTENER DATOS MAESTROS (ACTUALIZADO CON LISTAS DINÁMICAS)
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

    const [bodegas] = await db.query("SELECT * FROM cat_bodegas");
    const [aforos] = await db.query("SELECT * FROM cat_aforo");
    const [ubicaciones] = await db.query(
      "SELECT * FROM cat_ubicaciones WHERE estado = 'LIBRE'",
    );

    // -- AÑADIDO: Extracción dinámica de las categorías directamente de los productos subidos --
    const [categorias] = await db.query(
      "SELECT DISTINCT tipo_producto AS categoria FROM productos WHERE tipo_producto IS NOT NULL AND tipo_producto != ''",
    );
    const [subcategorias] = await db.query(
      "SELECT DISTINCT tipo_producto AS categoria, sub_categoria FROM productos WHERE sub_categoria IS NOT NULL AND sub_categoria != ''",
    );
    const [modelos] = await db.query(
      "SELECT DISTINCT modelo FROM productos WHERE modelo IS NOT NULL AND modelo != 'N/A' AND modelo != ''",
    );
    res.json({
      status,
      tipoProducto: tipos,
      marca: marcas,
      tecnologia: tecnologias,
      propiedad: propiedades,
      manual: manuales,
      software: softwares,
      color: colores,
      bodegas,
      aforos,
      ubicaciones,
      categoriasUnicas: categorias, // Se envía a React
      subCategoriasUnicas: subcategorias, // Se envía a React
      modelosUnicos: modelos,
    });
  } catch (error) {
    console.error("❌ Error al obtener datos maestros:", error);
    res.status(500).json({ message: "Error al cargar diccionarios de la BD." });
  }
};

// 6. AGREGAR NUEVO DATO MAESTRO
export const agregarDatoMaestro = async (req, res) => {
  const { tipo_maestro, codigo, descripcion } = req.body;

  if (!tipo_maestro || !codigo || !descripcion) {
    return res.status(400).json({ message: "Faltan datos requeridos." });
  }

  let tabla = "";
  if (tipo_maestro === "marca") tabla = "cat_marcas";
  else if (tipo_maestro === "tipo") tabla = "cat_tipo_producto";
  else if (tipo_maestro === "color") tabla = "cat_color";
  else return res.status(400).json({ message: "Tipo de maestro inválido." });

  try {
    await db.query(`INSERT INTO ${tabla} (id, descripcion) VALUES (?, ?)`, [
      codigo.toUpperCase(),
      descripcion,
    ]);
    res
      .status(201)
      .json({
        message: `✅ ${descripcion} agregado correctamente al catálogo.`,
      });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "❌ Error: Ese código ya existe en el sistema." });
    }
    console.error("❌ Error al guardar maestro:", error);
    res
      .status(500)
      .json({ message: "Error interno al guardar en la base de datos." });
  }
};
