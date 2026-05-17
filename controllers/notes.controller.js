import db from "../config/db.js";

// 1. GUARDAR UNA NUEVA NOTA DE INGRESO
export const guardarNotaIngreso = async (req, res) => {
    const { nota, productos } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction(); 

        // Obtener el último secuencial y aplicar los 7 dígitos
        const [lastNote] = await connection.query("SELECT secuencial FROM notas_ingreso ORDER BY id_nota DESC LIMIT 1");
        let nuevoSecuencial = "0000001";
        if (lastNote.length > 0) {
            const ultimoNum = parseInt(lastNote[0].secuencial, 10);
            nuevoSecuencial = (ultimoNum + 1).toString().padStart(7, '0'); // Restaurado a 7 ceros
        }

        const [resNota] = await connection.query(
            `INSERT INTO notas_ingreso (secuencial, fecha, hora, proveedor, orden_compra, proviene_de, estado_mercaderia, placa_vehiculo, aforo, observaciones, entregado_nombre, entregado_cargo, recibido_nombre, recibido_cargo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nuevoSecuencial, nota.fecha, nota.hora, nota.proveedor, nota.ordenCompra, nota.provieneDe, nota.estadoMercaderia, nota.placaVehiculo, nota.aforo, nota.observaciones, nota.entregadoPor.nombre, nota.entregadoPor.cargo, nota.recibidoPor.nombre, nota.recibidoPor.cargo]
        );

        const idNotaGenerada = resNota.insertId;

        const detalleQueries = productos.map(p => {
            return connection.query(
                `INSERT INTO notas_ingreso_detalle (id_nota, perdida, recibida, pendiente, descripcion_producto, guia_secuencial) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [idNotaGenerada, p.perdida, p.recibida, p.pendiente, p.descripcion, p.guia]
            );
        });

        await Promise.all(detalleQueries);

        await connection.commit(); 
        res.status(201).json({ message: "✅ Nota de Ingreso guardada con éxito", secuencial: nuevoSecuencial });

    } catch (error) {
        if (connection) await connection.rollback(); 
        console.error(error);
        res.status(500).json({ message: "Error al procesar el ingreso." });
    } finally {
        if (connection) connection.release();
    }
};

// 2. OBTENER EL SIGUIENTE SECUENCIAL DISPONIBLE (Para mostrar al cargar la pantalla)
export const obtenerSiguienteSecuencial = async (req, res) => {
    try {
        const [lastNote] = await db.query("SELECT secuencial FROM notas_ingreso ORDER BY id_nota DESC LIMIT 1");
        let nextSecuencial = "0000001";
        
        if (lastNote.length > 0) {
            const ultimoNum = parseInt(lastNote[0].secuencial, 10);
            nextSecuencial = (ultimoNum + 1).toString().padStart(7, '0');
        }
        
        res.json({ secuencial: nextSecuencial });
    } catch (error) {
        console.error("Error al obtener siguiente secuencial:", error);
        res.status(500).json({ message: "Error al obtener el secuencial." });
    }
};

// 3. OBTENER TODAS LAS NOTAS (Para la tabla histórica)
export const obtenerNotasIngreso = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM notas_ingreso ORDER BY fecha_registro DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el historial de notas." });
    }
};

// 4. OBTENER EL DETALLE DE UNA NOTA (Para el PDF)
export const obtenerDetalleNota = async (req, res) => {
    const { id } = req.params;
    try {
        const [cabecera] = await db.query("SELECT * FROM notas_ingreso WHERE id_nota = ?", [id]);
        const [detalles] = await db.query("SELECT * FROM notas_ingreso_detalle WHERE id_nota = ?", [id]);
        
        if (cabecera.length === 0) return res.status(404).json({ message: "Nota no encontrada" });

        res.json({ cabecera: cabecera[0], productos: detalles });
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el detalle." });
    }
};