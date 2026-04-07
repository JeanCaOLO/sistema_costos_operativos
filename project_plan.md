# Sistema de Costos de Operación

## 1. Descripción del Proyecto
Aplicación web de gestión de costos operativos que permite registrar gastos mensuales, calcularlos automáticamente, visualizar resúmenes, generar alertas de presupuesto excedido y exportar datos en CSV y PDF. Orientado a administradores de instalaciones o empresas con múltiples áreas físicas.

## 2. Estructura de Páginas
- `/` - Dashboard (Panel de resumen general)
- `/gastos` - Registro de gastos
- `/areas` - Catálogo de áreas (Áreas + Tipos de área)
- `/alertas` - Alertas de presupuesto
- `/exportar` - Exportación de datos

## 3. Funcionalidades Core
- [x] Layout principal con sidebar de navegación
- [x] Catálogo de Áreas (CRUD)
- [x] Catálogo de Tipos de Área (CRUD)
- [ ] Registro de gastos con categorías y fechas
- [ ] Cálculo automático de totales mensuales por área
- [ ] Panel de resumen con gráficas
- [ ] Alertas cuando el gasto supera el presupuesto asignado
- [ ] Exportación a CSV
- [ ] Exportación a PDF

## 4. Modelo de Datos

### TipoArea
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| nombre | string | Nombre del tipo (ej. Oficina, Almacén) |
| descripcion | string | Descripción breve |
| color | string | Color para identificación visual |

### Area
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| nombre | string | Nombre del área |
| tipoAreaId | string | Referencia al tipo de área |
| presupuestoMensual | number | Presupuesto mensual asignado |
| descripcion | string | Descripción del área |
| activo | boolean | Estado activo/inactivo |

### Gasto
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| areaId | string | Referencia al área |
| concepto | string | Descripción del gasto |
| monto | number | Monto del gasto |
| fecha | string | Fecha del gasto (YYYY-MM-DD) |
| categoria | string | Categoría (Mantenimiento, Servicios, etc.) |

## 5. Integraciones de Backend / Terceros
- Supabase: No conectado — se usa almacenamiento local (localStorage) para persistir datos
- Shopify: No aplica
- Stripe: No aplica

## 6. Plan de Fases de Desarrollo

### Fase 1: Layout + Catálogo de Áreas ✅
- Objetivo: Estructura base de la app y catálogo de áreas con tipos
- Entregable: Sidebar, página de catálogo de áreas con CRUD completo

### Fase 2: Registro de Gastos
- Objetivo: Formulario para registrar gastos vinculados a áreas
- Entregable: Página con tabla de gastos, filtros y alta de gastos

### Fase 3: Panel de Resumen + Cálculo Automático
- Objetivo: Dashboard con gráficas de gastos vs presupuesto por área
- Entregable: Página Dashboard con widgets y gráficas

### Fase 4: Alertas de Presupuesto
- Objetivo: Sistema de alertas automáticas cuando se excede el presupuesto
- Entregable: Página de alertas con historial y configuración

### Fase 5: Exportación de Datos
- Objetivo: Exportar reportes en CSV y PDF
- Entregable: Página de exportación con filtros y descarga
