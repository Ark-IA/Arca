#!/usr/bin/env bash
# ============================================================
# Aplica las migraciones pendientes al Postgres de ARCA.
#
# Supabase aquí es AUTOALOJADO, en Docker, en el mismo VPS. No es
# Supabase Cloud: no hay dashboard de supabase.com donde pegar SQL.
# Las migraciones entran con psql dentro del contenedor.
#
# Uso, desde la raíz del repo:
#
#   scp -P 2235 supabase/migrations/079_*.sql root@SERVIDOR:/tmp/
#   scp -P 2235 scripts/apply-migrations-remote.sh root@SERVIDOR:/tmp/
#   ssh -p 2235 root@SERVIDOR 'bash /tmp/apply-migrations-remote.sh /tmp/079_seguimiento_web.sql'
#
# Sin argumentos aplica la lista de abajo (077 y 078, ya aplicadas el
# 22-sep; repetirlas no rompe nada).
#
# Las migraciones son idempotentes (CREATE TABLE IF NOT EXISTS, ON
# CONFLICT), así que volver a correrlas no rompe nada. Esa misma
# propiedad es la que hace necesaria la verificación del final: un
# nombre mal escrito se aplica "sin errores" y no crea nada.
# ============================================================
set -euo pipefail

if [ "$#" -gt 0 ]; then
  MIGRACIONES=("$@")
else
  MIGRACIONES=(
    /tmp/077_objetos_personalizados.sql
    /tmp/078_funciones_enterprise.sql
  )
fi

echo "=========================================="
echo "  ARCA — aplicar migraciones"
echo "=========================================="

# --- El contenedor de la base -------------------------------
#
# NO se adivina. Este VPS aloja cinco bases de datos de proyectos
# distintos —`supabase-db`, `tomas-supabase-db`, `menu-digital-db`,
# `leadfinder-db-1`, `arkia-email-db-1`— y un `docker ps | grep
# postgres | head -1` devuelve la primera que liste el demonio, que
# no tiene por qué ser la de ARCA. Aplicar estas migraciones sobre
# la base de otro proyecto sería un desastre difícil de deshacer.
#
# La de ARCA es `supabase-db`, en la red `supabase_default`, que es
# la red a la que está conectado el contenedor `arkia-arca`.
# `tomas-supabase-db` es otro proyecto y se le parece mucho.
#
# Se puede sobrescribir por si el nombre cambia, pero hay que
# escribirlo a mano: es una decisión, no un descubrimiento.
DB_CONTAINER="${ARCA_DB_CONTAINER:-supabase-db}"

echo
if ! docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "ERROR: no hay ningún contenedor llamado '${DB_CONTAINER}' corriendo."
  echo
  echo "Bases de datos activas en esta máquina:"
  docker ps --format '  {{.Names}}  ({{.Image}})' | grep -iE 'postgres|mysql' || true
  echo
  echo "Si el de ARCA cambió de nombre, indícalo explícitamente:"
  echo "  ARCA_DB_CONTAINER=<nombre> bash $0"
  exit 1
fi

# Confirmar que es la base correcta antes de escribir en ella. Una
# base de ARCA tiene estas dos tablas desde la migración 001; ninguna
# de las otras del servidor las tiene, así que sirven de huella.
echo "Contenedor: ${DB_CONTAINER} — verificando que es la base de ARCA..."
HUELLA=$(docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('whatsapp_config','conversations','accounts');" 2>/dev/null || echo 0)

if [ "${HUELLA}" != "3" ]; then
  echo "ERROR: '${DB_CONTAINER}' no parece la base de ARCA."
  echo "       Se esperaban las tablas whatsapp_config, conversations y accounts;"
  echo "       se encontraron ${HUELLA} de 3. No se aplica nada."
  exit 1
fi
echo "  ✓ es la base de ARCA"

# --- Comprobar que los archivos llegaron --------------------
for archivo in "${MIGRACIONES[@]}"; do
  if [ ! -f "${archivo}" ]; then
    echo
    echo "ERROR: falta ${archivo} en el servidor."
    echo "Cópialo antes con:"
    echo "  scp -P 2235 supabase/migrations/$(basename "${archivo}") root@SERVIDOR:/tmp/"
    exit 1
  fi
done

# --- Aplicar ------------------------------------------------
#
# ON_ERROR_STOP=1 es lo que convierte un error de SQL en un fallo del
# script. Sin eso psql informa el error, sigue con la sentencia
# siguiente y termina con código 0: una migración a medio aplicar
# que se reporta como exitosa.
for archivo in "${MIGRACIONES[@]}"; do
  echo
  echo "Aplicando $(basename "${archivo}")..."
  docker exec -i "${DB_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "${archivo}"
  echo "  ✓ $(basename "${archivo}")"
done

# --- Verificar ----------------------------------------------
#
# No basta con "no hubo errores". Todo el DDL de este repo está
# guardado con IF NOT EXISTS, así que una tabla mal nombrada se
# aplica limpiamente y no crea nada. Esto comprueba que el esquema
# quedó realmente construido.
echo
echo "Verificando..."
APLICO_079=no
for archivo in "${MIGRACIONES[@]}"; do
  case "$(basename "${archivo}")" in 079_*) APLICO_079=si ;; esac
done
docker exec -i -e PGOPTIONS="-c arca.aplico_079=${APLICO_079}" "${DB_CONTAINER}"   psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.custom_objects') IS NULL THEN
    RAISE EXCEPTION 'falta public.custom_objects — la 077 no aplicó';
  END IF;
  IF to_regclass('public.custom_object_records') IS NULL THEN
    RAISE EXCEPTION 'falta public.custom_object_records — la 077 no aplicó';
  END IF;

  -- La 077 no CREA `custom_fields` (esa tabla es de la 001): la
  -- ALTERA. Comprobar que la tabla existe pasaría también sobre el
  -- esquema viejo. Lo que hay que verificar es la columna nueva, de
  -- la que depende toda la separación entre campos de contacto y
  -- campos de objeto.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'custom_fields'
      AND column_name = 'object_id'
  ) THEN
    RAISE EXCEPTION 'falta custom_fields.object_id — la 077 no alteró la tabla existente';
  END IF;

  IF to_regclass('public.activity_timeline') IS NULL THEN
    RAISE EXCEPTION 'falta public.activity_timeline — la 078 no aplicó';
  END IF;
  IF to_regclass('public.unified_activity_feed') IS NULL THEN
    RAISE EXCEPTION 'falta la vista unified_activity_feed — la 078 no aplicó';
  END IF;

  -- La 079 solo se exige si se acaba de aplicar: la verificación corre
  -- también cuando se aplican solo la 077 y la 078.
  IF current_setting('arca.aplico_079', true) = 'si'
     AND (to_regclass('public.sitios_web') IS NULL
          OR to_regclass('public.formularios_web') IS NULL
          OR to_regclass('public.eventos_web') IS NULL
          OR to_regclass('public.visitantes_web') IS NULL) THEN
    RAISE EXCEPTION 'faltan las tablas de seguimiento web — la 079 no aplicó';
  END IF;

  RAISE NOTICE 'verificación correcta';
END
$$;
SQL

echo
echo "=========================================="
echo "  MIGRACIONES APLICADAS"
echo "=========================================="
echo
echo "Siguiente paso: reiniciar la app para que tome el esquema nuevo."
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo
echo "Después, /objects en el dashboard y /api/v1/objects deberían"
echo "responder en lugar de dar error."
