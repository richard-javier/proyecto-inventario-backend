// backend-inventario/routes/inventory.routes.js
import { Router } from 'express';

// Importamos controladores de Maestros y Productos
import { obtenerProductos, crearProducto, actualizarProducto, eliminarProducto, obtenerMaestros, agregarDatoMaestro } from '../controllers/inventory.controller.js';

// Importamos el controlador de Creación de Lotes Secuenciales
import { crearLote, obtenerHistorialLotes } from '../controllers/lots.controller.js';

// Importamos controladores de Ingresos Físicos
import { obtenerLotesPendientes, registrarIngresoFormal } from '../controllers/entries.controller.js'; 

// Importamos controladores de Salidas e Historial
import { registrarSalida } from '../controllers/outputs.controller.js'; 
import { obtenerHistorial } from '../controllers/history.controller.js';

// --- AQUÍ ESTÁ LA CORRECCIÓN: Se agregó guardarNotaIngreso ---
import { guardarNotaIngreso, obtenerNotasIngreso, obtenerDetalleNota, obtenerSiguienteSecuencial } from '../controllers/notes.controller.js';

// Importamos middlewares de seguridad
import { protegerRuta, verificarRol } from '../middlewares/auth.middleware.js';

const router = Router();

// --- RUTAS DE DATOS MAESTROS ---
router.get('/maestros', protegerRuta, obtenerMaestros);
router.post('/maestros', protegerRuta, verificarRol([1, 2]), agregarDatoMaestro);

// --- RUTAS DE PLANIFICACIÓN DE LOTES ---
router.get('/lotes', protegerRuta, obtenerHistorialLotes); 
router.post('/lotes', protegerRuta, verificarRol([1, 2, 4]), crearLote);

// === RUTAS DE RECEPCIÓN FÍSICA (SINCOT) ===
// RUTA GET para que React lea los lotes "CREADOS"
router.get('/lotes/pendientes', protegerRuta, obtenerLotesPendientes);
// RUTA POST para guardar el ingreso físico (Mágico)
router.post('/ingresos/formal', protegerRuta, verificarRol([1, 2, 4]), registrarIngresoFormal);

// --- RUTAS DE PRODUCTOS ---
router.get('/', protegerRuta, obtenerProductos);
router.post('/', protegerRuta, verificarRol([1, 2]), crearProducto);
router.put('/:id', protegerRuta, verificarRol([1, 2]), actualizarProducto); 
router.delete('/:id', protegerRuta, verificarRol([1]), eliminarProducto);   

// --- RUTAS DE SALIDAS E HISTORIAL ---
router.post('/salida', protegerRuta, verificarRol([1, 2, 4]), registrarSalida);
router.get('/historial', protegerRuta, obtenerHistorial);

// --- RUTAS DE NOTAS DE INGRESO ---
router.post('/notas-ingreso', protegerRuta, guardarNotaIngreso);
router.get('/notas-ingreso', protegerRuta, obtenerNotasIngreso);

// 🚨 IMPORTANTE: 'siguiente' DEBE ir arriba de ':id' 🚨
router.get('/notas-ingreso/siguiente', protegerRuta, obtenerSiguienteSecuencial); 

// La ruta del :id siempre va al final porque es un "comodín"
router.get('/notas-ingreso/:id', protegerRuta, obtenerDetalleNota);
export default router;