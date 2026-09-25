# Aplicar migraciones

Supabase aquí es **autoalojado, en Docker, en el mismo VPS**. No es Supabase
Cloud: no existe un dashboard de supabase.com donde pegar SQL para este
proyecto.

> Una versión anterior de este documento mandaba justamente ahí. Si alguien la
> siguió y "no encontró el proyecto", era eso.

Las migraciones viven en `supabase/migrations/`, numeradas, y se aplican en
orden dentro del contenedor de Postgres.

---

## La forma corta

Desde la raíz del repositorio, con `SERVIDOR` puesto a la IP del VPS:

```bash
scp -P 2235 supabase/migrations/077_objetos_personalizados.sql root@SERVIDOR:/tmp/
scp -P 2235 supabase/migrations/078_funciones_enterprise.sql   root@SERVIDOR:/tmp/
scp -P 2235 scripts/apply-migrations-remote.sh                 root@SERVIDOR:/tmp/

ssh -p 2235 root@SERVIDOR 'bash /tmp/apply-migrations-remote.sh'
```

El script localiza el contenedor de Postgres, aplica las migraciones con
`ON_ERROR_STOP=1` y **verifica el resultado**. Eso último no es ceremonia: ver
la sección "Por qué no basta con que no dé error".

---

## La forma manual

Si prefieres hacerlo a mano, o necesitas aplicar una migración distinta:

```bash
ssh -p 2235 root@SERVIDOR

# 1. Encontrar el contenedor de la base
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres

# 2. Aplicar, parando en el primer error
docker exec -i <contenedor> \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres < /tmp/077_objetos_personalizados.sql
```

`ON_ERROR_STOP=1` importa. Sin él, `psql` informa el error, **sigue con la
sentencia siguiente** y termina con código 0: una migración a medio aplicar
que se reporta como exitosa.

---

## Por qué no basta con que no dé error

Todo el DDL de este repositorio está guardado con `CREATE TABLE IF NOT EXISTS`
y `ON CONFLICT`, para que las migraciones se puedan volver a correr sin romper
nada. Esa misma propiedad convierte un nombre mal escrito en un no-op
silencioso: la migración "se aplica", no da error, y no crea nada.

Por eso hay que comprobar el esquema después:

```sql
-- Las tablas de la 077 y la 078
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'custom_objects', 'custom_object_records', 'custom_views',
    'field_audit_logs', 'object_permissions', 'object_relations',
    'object_relation_records', 'custom_reports', 'ai_tool_executions',
    'custom_layouts', 'activity_timeline', 'advanced_tasks',
    'centralized_files'
  )
ORDER BY table_name;
```

**Y lo más importante**, que no es una tabla sino una columna:

```sql
-- La 077 NO crea `custom_fields` — esa tabla es de la 001. La ALTERA.
-- Comprobar que la tabla existe pasaría igual sobre el esquema viejo.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'custom_fields'
  AND column_name IN ('object_id', 'user_id');
```

Se esperan dos filas: `object_id` (la columna que separa un campo de contacto
de uno de objeto) y `user_id` con `is_nullable = YES`. Si `object_id` no está,
la 077 no hizo su trabajo aunque no haya dado error. Si `user_id` sigue siendo
`NO`, cada alta de campo de objeto va a fallar en producción.

---

## Después de aplicar

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Y comprobar que lo que dependía de esas migraciones responde:

- `/objects` en el dashboard
- `GET /api/v1/objects` con una clave que tenga el scope `objects:read`

---

## En CI

`.github/workflows/migrations.yml` levanta un Postgres desechable, corre
`supabase db reset` contra `supabase/migrations/` y ejecuta
`supabase/ci/verify-schema.sql`, que hace las mismas comprobaciones de arriba.
Un fallo ahí es una migración que no construye el esquema, no un problema del
job.
