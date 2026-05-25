<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**Un espacio de trabajo de bases de datos, open source y de escritorio, para quienes viven en SQL.**

[Sitio web](https://mavicat.kailingteck.com/) · [Releases](https://github.com/chenlong/Mavicat/releases) · [Issues](https://github.com/chenlong/Mavicat/issues) · [Contribuir](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/Web-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?logo=tauri)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Stars](https://img.shields.io/github/stars/chenlong/Mavicat?style=social)](https://github.com/chenlong/Mavicat/stargazers)

<p>
  <strong>README:</strong>
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.de.md">Deutsch</a> |
  <a href="./README.es.md">Español</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.it.md">Italiano</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.ru.md">Русский</a>
</p>
</div>

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

Mavicat lleva los flujos de trabajo profesionales de bases de datos a una app moderna, local-first y extensible. Está construida con Tauri v2, Rust, React y TypeScript para combinar rendimiento nativo con una interfaz rica y rápida de iterar.

Si te gusta el proyecto, deja una estrella. Ayuda a que más desarrolladores lo descubran y a que la hoja de ruta open source avance.

## Por qué Mavicat

- **Un solo workspace para el día a día**: conexiones, esquemas, SQL, resultados, edición de datos, diseño de tablas, exportación, backup, sincronización, migración, Redis e IA.
- **UX familiar de escritorio**: árbol de conexiones compacto, vistas de objetos, pestañas, resultados, menús contextuales y asistentes.
- **Local-first**: perfiles, historial, ajustes y configuración de IA se guardan localmente por defecto.
- **Sin buscar drivers**: los drivers comunes vienen integrados en el backend Rust; para el uso diario no necesitas instalar paquetes JDBC, ODBC o clientes externos.
- **Huella ligera**: Tauri mantiene la app compacta y Rust ejecuta las tareas pesadas de base de datos sin un servicio enorme en segundo plano.
- **Rust + React**: Rust gestiona bases de datos e integración con el sistema; React ofrece editor, grids e interacción.
- **Abierto y extensible**: licencia Apache-2.0 y una hoja de ruta para plugins y drivers prácticos.

## Tour del producto

### Workspace de base de datos todo en uno

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

La pantalla principal reúne árbol de conexiones, editor SQL, grid de resultados, acciones de toolbar y contexto de base de datos. Está pensada para cambiar rápido entre conexiones, bases, tablas, pestañas SQL y exportaciones.

| Área | Para qué sirve |
|---|---|
| Árbol de conexiones | Explorar conexiones, bases, esquemas, tablas, columnas, vistas y claves Redis. |
| Editor SQL | Ejecutar selección o script completo, revisar múltiples resultados, formatear SQL y usar IA por pestaña. |
| Grid de datos | Exportar página actual, resultados filtrados o datos completos a CSV, JSON, Excel y SQL. |
| Herramientas de objetos | Diseñar tablas, ver DDL, exportar diccionarios, hacer backups, comparar esquemas y migrar datos. |
| Runtime nativo | Sin configuración extra de drivers para flujos comunes, con menor uso de memoria y disco. |

## Bases de datos soportadas

| Base de datos | Estado |
|---|---|
| MySQL / MariaDB | Activo |
| PostgreSQL | Activo |
| SQLite | Activo |
| SQL Server | Activo |
| Redis | Activo, con mejoras en navegación y edición de claves |
| Oracle | Planeado, fuera del hito actual |

## Funciones principales

### Workspace de base de datos

- Árbol lateral con estados de conexión, base de datos y tablas.
- Página de objetos por base de datos con vista de lista e iconos.
- Acciones con clic derecho en conexiones, bases de datos, tablas y resultados.
- Interfaz con pestañas para sesiones largas de trabajo.

### Editor SQL

- Monaco Editor con formateo, historial, ejecución de selección o script completo y múltiples resultados.
- Selector de conexión y base de datos por pestaña.
- Ctrl-clic sobre objetos para abrir datos de tabla.
- Asistente de IA por ventana: escribe, explica y optimiza SQL; las escrituras requieren confirmación humana.

### Grid de datos

- Exportación de página actual, todos los datos filtrados o todos los datos.
- CSV, JSON, Excel y SQL.
- Visibilidad de columnas, paginación, copiar como SQL y flujos de resultados.
- En progreso: edición segura con vista previa, commit/rollback, undo y errores más claros.

### Diseñador de tablas

- Campos, claves primarias, índices, vista previa SQL y DDL.
- Diseñado para convertirse en la superficie principal de trabajo con esquemas.

### Importación, exportación, backup y migración

- Asistentes consistentes para exportar, importar, respaldar, ejecutar SQL, sincronizar esquema y transferir datos.
- Diccionario de base de datos en HTML, Excel y Markdown.
- Comparación de esquema con SQL preview antes de ejecutar.
- Migración entre bases de datos con mapeo de campos y conversión conservadora de tipos.

### Redis

- Redis dentro del mismo workspace.
- Navegación jerárquica, búsqueda por prefijo, ver, editar y borrar están en evolución.

## Descargar

- [Sitio oficial](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/chenlong/Mavicat/releases)

Mavicat apunta a macOS, Windows y Linux. Los artefactos disponibles pueden cambiar por hito.

## Desarrollo

```bash
pnpm install
pnpm tauri dev
```

Build:

```bash
pnpm tauri build
```

Checks:

```bash
pnpm run build
pnpm test
cd src-tauri && cargo test
```

## Stack

- Tauri v2
- Rust, SQLx, Tiberius, Redis client
- React 19, TypeScript, Vite, Tailwind CSS
- Monaco Editor
- TanStack Table / virtualización
- XYFlow

## Roadmap

- **P0**: edición segura, mejor ejecución SQL, estados de conexión estables y errores claros.
- **P1**: import/export, schema sync, transferencia de datos, backup/restore con progreso y cancelación.
- **P2**: diseñador de tablas, ER diagrams, diccionario, comentarios, índices, claves foráneas y triggers.
- **P3**: asistentes unificados, sidebar compacta, menús completos y mejor feedback en tareas largas.

## Contribuir

Issues, bugs reproducibles, feedback de UI, casos específicos de bases de datos, traducciones y pull requests son bienvenidos.

## Licencia y notas

[Apache License 2.0](./LICENSE)
