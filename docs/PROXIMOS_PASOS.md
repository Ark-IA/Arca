> [!WARNING]
> **Documento histórico — escrito el día de la implementación (septiembre 2026).**
>
> Describe lo que se construyó ese día y lo que se pensaba hacer después, no lo
> que está funcionando hoy. Concretamente, aquí quedaron cosas que ya no son
> ciertas:
>
> - Las migraciones **no** son `070_custom_objects.sql` ni
>   `071_enterprise_features.sql`. Al integrarse con el resto de la rama se
>   renumeraron a **`077_objetos_personalizados.sql`** y
>   **`078_funciones_enterprise.sql`**; los números 070 y 071 hoy son otras
>   migraciones distintas.
> - Supabase es **autoalojado en Docker**, no Supabase Cloud. No hay dashboard
>   de supabase.com para este proyecto. Ver [APLICAR_MIGRACIONES](APLICAR_MIGRACIONES.md).
> - Varias características marcadas como completas están construidas pero **sin
>   conectar a nada**.
>
> **El estado real está en [ESTADO.md](../ESTADO.md).**

# 🚀 Guía de Implementación - ARCA Enterprise

## Próximos Pasos para Aplicar las Migraciones

### Opción 1: Aplicar desde Supabase Dashboard (Recomendado)

1. **Ir a Supabase Dashboard**
   - Navega a https://supabase.com/dashboard
   - Selecciona tu proyecto `wacrm`

2. **Aplicar Migración 070 (Custom Objects)**
   - Ve a SQL Editor
   - Copia el contenido de `supabase/migrations/070_custom_objects.sql`
   - Pega y ejecuta
   - Verifica que se crearon 8 tablas

3. **Aplicar Migración 071 (Enterprise Features)**
   - Ve a SQL Editor nuevamente
   - Copia el contenido de `supabase/migrations/071_enterprise_features.sql`
   - Pega y ejecuta
   - Verifica que se crearon 6 tablas adicionales + 1 vista

4. **Verificar Tablas Creadas**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'custom_%'
   ORDER BY table_name;
   ```

### Opción 2: Aplicar desde CLI (Requiere Project Ref)

1. **Obtener Project Ref**
   - Ve a Supabase Dashboard → Settings → General
   - Copia el "Project reference ID" (20 caracteres)

2. **Linkear Proyecto**
   ```bash
   cd C:\ProyectosCursor\Arkia\arca
   npx supabase link --project-ref <tu-project-ref>
   ```

3. **Aplicar Migraciones**
   ```bash
   npx supabase db push
   ```

### Opción 3: Desarrollo Local

1. **Iniciar Supabase Local**
   ```bash
   cd C:\ProyectosCursor\Arkia\arca
   npx supabase start
   ```

2. **Las migraciones se aplican automáticamente**
   - El CLI detecta los archivos en `supabase/migrations/`
   - Se aplican en orden alfabético

3. **Verificar**
   ```bash
   npx supabase status
   ```

---

## 📝 Crear Archivo .env.local

Copia `.env.local.example` a `.env.local` y configura:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://wacrm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>

# WhatsApp
ENCRYPTION_KEY=<genera-con-node-e-crypto-randomBytes32.toStringhex>
META_APP_SECRET=<tu-meta-app-secret>

# Site URL (opcional)
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com
```

---

## ✅ Verificación de la Implementación

### 1. Verificar Tablas en SQL Editor

```sql
-- Contar tablas enterprise
SELECT 
  'Custom Objects' as feature, 
  COUNT(*) as tables 
FROM information_schema.tables 
WHERE table_name IN (
  'custom_objects', 'custom_fields', 'custom_views', 
  'custom_object_records', 'field_audit_logs',
  'object_permissions', 'object_relations', 'object_relation_records'
)
UNION ALL
SELECT 
  'Enterprise Features', 
  COUNT(*) 
FROM information_schema.tables 
WHERE table_name IN (
  'custom_reports', 'ai_tool_executions', 'custom_layouts',
  'activity_timeline', 'advanced_tasks', 'centralized_files'
);
```

### 2. Verificar Vistas

```sql
-- Ver vista unificada
SELECT * FROM unified_activity_feed LIMIT 10;
```

### 3. Verificar Funciones

```sql
-- Ver funciones utilitarias
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%activity%'
ORDER BY routine_name;
```

---

## 🧪 Tests Rápidos

### Test 1: Crear Objeto Personalizado

```sql
-- Insertar objeto de prueba
INSERT INTO public.custom_objects (
  account_id,
  name_singular,
  name_plural,
  label_singular,
  label_plural,
  icon,
  primary_field_id
) VALUES (
  '00000000-0000-0000-0000-000000000000', -- Reemplaza con tu account_id
  'project',
  'projects',
  'Proyecto',
  'Proyectos',
  'Folder',
  'name'
);
```

### Test 2: Verificar Permisos

```sql
-- Ver permisos por defecto
SELECT * FROM public.object_permissions 
WHERE object_id = '<object-id-creado>'
ORDER BY role;
```

### Test 3: Crear Actividad

```sql
-- Usar función de actividad
SELECT create_activity(
  '00000000-0000-0000-0000-000000000000', -- account_id
  'contacts',
  '00000000-0000-0000-0000-000000000000', -- contact_id
  'created',
  'Contacto creado',
  'Descripción de prueba',
  '{"source": "migration_test"}',
  'ALL'
);
```

---

## 🔍 Solución de Problemas

### Error: "relation already exists"

Si las tablas ya existen, las migraciones usan `CREATE TABLE IF NOT EXISTS`, así que deberían ser idempotentes. Si hay errores:

```sql
-- Verificar si existe una tabla específica
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'custom_objects'
);
```

### Error: "permission denied"

Asegúrate de estar ejecutando como usuario con privilegios:

```sql
-- Verificar usuario actual
SELECT current_user;

-- Debería ser 'postgres' o un usuario con privilegios
```

### Error: "function gen_random_uuid() does not exist"

Necesitas habilitar la extensión pgcrypto:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 📊 Métricas de la Implementación

- **Tablas creadas:** 14
- **Vistas creadas:** 1
- **Funciones creadas:** 2
- **Índices creados:** 25+
- **Políticas RLS:** 30+
- **Líneas de SQL:** ~750

---

## 🎯 Siguientes Pasos Después de las Migraciones

1. **Reiniciar el servidor de desarrollo**
   ```bash
   npm run dev
   ```

2. **Navegar a la nueva sección**
   - Ve a `/dashboard/objects`
   - Deberías ver la lista de objetos personalizados

3. **Crear primer objeto de prueba**
   - Click en "Nuevo Objeto"
   - Completa el formulario
   - Verifica que se creó en la DB

4. **Probar el SDK**
   ```typescript
   // En la consola del navegador o un componente
   import { defineObject, Field } from '@/lib/sdk';
   
   const TestObject = defineObject({
     nameSingular: 'test',
     namePlural: 'tests',
     labelSingular: 'Prueba',
     labelPlural: 'Pruebas',
     icon: 'Flask',
     fields: [
       Field.TEXT({ name: 'name', label: 'Nombre', required: true }),
     ],
   });
   ```

---

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs de Supabase Dashboard
2. Verifica que las migraciones se aplicaron en orden
3. Asegúrate de tener la última versión del CLI
4. Revisa `docs/IMPLEMENTACION_COMPLETA.md` para detalles

---

**Documentación creada:** Septiembre 2026
**Versión:** 1.0.0
