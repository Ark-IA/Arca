-- ============================================================
-- Objetos personalizados: definir entidades propias sin tocar el esquema
-- ============================================================
--
-- Reemplaza a 070_custom_objects.sql, que se escribió contra un Supabase
-- genérico y no contra este. Las diferencias no eran de estilo:
--
--   * Las políticas filtraban `profiles WHERE id = auth.uid()`. Acá
--     `profiles.id` y `profiles.user_id` son UUID distintos y auth.uid()
--     es el segundo, así que ninguna fila coincidía: RLS habría negado
--     todo en silencio y la función se vería vacía. Este archivo usa
--     `is_account_member()`, que es como filtra el resto del proyecto.
--
--   * El rol se miraba en `profiles.role`, texto anulable y heredado. El
--     que manda es `profiles.account_role`, y lo resuelve esa función.
--
--   * `created_by` apuntaba a `profiles(id)` mientras el código guarda
--     `auth.uid()`. Acá apuntan a `auth.users(id)`, que es la convención
--     que ya usaba `custom_fields.user_id`.
--
--   * `custom_fields` ya existía, con datos y en uso por el CRM. Ver más
--     abajo: se amplía en vez de recrearse.
--
-- El número es 077 y no 070 porque 070 a 076 ya están tomados en el
-- servidor por otras migraciones.

-- ------------------------------------------------------------
-- 1. Definición de los objetos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name_singular VARCHAR(100) NOT NULL,
  name_plural VARCHAR(100) NOT NULL,
  label_singular VARCHAR(100) NOT NULL,
  label_plural VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) NOT NULL DEFAULT 'Folder',
  primary_field_id VARCHAR(100),
  default_view VARCHAR(20) DEFAULT 'TABLE',
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{"canRead": "ALL", "canCreate": "ALL", "canUpdate": "ALL", "canDelete": "NONE"}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, name_singular)
);

CREATE INDEX IF NOT EXISTS idx_custom_objects_account ON public.custom_objects(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_objects_active ON public.custom_objects(account_id, is_active);

-- ------------------------------------------------------------
-- 2. Campos: una sola tabla para los dos usos
-- ------------------------------------------------------------
--
-- `custom_fields` ya existe desde los campos personalizados de contactos:
-- la usan el gestor de campos, la ficha de contacto, las automatizaciones
-- y los dos pasos de difusiones, y `contact_custom_values` le tiene una
-- clave foránea. Recrearla no era opción, y tenerla dos veces con el
-- mismo nombre tampoco.
--
-- Así que se amplía. `object_id` es lo que distingue los dos usos:
--
--   object_id IS NULL      -> campo de contacto, el sistema de siempre
--   object_id IS NOT NULL  -> campo de un objeto personalizado
--
-- Las columnas viejas no se renombran a propósito. El código que las usa
-- está en producción y anda; el que se adapta es el nuevo, que todavía no
-- corre. `field_name`, `field_type` y `field_options` siguen siendo los
-- nombres buenos.
ALTER TABLE public.custom_fields
  ADD COLUMN IF NOT EXISTS object_id UUID REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS label VARCHAR(100),
  ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_value JSONB,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS icon VARCHAR(50),
  ADD COLUMN IF NOT EXISTS target_object VARCHAR(100),
  ADD COLUMN IF NOT EXISTS relation_attribute VARCHAR(100),
  ADD COLUMN IF NOT EXISTS formula TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible_in_list BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS column_size INTEGER DEFAULT 150,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Un campo de contacto lo crea una persona; uno de objeto lo crea la
-- definición del objeto y no tiene dueño. Por eso deja de ser obligatorio.
ALTER TABLE public.custom_fields ALTER COLUMN user_id DROP NOT NULL;

-- `label` es obligatorio para los campos de objeto —la interfaz lo
-- muestra— pero no existe en los de contacto, así que la exigencia va
-- condicionada en vez de en la columna.
ALTER TABLE public.custom_fields DROP CONSTRAINT IF EXISTS custom_fields_label_si_es_de_objeto;
ALTER TABLE public.custom_fields
  ADD CONSTRAINT custom_fields_label_si_es_de_objeto
  CHECK (object_id IS NULL OR label IS NOT NULL) NOT VALID;

-- Parcial: dos campos del mismo objeto no pueden llamarse igual, pero los
-- de contacto —todos con object_id nulo— siguen sin esa restricción, que
-- es como venían funcionando.
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_fields_objeto_nombre
  ON public.custom_fields(object_id, field_name)
  WHERE object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_fields_object ON public.custom_fields(object_id);

-- ------------------------------------------------------------
-- 3. Vistas guardadas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'TABLE',
  filters JSONB DEFAULT '[]',
  sorts JSONB DEFAULT '[]',
  columns JSONB,
  kanban_field_id VARCHAR(100),
  timeline_start_field_id VARCHAR(100),
  timeline_end_field_id VARCHAR(100),
  gallery_field_id VARCHAR(100),
  is_default BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_views_object ON public.custom_views(object_id);
CREATE INDEX IF NOT EXISTS idx_custom_views_account ON public.custom_views(account_id);

-- ------------------------------------------------------------
-- 4. Los datos de cada objeto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_object_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fields JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_records_object ON public.custom_object_records(object_id);
CREATE INDEX IF NOT EXISTS idx_custom_records_account ON public.custom_object_records(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_records_created ON public.custom_object_records(created_at DESC);

-- ------------------------------------------------------------
-- 5. Qué cambió, quién y cuándo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  object_id UUID NOT NULL,
  record_id UUID NOT NULL,
  field_id UUID,
  field_name VARCHAR(100),
  action VARCHAR(20) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  -- Sin cascada y anulable: si se borra la persona, el registro de lo que
  -- hizo tiene que sobrevivir. Un audit log que se borra solo no sirve.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON public.field_audit_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_object ON public.field_audit_logs(object_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.field_audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.field_audit_logs(timestamp DESC);

-- ------------------------------------------------------------
-- 6. Permisos por objeto y rol
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.object_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  can_read BOOLEAN DEFAULT true,
  can_create BOOLEAN DEFAULT false,
  can_update BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  read_scope VARCHAR(20) DEFAULT 'ALL',
  create_scope VARCHAR(20) DEFAULT 'ALL',
  update_scope VARCHAR(20) DEFAULT 'OWN',
  delete_scope VARCHAR(20) DEFAULT 'NONE',
  restricted_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, object_id, role)
);

CREATE INDEX IF NOT EXISTS idx_object_permissions_account ON public.object_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_object_permissions_object ON public.object_permissions(object_id);
CREATE INDEX IF NOT EXISTS idx_object_permissions_role ON public.object_permissions(role);

-- ------------------------------------------------------------
-- 7. Relaciones entre objetos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.object_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  from_object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  to_object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  relation_type VARCHAR(30) NOT NULL,
  from_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  to_field_id UUID,
  is_bidirectional BOOLEAN DEFAULT false,
  cascade_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_object_id, from_field_id)
);

CREATE INDEX IF NOT EXISTS idx_object_relations_account ON public.object_relations(account_id);

-- ------------------------------------------------------------
-- 8. Los pares de una relación muchos a muchos
-- ------------------------------------------------------------
--
-- `account_id` va acá aunque se pueda deducir siguiendo la relación: sin
-- esa columna las políticas no tienen por dónde filtrar sin un join, y la
-- versión anterior de esta migración filtraba por una columna que la
-- tabla no tenía — las dos políticas fallaban al crearse.
CREATE TABLE IF NOT EXISTS public.object_relation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  relation_id UUID NOT NULL REFERENCES public.object_relations(id) ON DELETE CASCADE,
  from_record_id UUID NOT NULL,
  to_record_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(relation_id, from_record_id, to_record_id)
);

CREATE INDEX IF NOT EXISTS idx_relation_records_relation ON public.object_relation_records(relation_id);
CREATE INDEX IF NOT EXISTS idx_relation_records_from ON public.object_relation_records(from_record_id);
CREATE INDEX IF NOT EXISTS idx_relation_records_to ON public.object_relation_records(to_record_id);
CREATE INDEX IF NOT EXISTS idx_relation_records_account ON public.object_relation_records(account_id);

-- ------------------------------------------------------------
-- updated_at
-- ------------------------------------------------------------
--
-- `update_updated_at_column()` ya existe y hay doce triggers colgando de
-- ella, así que acá no se toca: solo se enganchan las tablas nuevas.
DROP TRIGGER IF EXISTS update_custom_objects_updated_at ON public.custom_objects;
CREATE TRIGGER update_custom_objects_updated_at
  BEFORE UPDATE ON public.custom_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_fields_updated_at ON public.custom_fields;
CREATE TRIGGER update_custom_fields_updated_at
  BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_views_updated_at ON public.custom_views;
CREATE TRIGGER update_custom_views_updated_at
  BEFORE UPDATE ON public.custom_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_object_records_updated_at ON public.custom_object_records;
CREATE TRIGGER update_custom_object_records_updated_at
  BEFORE UPDATE ON public.custom_object_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_object_permissions_updated_at ON public.object_permissions;
CREATE TRIGGER update_object_permissions_updated_at
  BEFORE UPDATE ON public.object_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Quién ve y quién escribe
-- ============================================================
--
-- La regla de fondo: RLS garantiza el aislamiento por cuenta y un piso de
-- rol; los permisos finos por objeto —scopes OWN/TEAM/ALL, campos
-- restringidos— los resuelve la aplicación, que es donde están escritos.
-- Duplicarlos acá fue justamente lo que trajo los problemas anteriores.
--
-- Definir el esquema (objetos, campos, permisos, relaciones) es cosa de
-- admin. Cargar datos alcanza con ser agente. Mirar, cualquier miembro.
--
-- `custom_fields` NO recibe políticas nuevas: ya tiene las suyas, que
-- exigen admin para escribir. Agregarle otras no las reemplazaría — las
-- políticas se suman con OR— y terminaría abriendo a cualquier miembro
-- los campos de contacto, que hoy solo toca un admin.

ALTER TABLE public.custom_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_object_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_relation_records ENABLE ROW LEVEL SECURITY;

-- ---- custom_objects ----
DROP POLICY IF EXISTS custom_objects_select ON public.custom_objects;
CREATE POLICY custom_objects_select ON public.custom_objects
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS custom_objects_insert ON public.custom_objects;
CREATE POLICY custom_objects_insert ON public.custom_objects
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS custom_objects_update ON public.custom_objects;
CREATE POLICY custom_objects_update ON public.custom_objects
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS custom_objects_delete ON public.custom_objects;
CREATE POLICY custom_objects_delete ON public.custom_objects
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- custom_views ----
DROP POLICY IF EXISTS custom_views_select ON public.custom_views;
CREATE POLICY custom_views_select ON public.custom_views
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS custom_views_insert ON public.custom_views;
CREATE POLICY custom_views_insert ON public.custom_views
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_views_update ON public.custom_views;
CREATE POLICY custom_views_update ON public.custom_views
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_views_delete ON public.custom_views;
CREATE POLICY custom_views_delete ON public.custom_views
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- custom_object_records ----
DROP POLICY IF EXISTS custom_object_records_select ON public.custom_object_records;
CREATE POLICY custom_object_records_select ON public.custom_object_records
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS custom_object_records_insert ON public.custom_object_records;
CREATE POLICY custom_object_records_insert ON public.custom_object_records
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_object_records_update ON public.custom_object_records;
CREATE POLICY custom_object_records_update ON public.custom_object_records
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_object_records_delete ON public.custom_object_records;
CREATE POLICY custom_object_records_delete ON public.custom_object_records
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- field_audit_logs ----
--
-- Se lee y se escribe, pero no se edita ni se borra: no hay políticas de
-- UPDATE ni de DELETE, y sin política no hay permiso. Es a propósito.
DROP POLICY IF EXISTS field_audit_logs_select ON public.field_audit_logs;
CREATE POLICY field_audit_logs_select ON public.field_audit_logs
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS field_audit_logs_insert ON public.field_audit_logs;
CREATE POLICY field_audit_logs_insert ON public.field_audit_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- ---- object_permissions ----
DROP POLICY IF EXISTS object_permissions_select ON public.object_permissions;
CREATE POLICY object_permissions_select ON public.object_permissions
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS object_permissions_write ON public.object_permissions;
CREATE POLICY object_permissions_write ON public.object_permissions
  FOR ALL USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ---- object_relations ----
DROP POLICY IF EXISTS object_relations_select ON public.object_relations;
CREATE POLICY object_relations_select ON public.object_relations
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS object_relations_write ON public.object_relations;
CREATE POLICY object_relations_write ON public.object_relations
  FOR ALL USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ---- object_relation_records ----
DROP POLICY IF EXISTS object_relation_records_select ON public.object_relation_records;
CREATE POLICY object_relation_records_select ON public.object_relation_records
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS object_relation_records_write ON public.object_relation_records;
CREATE POLICY object_relation_records_write ON public.object_relation_records
  FOR ALL USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
COMMENT ON TABLE public.custom_objects IS 'Definiciones de objetos personalizados';
COMMENT ON TABLE public.custom_views IS 'Vistas guardadas: tabla, kanban, línea de tiempo, galería';
COMMENT ON TABLE public.custom_object_records IS 'Datos de los objetos personalizados';
COMMENT ON TABLE public.field_audit_logs IS 'Qué cambió en cada campo, quién y cuándo';
COMMENT ON TABLE public.object_permissions IS 'Permisos por objeto y rol';
COMMENT ON TABLE public.object_relations IS 'Relaciones entre objetos (lookup, muchos a muchos)';
COMMENT ON TABLE public.object_relation_records IS 'Pares de una relación muchos a muchos';
COMMENT ON COLUMN public.custom_fields.object_id IS 'Nulo = campo de contacto; con valor = campo de ese objeto personalizado';
