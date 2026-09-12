# 🚀 Guía de Despliegue en Vercel desde GitHub

Esta guía te explica paso a paso cómo subir este proyecto a un repositorio de **GitHub** y desplegarlo en **Vercel** para que esté disponible en internet de forma pública, rápida y gratuita.

---

## 📋 Estructura y Flujo del Proyecto

- **Página de inicio (`/`):** Carga `templates/paginaWin.html` (portal de WIN con los planes y el botón animado *"Medir Señal"*).
- **Redirección (`/index.html`):** Al hacer clic en el botón *"Medir Señal"*, el usuario es redirigido al escáner Wi-Fi en `templates/index.html`.
- **Botón de retorno:** Desde el escáner se puede regresar a la página principal de WIN con el botón *"← Portal WIN"* del encabezado.

---

## 🛠️ Requisitos Previos

1. Una cuenta gratuita en [GitHub](https://github.com/).
2. Una cuenta gratuita en [Vercel](https://vercel.com/) (puedes iniciar sesión directamente con tu cuenta de GitHub).
3. Tener instalado **Git** en tu computadora (o la app [GitHub Desktop](https://desktop.github.com/)).

---

## 📦 Paso 1: Subir el Proyecto a GitHub

Puedes hacerlo mediante la **Terminal** o con **GitHub Desktop**.

### Opción A: Usando la Terminal (Git CLI)

1. Abre una terminal (PowerShell, Símbolo del sistema o Git Bash) en la carpeta del proyecto (`c:\Users\MARGOTH\Downloads\WIN`).
2. Ve a [GitHub](https://github.com/new) y crea un nuevo repositorio:
   - **Repository name:** por ejemplo `win-wifi-scanner`
   - Déjalo en **Public** (o **Private** si prefieres)
   - **No marques** "Add a README file" ni "Add .gitignore" (el proyecto ya los incluye).
   - Haz clic en **Create repository**.
3. En tu terminal, ejecuta los siguientes comandos reemplazando `TU_USUARIO` y `TU_REPOSITORIO`:

```bash
# 1. Inicializar el repositorio Git local
git init

# 2. Agregar todos los archivos al seguimiento
git add .

# 3. Crear el primer commit
git commit -m "feat: pagina principal WIN y escaner wifi con configuracion vercel"

# 4. Asignar la rama principal como main
git branch -M main

# 5. Conectar con tu repositorio de GitHub
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

# 6. Subir el código a GitHub
git push -u origin main
```

---

### Opción B: Usando GitHub Desktop (Modo Gráfico)

1. Abre **GitHub Desktop**.
2. En el menú superior, selecciona **File** → **Add Local Repository...**.
3. Elige la carpeta: `c:\Users\MARGOTH\Downloads\WIN`.
4. Si te pide crear un repositorio, haz clic en **Create a repository**.
5. Escribe un título para el commit (ej: `Primer despliegue`) y haz clic en **Commit to main**.
6. Haz clic en el botón superior **Publish repository** para subirlo a tu cuenta de GitHub.

---

### Opción C: Directo desde el Navegador Web (Sin instalar Git)

Si no tienes Git instalado en tu computadora:

1. Entra a [GitHub](https://github.com/new) y crea un nuevo repositorio llamado por ejemplo `win-wifi-scanner`.
2. Marca la casilla **"Add a README file"** para inicializarlo.
3. Haz clic en **Create repository**.
4. En la página de tu repositorio, haz clic en el botón **"Add file"** (arriba a la derecha) → **"Upload files"**.
5. Arrastra las carpetas `templates`, `static` y los archivos `vercel.json`, `requirements.txt`, `README.md` y `.gitignore`.
6. En la parte inferior, escribe un mensaje de commit (ej. `Subida inicial`) y presiona el botón verde **"Commit changes"**.

---

## ⚡ Paso 2: Desplegar en Vercel

1. Ingresa a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de **GitHub**.
2. En el Dashboard de Vercel, haz clic en el botón **"Add New..."** (arriba a la derecha) y selecciona **"Project"**.
3. En la lista **"Import Git Repository"**, busca tu repositorio (por ejemplo `win-wifi-scanner`) y haz clic en **"Import"**.
4. En la pantalla de configuración:
   - **Project Name:** Puedes dejar el nombre predeterminado o personalizarlo (ejemplo: `win-cobertura`).
   - **Framework Preset:** Selecciona **"Other"**.
   - **Root Directory:** `./` (déjalo por defecto).
   - **Build and Output Settings:** No necesitas modificar nada (el archivo `vercel.json` incluido en el proyecto gestiona el enrutamiento automáticamente).
5. Haz clic en el botón azul **"Deploy"**.
6. Espera unos 15 a 30 segundos mientras Vercel procesa el despliegue. ¡Verás confeti cuando esté listo! 🎉
7. Vercel te entregará una URL pública con HTTPS (ejemplo: `https://win-cobertura.vercel.app`).

---

## 🔍 Paso 3: Verificación del Funcionamiento en Vercel

Una vez desplegado:

1. **Abre la URL de tu proyecto:** Cargará de inmediato la **Página de WIN** (`templates/paginaWin.html`).
2. **Haz clic en "Medir Señal":** Verás el botón con pulso en la barra superior o en el banner. Al presionarlo te redirigirá a `/index.html`.
3. **Realiza el escaneo:** Selecciona un ambiente (ej. *Sala / Comedor*) y presiona *Iniciar Escaneo*.
   - Medirá **descarga real** (a través de los servidores CDN de Cloudflare).
   - Medirá **latencia (ping)** y **jitter** (vía Google 204).
   - Podrás generar el diagnóstico y enviar el reporte a WhatsApp.
4. **Regresa al Portal:** Haz clic en el enlace **"← Portal WIN"** en el encabezado del escáner para volver a la página de inicio.

---

## ⚙️ ¿Cómo funciona el archivo `vercel.json`?

El archivo `vercel.json` que dejamos configurado en la raíz del proyecto le indica a Vercel las reglas de enrutamiento:

```json
{
  "version": 2,
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/",
      "destination": "/templates/paginaWin.html"
    },
    {
      "source": "/paginaWin",
      "destination": "/templates/paginaWin.html"
    },
    {
      "source": "/paginaWin.html",
      "destination": "/templates/paginaWin.html"
    },
    {
      "source": "/index.html",
      "destination": "/templates/index.html"
    },
    {
      "source": "/index",
      "destination": "/templates/index.html"
    },
    {
      "source": "/scanner",
      "destination": "/templates/index.html"
    },
    {
      "source": "/static/(.*)",
      "destination": "/static/$1"
    }
  ]
}
```

---

## 🔄 Actualizaciones Futuras (Despliegue Continuo)

Cada vez que hagas un cambio en tus archivos y ejecutes:

```bash
git add .
git commit -m "actualizacion de estilos o funcionalidad"
git push
```

**Vercel detectará el cambio automáticamente** y volverá a desplegar la nueva versión en segundos sin que tengas que hacer nada manual.
