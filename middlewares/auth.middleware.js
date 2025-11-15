import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar la validez del JWT en las peticiones.
 * Si es válido, adjunta la información del usuario (id y rol) a la petición (req.usuario).
 */
export const protegerRuta = (req, res, next) => {
    // 1. Obtener el token del encabezado Authorization
    const authHeader = req.headers['authorization'];
    
    // Verifica si el encabezado existe y tiene el formato "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token o formato incorrecto.' });
    }

    // Obtiene solo el token (lo que va después de 'Bearer ')
    const token = authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token.' });
    }

    // 2. Verificar el token
    try {
        // Verifica el token usando la clave secreta
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Adjunta los datos del usuario decodificados a la request (disponible en los controladores)
        req.usuario = decoded; 
        
        next(); // Continúa al controlador de la ruta
    } catch (err) {
        // Si el token es inválido (expirado, modificado, etc.)
        return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
};