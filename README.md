# 📡 WIN Wi-Fi Scanner Web (100% Fibra Óptica)

Prototipo interactivo completo de la Web App **WIN Wi-Fi Scanner Web** para diagnóstico y mapeo de señal Wi-Fi ambiente por ambiente en el hogar.

Diseñado con la identidad visual oficial de **WIN Perú**: paleta en modo oscuro profundo (`#070a12`), acentos en Naranja WIN (`#ff5e00`) y verde confirmación de fibra óptica (`#00d68f`).

---

## 📱 Flujo de 4 Pantallas Interactivas

1. **Paso 1: Bienvenida / Onboarding**
   - Tarjeta superior con icono Wi-Fi naranja: *"Mide tu hogar en 1 minuto - Sin instalar aplicativos ni ingresar a la configuración del router."*
   - Título: **Mapeo Wi-Fi Ambiente por Ambiente**.
   - Ingreso opcional de **DNI o Código de Cliente** (ej: `72849102`).
   - Botón de acción directo para iniciar el diagnóstico.

2. **Paso 2: Selector Inteligente de Ambientes y Niveles**
   - Selector de tipo de hogar: Departamento, Casa de 1 piso, Casa de 2 o más pisos.
   - Selección de habitaciones (Sala/Comedor con router principal, Dormitorio, Estudio/Home Office, Cocina, 2do Piso/Terraza).
   - Posibilidad de agregar ambientes personalizados.

3. **Paso 3: Simulador de Medición de Red en Tiempo Real con Radares/Métricas**
   - Radar animado de radiofrecuencia con ondas circulares expansivas y haz de rotación continuo.
   - Métricas en vivo con contadores animados:
     - **Potencia de Señal Wi-Fi** (%) con barra de color dinámico.
     - **Velocidad de Descarga** (Mbps) en Fibra Simétrica WIN.
     - **Velocidad de Subida** (Mbps).
     - **Latencia (Ping)** y **Jitter** (ms).
   - Mensajes dinámicos de sincronización y botón para avanzar habitación por habitación.

4. **Paso 4: Pantalla de Reporte Inteligente con Acciones de 1-Clic**
   - Resumen de cobertura de la vivienda y semáforo por cada habitación (Excelente, Buena o Crítica).
   - Tarjeta destacada: **Solución Recomendada: WIN Mesh Wi-Fi 6** para eliminar pérdidas de señal por muros o losas.
   - **Acción 1-Clic WhatsApp**: Botón directo con mensaje automático pre-redactado que incluye el DNI del cliente y el diagnóstico de la habitación afectada.
   - **Acción 1-Clic Soporte Telefónico**: Enlace directo a la central técnica de WIN.
   - **Descargar / Imprimir Reporte**: Generación en formato para imprimir o guardar en PDF.
   - **Nueva Medición**: Reinicio rápido del flujo.

---

## 📁 Estructura del Proyecto

```
c:\Users\MARGOTH\Desktop\WIN\
├── app.py                     # Servidor backend HTTP multihilo en Python puro
├── requirements.txt           # Dependencias opcionales
├── run.bat                    # Lanzador rápido con un solo clic para Windows
├── README.md                  # Este documento
├── templates/
│   └── index.html             # Estructura semántica de las 4 pantallas (HTML5)
└── static/
    ├── css/
    │   └── styles.css         # Identidad de marca WIN, modo oscuro, radar y efectos
    └── js/
        ├── app.js             # Lógica interactiva del asistente de 4 pasos y WhatsApp
        └── channels.js        # Módulo auxiliar de espectro de radiofrecuencia
```

---

## 🚀 Cómo Iniciar el Proyecto en Windows

### Opción 1: Con doble clic (Recomendada)
Haz doble clic en **`run.bat`**. Abrirá automáticamente el navegador en `http://localhost:5000` y levantará el servidor web.

### Opción 2: Desde PowerShell o Terminal
```bash
python app.py
```
Y abre tu navegador en:
```
http://localhost:5000
```
