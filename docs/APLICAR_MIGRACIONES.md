# 📋 Instrucciones para Aplicar Migraciones - Supabase Dashboard

## Método Recomendado: Aplicar desde Supabase Dashboard

### Paso 1: Ir al Dashboard de Supabase

1. Abre tu navegador
2. Navega a: **https://supabase.com/dashboard**
3. Inicia sesión con tu cuenta
4. Selecciona tu proyecto **"wacrm"**

---

### Paso 2: Abrir SQL Editor

1. En el menú lateral, haz clic en **"SQL Editor"**
2. Haz clic en **"New query"**

---

### Paso 3: Copiar y Ejecutar Migración 070

1. Abre el archivo `supabase/migrations/070_custom_objects.sql` en tu editor
2. **Copia TODO el contenido** del archivo
3. **Pega** en el SQL Editor de Supabase
4. Haz clic en **"Run"** o presiona `Ctrl+Enter`

**Deberías ver un mensaje de éxito:**
```
Success. No rows returned
```

**Verifica que se crearon las tablas:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'custom_%'
ORDER BY table_name;
```

**Resultado esperado (8 tablas):**
- custom_objects
- custom_fields
- custom_views
- custom_object_records
- field_audit_logs
- object_permissions
- object_relations
- object_relation_records

---

### Paso 4: Copiar y Ejecutar Migración 071

1. Abre el archivo `supabase/migrations/071_enterprise_features.sql` en tu editor
2. **Copia TODO el contenido** del archivo
3. **Pega** en el SQL Editor de Supabase
4. Haz clic en **"Run"** o presiona `Ctrl+Enter`

**Verifica que se crearon las tablas:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (
  table_name = 'custom_reports' OR
  table_name = 'ai_tool_executions' OR
  table_name = 'custom_layouts' OR
  table_name = 'activity_timeline' OR
  table_name = 'advanced_tasks' OR
  table_name = 'centralized_files'
)
ORDER BY table_name;
```

**Resultado esperado (6 tablas):**
- custom_reports
- ai_tool_executions
- custom_layouts
- activity_timeline
- advanced_tasks
- centralized_files

---

### Paso 5: Verificar Vista Unificada

Ejecuta esta consulta para verificar la vista:

```sql
SELECT * FROM unified_activity_feed LIMIT 1;
```

---

### Paso 6: Verificar Funciones

Ejecuta esta consulta para verificar las funciones:

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('create_activity', 'get_activity_metrics')
ORDER BY routine_name;
```

---

## ✅ Verificación Final

Ejecuta este script de verificación completo:

```sql
-- ============================================
-- VERIFICACIÓN DE IMPLEMENTACIÓN ENTERPRISE
-- ============================================

-- 1. Contar tablas custom_objects
SELECT 'Custom Objects Tables' as check_type, COUNT(*) as count
FROM information_schema.tables 
WHERE table_name IN (
  'custom_objects', 'custom_fields', 'custom_views', 
  'custom_object_records', 'field_audit_logs',
  'object_permissions', 'object_relations', 'object_relation_records'
)
UNION ALL
-- 2. Contar tablas enterprise features
SELECT 'Enterprise Features Tables', COUNT(*)
FROM information_schema.tables 
WHERE table_name IN (
  'custom_reports', 'ai_tool_executions', 'custom_layouts',
  'activity_timeline', 'advanced_tasks', 'centralized_files'
)
UNION ALL
-- 3. Verificar vista
SELECT 'Unified View', CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.views 
  WHERE table_name = 'unified_activity_feed'
) THEN 1 ELSE 0 END
UNION ALL
-- 4. Verificar funciones
SELECT 'Functions', COUNT(*)
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('create_activity', 'get_activity_metrics');
```

**Resultado esperado:**
```
check_type              | count
------------------------|-------
Custom Objects Tables   | 8
Enterprise Features     | 6
Unified View            | 1
Functions               | 2
```

---

## 🎉 ¡Listo!

Si todas las verificaciones son correctas, las migraciones se aplicaron exitosamente.

### Siguientes Pasos:

1. **Crear archivo .env.local** (si no existe):
   ```bash
   cp .env.local.example .env.local
   ```

2. **Editar .env.local** con tus credenciales:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://wacrm.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
   ```

3. **Reiniciar el servidor**:
   ```bash
   npm run dev
   ```

4. **Probar la nueva funcionalidad**:
   - Navega a `http://localhost:3000/dashboard/objects`
   - Haz clic en "Nuevo Objeto"
   - Crea tu primer objeto personalizado

---

## 🔍 Solución de Problemas

### Error: "relation already exists"

Las migraciones usan `CREATE TABLE IF NOT EXISTS`, así que deberían ser idempotentes. Si ves este error, ignóralo y continúa.

### Error: "permission denied"

Asegúrate de estar usando una cuenta con privilegios de administrador en el proyecto.

### Error: "function gen_random_uuid() does not exist"

Ejecuta esto primero:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

**¿Necesitas ayuda? Revisa `docs/PROXIMOS_PASOS.md` para más detalles.**
