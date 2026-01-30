// backend-inventario/routes/inventory.routes.js
import { Router } from 'express';
// Importamos ambas funciones
import { obtenerProductos, crearProducto, actualizarProducto, eliminarProducto } from '../controllers/inventory.controller.js';
import { protegerRuta, verificarRol } from '../middlewares/auth.middleware.js';
import { registrarIngreso } from '../controllers/entries.controller.js';

const router = Router();

// RUTA GET: http://localhost:3001/api/inventario
// Esta es la que llama tu página de Trazabilidad. Debe usar 'obtenerProductos'.
router.get('/', protegerRuta, obtenerProductos);

// RUTA POST: http://localhost:3001/api/inventario
// Esta es la que usa el formulario de Crear. Debe usar 'crearProducto'.
// Solo Gerentes (1) y Jefes (2) pueden guardar.
router.post('/', protegerRuta, verificarRol([1, 2]), crearProducto);
router.put('/:id', protegerRuta, verificarRol([1, 2]), actualizarProducto); // Editar
router.delete('/:id', protegerRuta, verificarRol([1]), eliminarProducto);   // Eliminar (Solo Gerente)
// 2. Agrega la ruta de Ingreso al final
// POST /api/inventario/ingreso
router.post('/ingreso', protegerRuta, verificarRol([1, 2, 4]), registrarIngreso);
// Nota: Roles [1,2,4] son Gerente, Jefe Admin, Jefe Operaciones (Ajusta según tu DB)
export default router;