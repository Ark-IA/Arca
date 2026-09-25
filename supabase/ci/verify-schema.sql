-- Post-migration assertions for the CI job in
-- `.github/workflows/migrations.yml`.
--
-- `supabase db reset` already fails on any statement Postgres rejects,
-- so this is not about syntax. It's about the quieter failure: a
-- migration that applies cleanly and does nothing. Every DDL statement
-- in this repo is guarded with IF NOT EXISTS / ON CONFLICT so the files
-- can be re-run safely, and that same guard turns a typo'd object name
-- into a silent no-op with a green checkmark.
--
-- Keep this thin. It is a smoke test for "did the migrations actually
-- build the schema", not a spec of it — asserting every column here
-- would just be the migrations restated in a second place, drifting.
DO $$
BEGIN
  -- The core tables, from 001.
  IF to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION 'public.messages is missing — migrations did not apply';
  END IF;
  IF to_regclass('public.whatsapp_config') IS NULL THEN
    RAISE EXCEPTION 'public.whatsapp_config is missing — migrations did not apply';
  END IF;

  -- Supabase provides the storage schema; migrations 016/020/023 write
  -- to it. If it is absent the bucket migrations silently accomplish
  -- nothing, which is precisely the case a plain "no errors" run hides.
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION
      'storage.buckets is missing — the storage schema was not available when the bucket migrations ran';
  END IF;

  -- Buckets are UPSERTed, so their absence means the INSERT never ran.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media') THEN
    RAISE EXCEPTION 'the chat-media bucket row was not created (migration 023)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'flow-media') THEN
    RAISE EXCEPTION 'the flow-media bucket row was not created (migration 016)';
  END IF;

  -- Account scoping (017) is load-bearing for every RLS policy.
  IF to_regclass('public.accounts') IS NULL THEN
    RAISE EXCEPTION 'public.accounts is missing — migration 017 did not apply';
  END IF;

  -- The Twenty-style modules (047). The dashboard screens for
  -- companies, tasks, notes and the calendar all read these, and so
  -- do six of the public API's resources.
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies is missing — migration 047 did not apply';
  END IF;
  IF to_regclass('public.calendar_events') IS NULL THEN
    RAISE EXCEPTION 'public.calendar_events is missing — migration 047 did not apply';
  END IF;

  -- Custom objects (077).
  IF to_regclass('public.custom_objects') IS NULL THEN
    RAISE EXCEPTION 'public.custom_objects is missing — migration 077 did not apply';
  END IF;
  IF to_regclass('public.custom_object_records') IS NULL THEN
    RAISE EXCEPTION 'public.custom_object_records is missing — migration 077 did not apply';
  END IF;

  -- 077 does not CREATE `custom_fields` — that table is from 001. It
  -- ALTERs it, adding the column that separates a contact field
  -- (object_id NULL) from a custom object's field. A table check
  -- would pass on the pre-077 schema and prove nothing, and the whole
  -- separation the application depends on hangs off this column.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'custom_fields'
      AND column_name = 'object_id'
  ) THEN
    RAISE EXCEPTION
      'custom_fields.object_id is missing — migration 077 applied without altering the pre-existing table';
  END IF;

  -- Same trap: 077 drops NOT NULL from user_id so an object's field
  -- can exist without belonging to one person. If this were still
  -- NOT NULL every custom-object field insert would fail at runtime.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'custom_fields'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION
      'custom_fields.user_id is still NOT NULL — migration 077 did not relax it';
  END IF;

  -- Enterprise features (078): two tables, the unified view and the
  -- function the view's writers call.
  IF to_regclass('public.activity_timeline') IS NULL THEN
    RAISE EXCEPTION 'public.activity_timeline is missing — migration 078 did not apply';
  END IF;
  IF to_regclass('public.advanced_tasks') IS NULL THEN
    RAISE EXCEPTION 'public.advanced_tasks is missing — migration 078 did not apply';
  END IF;
  IF to_regclass('public.unified_activity_feed') IS NULL THEN
    RAISE EXCEPTION 'the unified_activity_feed view is missing — migration 078 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_activity'
  ) THEN
    RAISE EXCEPTION 'create_activity() is missing — migration 078 did not apply';
  END IF;

  -- Seguimiento web (079): cuatro tablas y las dos funciones que llama el
  -- colector con la clave de servicio.
  IF to_regclass('public.sitios_web') IS NULL
     OR to_regclass('public.visitantes_web') IS NULL
     OR to_regclass('public.eventos_web') IS NULL
     OR to_regclass('public.formularios_web') IS NULL THEN
    RAISE EXCEPTION 'seguimiento web tables are missing — migration 079 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sumar_visitas_web'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'purgar_eventos_web'
  ) THEN
    RAISE EXCEPTION 'seguimiento web functions are missing — migration 079 did not apply';
  END IF;

  -- Módulos de la instalación (080).
  IF to_regclass('public.modulos_instalacion') IS NULL THEN
    RAISE EXCEPTION 'public.modulos_instalacion is missing — migration 080 did not apply';
  END IF;

  -- Informes (081).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'informe_general'
  ) THEN
    RAISE EXCEPTION 'informe_general() is missing — migration 081 did not apply';
  END IF;

  RAISE NOTICE 'schema verification passed';
END
$$;

-- Two things this file has already been burned by, both verified in CI
-- rather than assumed:
--
-- 1. It must contain EXACTLY ONE statement. `supabase db query --file`
--    sends the whole file as a prepared statement, and a second
--    top-level statement fails with the distinctly unhelpful "cannot
--    insert multiple commands into a prepared statement" (commit
--    f91a6c8). Add assertions INSIDE the DO block above; do not append
--    a second one.
--
-- 2. A RAISE in here really does fail the job. A deliberately false
--    assertion (commit 42c7db0, run 31579334056) surfaced as
--    `failed to execute query: error: ...` and exited 1. This is not a
--    decorative green tick.
