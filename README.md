# PostgreSQL Backup & Restore Tool

<div align="center">
  <h1>🗄️ PG Migrate</h1>
  <p><strong>Herramienta moderna para backup y restauración de PostgreSQL con soporte Docker</strong></p>
</div>

## ✨ Características

- 🎨 **Interfaz Gráfica Moderna** - Diseño premium con tema oscuro y efectos glassmorphism
- 💾 **Backups Selectivos** - Backup por esquema específico con exclusión de tablas
- 🐳 **Integración Docker** - Restaura backups directamente en contenedores Docker
- ⚡ **Tiempo Real** - Progreso en vivo con WebSocket
- 📊 **Historial Completo** - Seguimiento de todas las operaciones
- 🔌 **Múltiples Conexiones** - Gestiona conexiones a diferentes bases de datos

## 🚀 Inicio Rápido

### Prerequisitos

**Solo necesitas Docker** - la aplicación incluye TODO lo demás (PostgreSQL tools, dependencias, etc.)

- [Docker Desktop](https://www.docker.com/get-started) (Windows/Mac)
- Docker Engine (Linux)

### Instalación Automática (Recomendado)

**Linux/Mac:**
```bash
# 1. Clonar el repositorio
git clone <repository-url>
cd migrate_pst

# 2. Ejecutar script de inicio (hace todo automáticamente)
./start.sh
```

**Windows (PowerShell):**
```powershell
# 1. Clonar el repositorio
git clone <repository-url>
cd migrate_pst

# 2. Ejecutar script de PowerShell
.\start.ps1
```

**Windows (CMD):**
```cmd
REM 1. Clonar el repositorio
git clone <repository-url>
cd migrate_pst

REM 2. Ejecutar script batch
start.bat
```

El script:
- ✅ Verifica que Docker esté instalado y corriendo
- ✅ Construye la imagen con PostgreSQL tools incluidos
- ✅ Inicia todos los servicios
- ✅ Espera a que la aplicación esté lista
- ✅ Abre el navegador automáticamente

### Reconstruir después de cambios

**Linux/Mac:**
```bash
./rebuild.sh
```

**Windows (PowerShell):**
```powershell
.\rebuild.ps1
```

**Windows (CMD):**
```cmd
rebuild.bat
```

### Instalación Manual

```bash
# Construir y levantar servicios
docker-compose up -d --build

# Ver logs
docker-compose logs -f migrate-pst
```

La aplicación estará disponible en `http://localhost:3000`

### Conexiones de Ejemplo Incluidas

El Docker Compose incluye dos bases de datos PostgreSQL de ejemplo:

| Base de Datos | Host | Puerto | Usuario | Contraseña | Database |
|---------------|------|--------|---------|------------|----------|
| **Source** | localhost | 5432 | postgres | postgres | source_db |
| **Target** | localhost | 5433 | postgres | postgres | target_db |

### Sin Docker (Desarrollo Local)

Si prefieres ejecutar sin Docker:

## 📖 Uso

### 1. Agregar Conexión

1. Navega a **Conexiones**
2. Haz clic en **Nueva Conexión**
3. Ingresa los datos de tu base de datos PostgreSQL
4. Opcionalmente marca "Es un contenedor Docker" y selecciona el contenedor
5. Prueba la conexión y guarda

### 2. Crear Backup

1. Navega a **Crear Backup**
2. Selecciona la conexión de origen
3. Elige el esquema a respaldar
4. (Opcional) Selecciona tablas a excluir
5. Haz clic en **Ejecutar Backup**
6. Observa el progreso en tiempo real

### 3. Restaurar Backup

1. Navega a **Restaurar**
2. Selecciona el backup a restaurar
3. Elige la conexión de destino (puede ser local o Docker)
4. Haz clic en **Restaurar Backup**
5. Confirma la operación

### 4. Gestionar Contenedores Docker

1. Navega a **Docker**
2. Ve la lista de contenedores PostgreSQL disponibles
3. Crea conexiones directamente desde contenedores

## 🏗️ Arquitectura

```
migrate_pst/
├── server.js                 # Servidor Express principal
├── src/
│   ├── db/
│   │   └── config.js        # Base de datos SQLite (configuración)
│   └── services/
│       ├── postgres.js      # Operaciones PostgreSQL
│       ├── docker.js        # Gestión de contenedores Docker
│       ├── backup.js        # Servicio de backup (pg_dump)
│       └── restore.js       # Servicio de restauración (pg_restore)
├── public/
│   ├── index.html          # Interfaz web
│   ├── css/
│   │   └── style.css       # Estilos premium
│   └── js/
│       └── app.js          # Lógica frontend
├── data/                   # Base de datos de configuración
├── backups/               # Almacenamiento de backups
└── docker-compose.yml     # Configuración Docker
```

## 🔧 Configuración

Variables de entorno disponibles en `.env`:

```env
PORT=3000                              # Puerto del servidor
CONFIG_DB_PATH=./data/config.db       # Ruta BD configuración
BACKUP_DIR=./backups                  # Directorio de backups
DOCKER_SOCKET=/var/run/docker.sock   # Socket Docker
```

## 📋 API Endpoints

### Conexiones
- `GET /api/connections` - Listar conexiones
- `POST /api/connections` - Crear conexión
- `PUT /api/connections/:id` - Actualizar conexión
- `DELETE /api/connections/:id` - Eliminar conexión
- `POST /api/connections/test` - Probar conexión

### Backups
- `POST /api/backups` - Crear backup
- `GET /api/backups` - Listar backups
- `DELETE /api/backups/:id` - Eliminar backup

### Restauración
- `POST /api/restore` - Restaurar backup
- `GET /api/restores` - Historial de restauraciones

### Docker
- `GET /api/docker/containers` - Listar contenedores PostgreSQL
- `GET /api/docker/test` - Probar conexión Docker

## 🎨 Características de la Interfaz

- **Diseño Moderno**: Tema oscuro con gradientes vibrantes
- **Glassmorphism**: Efectos de vidrio y blur para elementos
- **Animaciones Suaves**: Transiciones y micro-animaciones
- **Responsive**: Funciona en desktop y móvil
- **Feedback en Tiempo Real**: WebSocket para actualizaciones instantáneas

## 🔒 Seguridad

- Las contraseñas se almacenan en SQLite local (considera encriptación para producción)
- El socket de Docker requiere permisos apropiados
- Valida siempre las conexiones antes de guardarlas

## 🐛 Solución de Problemas

### PostgreSQL client tools no encontrados
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
apt-get install postgresql-client

# Alpine (Docker)
apk add postgresql-client
```

### Error de conexión a Docker
- Verifica que Docker esté corriendo
- Asegúrate de que el socket Docker sea accesible
- En macOS/Windows, usa Docker Desktop

### Backups fallan
- Verifica credenciales de la base de datos
- Asegúrate de que el esquema exista
- Revisa los logs del servidor para más detalles

## 📝 Roadmap

- [ ] Filtrado avanzado de filas (WHERE clauses)
- [ ] Backups programados (cron)
- [ ] Compresión de backups
- [ ] Encriptación de backups
- [ ] Soporte para múltiples formatos (tar, directory)
- [ ] Notificaciones por email
- [ ] Métricas y monitoreo

## 📜 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas! Por favor abre un issue o pull request.

---

<div align="center">
  Hecho con ❤️ para simplificar los backups de PostgreSQL
</div>
