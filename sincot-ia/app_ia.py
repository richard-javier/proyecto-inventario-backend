from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import pandas as pd

app = Flask(__name__)
CORS(app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def cargar_modelo(nombre_archivo):
    return joblib.load(os.path.join(BASE_DIR, nombre_archivo))

# ==========================================
# 1. CARGA DE TODOS LOS CEREBROS (Archivos .pkl)
# ==========================================
print("Iniciando SINCOT Neural Engine... Cargando modelos...")
modelo_rf = cargar_modelo('random_forest_sincot.pkl')
modelo_xgb = cargar_modelo('xgboost_sincot.pkl')
modelo_lr = cargar_modelo('linear_regression_sincot.pkl')

modelo_iso = cargar_modelo('isolation_forest_sincot.pkl')
modelo_svm = cargar_modelo('one_class_svm_sincot.pkl')

le = cargar_modelo('label_encoder_sincot.pkl')
print("✅ Los 5 Modelos y el Diccionario cargados correctamente.")

# Métricas obtenidas con la partición de prueba reproducible del entrenamiento
# (test_size=0.20 y random_state=42). No representan una confianza individual.
METRICAS_DEMANDA = {
    'XGB': {'mae': 3.52, 'rmse': 10.86, 'r2': -0.62},
    'LR': {'mae': 19.70, 'rmse': 22.64, 'r2': -6.03},
    'RF': {'mae': 7.76, 'rmse': 36.30, 'r2': -17.07},
}

# ==========================================
# 2. RUTAS DE LA API
# ==========================================
@app.route('/skus_entrenados', methods=['GET'])
def obtener_skus():
    try:
        skus = le.classes_.tolist()
        return jsonify({"skus": skus})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/predecir_demanda', methods=['POST'])
def predecir():
    datos = request.json
    try:
        codigo = datos['codigo']
        mes = int(datos['mes'])
        anio = int(datos['anio'])
        precio = float(datos['precio'])
        motor_ia = str(datos.get('motor_ia', 'XGB')).upper()

        if mes < 1 or mes > 12:
            raise ValueError('El mes debe estar entre 1 y 12.')
        if anio < 2000 or anio > 2100:
            raise ValueError('El año indicado no es válido.')
        if precio < 0:
            raise ValueError('El precio no puede ser negativo.')
        
        id_num = le.transform([str(codigo)])[0]
        datos_entrada = pd.DataFrame(
            [[id_num, mes, anio, precio]],
            columns=['Producto_Numerico', 'Mes', 'Año', 'Precio']
        )
        
        # SELECTOR MULTI-MODELO
        if motor_ia == 'XGB':
            prediccion = modelo_xgb.predict(datos_entrada)
            nombre_motor = "XGBoost"
        elif motor_ia == 'LR':
            prediccion = modelo_lr.predict(datos_entrada)
            nombre_motor = "Regresión Lineal Múltiple"
        elif motor_ia == 'RF':
            prediccion = modelo_rf.predict(datos_entrada)
            nombre_motor = "Random Forest Regressor"
        else:
            raise ValueError('Motor de predicción no reconocido.')
        
        # Evitar predicciones negativas de modelos malos
        cantidad_final = int(round(prediccion[0]))
        if cantidad_final < 0: cantidad_final = 0

        return jsonify({
            "motor_utilizado": nombre_motor,
            "cantidad_estimada": cantidad_final,
            "metricas_evaluacion": METRICAS_DEMANDA[motor_ia]
        })
    except Exception as e:
        return jsonify({"error": True, "mensaje": str(e)}), 400

@app.route('/detectar_anomalia', methods=['POST'])
def detectar():
    datos = request.json
    try:
        # 1. Extraer los datos enviados por Node.js (asegurando que sean números flotantes)
        cantidad = float(datos.get('cantidad', 0))
        precio = float(datos.get('precio', 0))
        motor_ia = datos.get('motor_ia', 'ISO') # ISO por defecto
        
        # 2. Calcular el total
        total = cantidad * precio
        
        # 3. Crear el DataFrame con los nombres exactos de las columnas usadas en Colab
        datos_entrada = pd.DataFrame(
            [[cantidad, precio, total]], 
            columns=['Cantidad', 'Precio', 'Total']
        )

        # 4. SELECTOR MULTI-MODELO DE SEGURIDAD
        if motor_ia == 'SVM':
            resultado = modelo_svm.predict(datos_entrada)
            nombre_motor = "One-Class SVM"
        else:
            resultado = modelo_iso.predict(datos_entrada)
            nombre_motor = "Isolation Forest"

        # 5. La IA devuelve -1 si es anomalía, 1 si es normal.
        es_anomalia = bool(resultado[0] == -1)
        
        return jsonify({
            "motor_utilizado": nombre_motor,
            "es_anomalia": es_anomalia
        })
    except Exception as e:
        print(f"Error en /detectar_anomalia: {e}") # Para ver el error exacto en la terminal
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)), debug=os.getenv('FLASK_DEBUG', '0') == '1')
