# ARCA - Características Enterprise Añadidas

Este documento describe las nuevas características enterprise inspiradas en Twenty CRM que han sido añadidas a ARCA.

## 📋 Tabla de Contenidos

1. [Objetos Personalizados](#objetos-personalizados)
2. [Campos Dinámicos](#campos-dinálicos)
3. [Vistas Múltiples](#vistas-múltiples)
4. [Permisos Granulares](#permisos-granulares)
5. [Relaciones entre Objetos](#relaciones-entre-objetos)
6. [SDK Declarativo](#sdk-declarativo)
7. [Audit Log](#audit-log)
8. [Bulk Operations](#bulk-operations)

---

## 🎯 Objetos Personalizados

### ¿Qué son?

Los objetos personalizados te permiten crear nuevas entidades de negocio más allá de los objetos estándar (Contactos, Compañías, Oportunidades).

### Objetos Incluidos

**Sistema:**
- Contactos (`contacts`)
- Compañías (`companies`)
- Oportunidades (`deals`)
- Tareas (`tasks`)

**Personalizables:**
- Proyectos
- Tickets de Soporte
- Órdenes de Venta
- Productos
- Eventos
- Y cualquier otro que necesites

### Crear un Objeto desde la UI

1. Ve a `/objects` en el dashboard
2. Click en "Nuevo Objeto"
3. Completa:
   - Nombre singular/plural (para DB): `project`, `projects`
   - Label singular/plural (para UI): `Proyecto`, `Proyectos`
   - Descripción
   - Ícono
   - Vista por defecto

### Crear un Objeto vía Código

```typescript
import { defineObject, Field, View } from '@/lib/sdk';

export const ProjectObject = defineObject({
  nameSingular: 'project',
  namePlural: 'projects',
  labelSingular: 'Proyecto',
  labelPlural: 'Proyectos',
  description: 'Gestión de proyectos de clientes',
  icon: 'Folder',
  defaultView: 'KANBAN',
  fields: [
    Field.TEXT({ 
      name: 'name', 
      label: 'Nombre', 
      required: true, 
      position: 0 
    }),
    Field.CURRENCY({ 
      name: 'budget', 
      label: 'Presupuesto', 
      position: 1 
    }),
    Field.SELECT({
      name: 'status',
      label: 'Estado',
      position: 2,
      options: [
        { id: 'planning', label: 'Planificación', color: '#3b82f6', position: 0 },
        { id: 'in_progress', label: 'En Progreso', color: '#eab308', position: 1 },
        { id: 'completed', label: 'Completado', color: '#22c55e', position: 2 },
      ],
    }),
    Field.DATE({ 
      name: 'deadline', 
      label: 'Fecha Límite', 
      position: 3 
    }),
    Field.LOOKUP({ 
      name: 'client_id', 
      label: 'Cliente', 
      targetObject: 'companies', 
      position: 4 
    }),
  ],
});
```

---

## 🔧 Campos Dinámicos

### Tipos de Campos Soportados

| Tipo | Descripción | Ejemplo de Uso |
|------|-------------|----------------|
| `TEXT` | Texto corto | Nombre, título |
| `TEXT_AREA` | Texto largo | Descripción, notas |
| `NUMBER` | Números | Cantidad, edad |
| `CURRENCY` | Moneda | Precios, presupuestos |
| `DATE` | Fecha | Fecha de vencimiento |
| `DATE_TIME` | Fecha y hora | Timestamp de evento |
| `BOOLEAN` | Verdadero/Falso | Activo, completado |
| `SELECT` | Opción única | Estado, prioridad |
| `MULTI_SELECT` | Múltiples opciones | Tags, habilidades |
| `EMAIL` | Email | Contacto |
| `PHONE` | Teléfono | Contacto |
| `URL` | Enlace web | Portfolio, docs |
| `RATING` | 1-5 estrellas | Calificación |
| `LOOKUP` | Relación 1:N | Cliente, proyecto |
| `MANY_TO_MANY` | Relación M:N | Tags, participantes |
| `FORMULA` | Campo calculado | Total, promedio |
| `FILE` | Archivo adjunto | Documento, PDF |
| `IMAGE` | Imagen | Logo, foto |

### Añadir un Campo

```typescript
import { createCustomObjectsManager } from '@/lib/objects/manager';

const manager = createCustomObjectsManager(supabase, accountId);

await manager.addField(objectId, {
  name: 'priority',
  label: 'Prioridad',
  type: 'SELECT',
  required: true,
  options: [
    { id: 'low', label: 'Baja', color: '#22c55e', position: 0 },
    { id: 'medium', label: 'Media', color: '#eab308', position: 1 },
    { id: 'high', label: 'Alta', color: '#ef4444', position: 2 },
  ],
  visibleInList: true,
});
```

---

## 👁️ Vistas Múltiples

### Tipos de Vista

1. **TABLA** - Vista tabular clásica
   - Ordenable por columnas
   - Filtrable
   - Búsqueda
   - Selección múltiple

2. **KANBAN** - Vista por columnas de estado
   - Agrupado por campo SELECT
   - Drag & drop entre columnas
   - Ideal para pipelines

3. **GALERÍA** - Vista de tarjetas
   - Campo de imagen destacado
   - Grid responsive
   - Ideal para productos, portfolios

4. **TIMELINE** - Línea de tiempo
   - Campos de fecha inicio/fin
   - Vista cronológica
   - Ideal para proyectos, eventos

5. **CALENDARIO** - Vista calendario
   - Integración con fechas
   - Ideal para tareas, eventos

### Crear una Vista

```typescript
import { View, Filter, Sort } from '@/lib/sdk';

const views = {
  // Vista de tabla con filtros
  all: View.TABLE({
    name: 'Todos',
    columns: ['name', 'budget', 'status', 'deadline'],
    filters: [
      Filter.NOT_EQUALS('status', 'completed'),
    ],
    sorts: [Sort.DESC('createdAt')],
  }),

  // Vista kanban por estado
  byStatus: View.KANBAN({
    name: 'Por Estado',
    kanbanFieldId: 'status',
  }),

  // Vista galería
  gallery: View.GALLERY({
    name: 'Galería',
    galleryFieldId: 'image',
  }),

  // Vista timeline
  timeline: View.TIMELINE({
    name: 'Cronología',
    timelineStartFieldId: 'start_date',
    timelineEndFieldId: 'end_date',
  }),
};
```

---

## 🔐 Permisos Granulares

### Niveles de Permiso

| Rol | Leer | Crear | Actualizar | Eliminar |
|-----|------|-------|------------|----------|
| **Owner** | ALL | ALL | ALL | ALL |
| **Admin** | ALL | ALL | ALL | ALL |
| **Agent** | ALL | ALL | OWN | NONE |
| **Viewer** | ALL | NONE | NONE | NONE |

### Scopes de Permiso

- `ALL` - Todos los registros
- `OWN` - Solo registros propios
- `TEAM` - Solo registros del equipo
- `NONE` - Sin acceso

### Configurar Permisos

```typescript
import { createPermissionManager } from '@/lib/objects/permissions';

const permManager = createPermissionManager(supabase, accountId);

// Verificar permiso
const result = await permManager.checkPermission(
  objectId,
  userId,
  'update' // 'read', 'create', 'update', 'delete'
);

if (result.allowed) {
  console.log('Puede editar');
  if (result.restrictedFields) {
    console.log('Campos restringidos:', result.restrictedFields);
  }
}

// Actualizar permisos para un rol
await permManager.updatePermissions(objectId, 'agent', {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
  updateScope: 'OWN', // Solo puede editar los suyos
  restrictedFields: [
    { fieldId: 'budget', canRead: false, canUpdate: false },
  ],
});
```

---

## 🔗 Relaciones entre Objetos

### Tipos de Relación

1. **LOOKUP** (Uno a Muchos)
   - Un proyecto tiene un cliente
   - Una tarea tiene un responsable

2. **MANY_TO_MANY** (Muchos a Muchos)
   - Un proyecto tiene múltiples tags
   - Un evento tiene múltiples participantes

### Crear una Relación

```typescript
import { createRelationManager } from '@/lib/objects/relations';

const relationManager = createRelationManager(supabase, accountId);

// Relación LOOKUP: Proyecto → Cliente
await relationManager.createRelation({
  fromObjectId: projectId,
  toObjectId: companyId,
  relationType: 'LOOKUP',
  fromFieldName: 'client_id',
  isBidirectional: true,
  toFieldName: 'projects', // Campo inverso en Company
  cascadeDelete: false,
});

// Relación MANY_TO_MANY: Proyecto ↔ Tags
await relationManager.createRelation({
  fromObjectId: projectId,
  toObjectId: tagId,
  relationType: 'MANY_TO_MANY',
  fromFieldName: 'tags',
  isBidirectional: true,
  toFieldName: 'projects',
});
```

### Campos ROLLUP

Los campos ROLLUP calculan valores agregados de registros relacionados:

```typescript
// Calcular el total de oportunidades ganadas de un cliente
await relationManager.configureRollup({
  rollupFieldId: 'total_won_amount',
  relationFieldId: 'opportunities', // campo M:N
  targetFieldId: 'amount',
  operation: 'SUM', // COUNT, SUM, AVG, MIN, MAX
});
```

---

## 🛠️ SDK Declarativo

### Importar SDK

```typescript
import { defineObject, Field, View, Filter, Sort } from '@/lib/sdk';
```

### Ejemplo Completo

```typescript
// objects/tickets.ts
import { defineObject, Field, View, Filter, Sort } from '@/lib/sdk';

export const TicketObject = defineObject({
  nameSingular: 'ticket',
  namePlural: 'tickets',
  labelSingular: 'Ticket',
  labelPlural: 'Tickets',
  description: 'Tickets de soporte técnico',
  icon: 'Ticket',
  defaultView: 'KANBAN',
  fields: [
    Field.TEXT({ 
      name: 'title', 
      label: 'Título', 
      required: true, 
      position: 0 
    }),
    Field.TEXT_AREA({ 
      name: 'description', 
      label: 'Descripción', 
      position: 1 
    }),
    Field.SELECT({
      name: 'priority',
      label: 'Prioridad',
      position: 2,
      options: [
        { id: 'low', label: 'Baja', color: '#22c55e', position: 0 },
        { id: 'medium', label: 'Media', color: '#eab308', position: 1 },
        { id: 'high', label: 'Alta', color: '#ef4444', position: 2 },
        { id: 'urgent', label: 'Urgente', color: '#dc2626', position: 3 },
      ],
    }),
    Field.SELECT({
      name: 'status',
      label: 'Estado',
      position: 3,
      options: [
        { id: 'open', label: 'Abierto', color: '#3b82f6', position: 0 },
        { id: 'in_progress', label: 'En Progreso', color: '#eab308', position: 1 },
        { id: 'waiting', label: 'Esperando', color: '#f97316', position: 2 },
        { id: 'resolved', label: 'Resuelto', color: '#22c55e', position: 3 },
        { id: 'closed', label: 'Cerrado', color: '#6b7280', position: 4 },
      ],
    }),
    Field.LOOKUP({
      name: 'assignee_id',
      label: 'Asignado a',
      targetObject: 'profiles',
      position: 4,
    }),
    Field.LOOKUP({
      name: 'customer_id',
      label: 'Cliente',
      targetObject: 'contacts',
      position: 5,
    }),
    Field.DATE_TIME({
      name: 'due_date',
      label: 'Fecha Límite',
      position: 6,
    }),
    Field.RATING({
      name: 'satisfaction',
      label: 'Satisfacción',
      position: 7,
    }),
  ],
});

export const TicketViews = {
  all: View.TABLE({
    name: 'Todos',
    columns: ['title', 'priority', 'status', 'assignee_id', 'due_date'],
    filters: [Filter.NOT_EQUALS('status', 'closed')],
    sorts: [Sort.DESC('createdAt')],
  }),
  kanban: View.KANBAN({
    name: 'Por Estado',
    kanbanFieldId: 'status',
  }),
  myTickets: View.TABLE({
    name: 'Mis Tickets',
    columns: ['title', 'priority', 'status', 'due_date'],
    filters: [
      Filter.EQUALS('assignee_id', '{{currentUserId}}'),
    ],
    sorts: [Sort.ASC('due_date')],
  }),
  overdue: View.TABLE({
    name: 'Vencidos',
    columns: ['title', 'priority', 'assignee_id', 'due_date'],
    filters: [
      Filter.LESS_THAN('due_date', new Date().toISOString()),
      Filter.NOT_EQUALS('status', 'closed'),
    ],
    sorts: [Sort.ASC('due_date')],
  }),
};
```

---

## 📝 Audit Log

### ¿Qué es?

El audit log registra todos los cambios realizados en los registros, incluyendo:
- Quién hizo el cambio
- Cuándo se hizo
- Qué campo cambió
- Valor anterior y nuevo

### Consultar el Historial

```typescript
import { createCustomRecordsManager } from '@/lib/objects/records';

const recordsManager = createCustomRecordsManager(supabase, accountId, userId);

// Historial de un registro específico
const history = await recordsManager.getAuditHistory(recordId);

console.log(history);
// [
//   {
//     id: '...',
//     action: 'UPDATE',
//     fieldId: 'status',
//     oldValue: 'open',
//     newValue: 'in_progress',
//     userId: '...',
//     timestamp: '2024-01-15T10:30:00Z',
//   },
//   ...
// ]

// Historial de todo un objeto
const objectHistory = await recordsManager.getObjectAuditHistory(objectId, 100);
```

---

## 📦 Bulk Operations

### Operaciones Masivas

```typescript
const recordsManager = createCustomRecordsManager(supabase, accountId, userId);

// Bulk Create
const { created, error } = await recordsManager.bulkCreateRecords(objectId, [
  { fields: { name: 'Registro 1', status: 'active' } },
  { fields: { name: 'Registro 2', status: 'active' } },
  { fields: { name: 'Registro 3', status: 'pending' } },
]);

// Bulk Update
const { updated, error } = await recordsManager.bulkUpdateRecords(
  ['id1', 'id2', 'id3'],
  { status: 'archived' }
);

// Bulk Delete
const { deleted, error } = await recordsManager.bulkDeleteRecords(
  ['id1', 'id2', 'id3']
);
```

---

## 🚀 Próximas Características

Las siguientes características están en desarrollo:

- [ ] **Campos Calculados/Fórmulas** - Expresiones tipo spreadsheet
- [ ] **Layouts Personalizables** - Drag-and-drop de campos
- [ ] **Agentes AI con Herramientas** - Agents que ejecutan acciones
- [ ] **Reportes Avanzados** - Builder con filtros cruzados
- [ ] **Gestión de Archivos Centralizada** - File manager tipo Drive
- [ ] **Calendario con Integraciones** - Google Calendar, Outlook
- [ ] **Tareas con Dependencias** - Subtareas, precedencias
- [ ] **Timeline de Actividades** - Feed unificado de actividades

---

## 📞 Soporte

Para preguntas o issues, por favor:
1. Revisa la documentación en `/docs`
2. Abre un issue en GitHub
3. Contacta al equipo de desarrollo

---

**ARCA** - Built with ❤️ inspired by Twenty CRM
