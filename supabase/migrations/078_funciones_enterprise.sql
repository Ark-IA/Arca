-- ============================================================
-- Reportes, línea de tiempo, tareas y archivos
-- ============================================================
--
-- Reemplaza a 071_enterprise_features.sql, que arrastraba los mismos
-- problemas que 070 y algunos propios:
--
--   * Las políticas filtraban `profiles WHERE id = auth.uid()`, y acá
--     auth.uid() es `profiles.user_id`. No coincidía nada.
--
--   * Varias comparaban `created_by = auth.uid()` con la columna
--     apuntando a `profiles(id)`: siempre falso. Acá esas columnas
--     referencian `auth.users(id)`, que es lo que guarda la aplicación.
--
--   * `ai_tool_executions` aceptaba inserciones con `WITH CHECK (true)`:
--     cualquiera podía escribir en el historial de otra cuenta.
--
--   * La vista `unified_activity_feed` leía `p.name`, columna que no
--     existe —es `full_name`—, así que no llegaba a crearse. Y al no ser
--     `security_invoker` habría corrido con los permisos de su dueño,
--     saltándose el RLS y mostrando la actividad de todas las cuentas.
--
--   * `get_activity_metrics` cruzaba dos agregados con CROSS JOIN, lo que
--     repite claves dentro de `jsonb_object_agg` y revienta.

-- ------------------------------------------------------------
-- 1. Reportes guardados
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_account ON public.custom_reports(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_public ON public.custom_reports(account_id, is_public);

-- ------------------------------------------------------------
-- 2. Qué herramienta corrió la IA, con qué y cómo salió
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tool_id VARCHAR(100) NOT NULL,
  parameters JSONB,
  result JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id UUID,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_account ON public.ai_tool_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_user ON public.ai_tool_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_time ON public.ai_tool_executions(executed_at DESC);

-- ------------------------------------------------------------
-- 3. Cómo se arma la ficha de cada objeto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES public.custom_objects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(object_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_layouts_account ON public.custom_layouts(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_layouts_object ON public.custom_layouts(object_id);

-- ------------------------------------------------------------
-- 4. Todo lo que pasó, en orden
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  object_type VARCHAR(100) NOT NULL,
  object_id UUID NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  -- Sin cascada: si se va la persona, lo que hizo se queda.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID,
  related_object_type VARCHAR(100),
  related_object_id UUID,
  visibility VARCHAR(20) DEFAULT 'ALL',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_timeline_account ON public.activity_timeline(account_id);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_object ON public.activity_timeline(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_type ON public.activity_timeline(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_time ON public.activity_timeline(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_user ON public.activity_timeline(user_id);

-- ------------------------------------------------------------
-- 5. Tareas con dependencias y repetición
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advanced_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.advanced_tasks(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_object_type VARCHAR(100),
  related_object_id UUID,
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),
  recurrence_pattern VARCHAR(50),
  recurrence_config JSONB,
  dependencies JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advanced_tasks_account ON public.advanced_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_advanced_tasks_parent ON public.advanced_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_advanced_tasks_assigned ON public.advanced_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_advanced_tasks_status ON public.advanced_tasks(status);
CREATE INDEX IF NOT EXISTS idx_advanced_tasks_due ON public.advanced_tasks(due_date);

DROP TRIGGER IF EXISTS update_advanced_tasks_updated_at ON public.advanced_tasks;
CREATE TRIGGER update_advanced_tasks_updated_at
  BEFORE UPDATE ON public.advanced_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_reports_updated_at ON public.custom_reports;
CREATE TRIGGER update_custom_reports_updated_at
  BEFORE UPDATE ON public.custom_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_layouts_updated_at ON public.custom_layouts;
CREATE TRIGGER update_custom_layouts_updated_at
  BEFORE UPDATE ON public.custom_layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 6. Los archivos, todos en un lugar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.centralized_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  storage_key VARCHAR(500) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  bucket_name VARCHAR(100) DEFAULT 'files',
  folder_path VARCHAR(500),
  object_type VARCHAR(100),
  object_id UUID,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  tags JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centralized_files_account ON public.centralized_files(account_id);
CREATE INDEX IF NOT EXISTS idx_centralized_files_object ON public.centralized_files(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_centralized_files_storage ON public.centralized_files(storage_key);

-- ============================================================
-- Quién ve y quién escribe
-- ============================================================
ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advanced_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centralized_files ENABLE ROW LEVEL SECURITY;

-- ---- custom_reports ----
-- Uno ve los públicos de su cuenta y los propios; edita y borra los propios.
DROP POLICY IF EXISTS custom_reports_select ON public.custom_reports;
CREATE POLICY custom_reports_select ON public.custom_reports
  FOR SELECT USING (
    is_account_member(account_id)
    AND (is_public = true OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS custom_reports_insert ON public.custom_reports;
CREATE POLICY custom_reports_insert ON public.custom_reports
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_reports_update ON public.custom_reports;
CREATE POLICY custom_reports_update ON public.custom_reports
  FOR UPDATE USING (is_account_member(account_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS custom_reports_delete ON public.custom_reports;
CREATE POLICY custom_reports_delete ON public.custom_reports
  FOR DELETE USING (is_account_member(account_id) AND created_by = auth.uid());

-- ---- ai_tool_executions ----
-- El historial es de la cuenta, no personal: un admin tiene que poder
-- auditar qué corrió el agente. Insertar exige pertenecer a la cuenta —
-- antes era `WITH CHECK (true)`, que dejaba escribir en cualquiera.
DROP POLICY IF EXISTS ai_tool_executions_select ON public.ai_tool_executions;
CREATE POLICY ai_tool_executions_select ON public.ai_tool_executions
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS ai_tool_executions_insert ON public.ai_tool_executions;
CREATE POLICY ai_tool_executions_insert ON public.ai_tool_executions
  FOR INSERT WITH CHECK (is_account_member(account_id));

-- ---- custom_layouts ----
DROP POLICY IF EXISTS custom_layouts_select ON public.custom_layouts;
CREATE POLICY custom_layouts_select ON public.custom_layouts
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS custom_layouts_insert ON public.custom_layouts;
CREATE POLICY custom_layouts_insert ON public.custom_layouts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS custom_layouts_update ON public.custom_layouts;
CREATE POLICY custom_layouts_update ON public.custom_layouts
  FOR UPDATE USING (
    is_account_member(account_id)
    AND (created_by = auth.uid() OR is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS custom_layouts_delete ON public.custom_layouts;
CREATE POLICY custom_layouts_delete ON public.custom_layouts
  FOR DELETE USING (
    is_account_member(account_id)
    AND (created_by = auth.uid() OR is_account_member(account_id, 'admin'))
  );

-- ---- activity_timeline ----
-- No se edita ni se borra: sin política, no hay permiso. Es un registro.
DROP POLICY IF EXISTS activity_timeline_select ON public.activity_timeline;
CREATE POLICY activity_timeline_select ON public.activity_timeline
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS activity_timeline_insert ON public.activity_timeline;
CREATE POLICY activity_timeline_insert ON public.activity_timeline
  FOR INSERT WITH CHECK (is_account_member(account_id));

-- ---- advanced_tasks ----
DROP POLICY IF EXISTS advanced_tasks_select ON public.advanced_tasks;
CREATE POLICY advanced_tasks_select ON public.advanced_tasks
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS advanced_tasks_insert ON public.advanced_tasks;
CREATE POLICY advanced_tasks_insert ON public.advanced_tasks
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS advanced_tasks_update ON public.advanced_tasks;
CREATE POLICY advanced_tasks_update ON public.advanced_tasks
  FOR UPDATE USING (
    is_account_member(account_id)
    AND (created_by = auth.uid() OR assigned_to = auth.uid()
         OR is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS advanced_tasks_delete ON public.advanced_tasks;
CREATE POLICY advanced_tasks_delete ON public.advanced_tasks
  FOR DELETE USING (
    is_account_member(account_id)
    AND (created_by = auth.uid() OR is_account_member(account_id, 'admin'))
  );

-- ---- centralized_files ----
DROP POLICY IF EXISTS centralized_files_select ON public.centralized_files;
CREATE POLICY centralized_files_select ON public.centralized_files
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS centralized_files_insert ON public.centralized_files;
CREATE POLICY centralized_files_insert ON public.centralized_files
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS centralized_files_update ON public.centralized_files;
CREATE POLICY centralized_files_update ON public.centralized_files
  FOR UPDATE USING (
    is_account_member(account_id)
    AND (uploaded_by = auth.uid() OR is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS centralized_files_delete ON public.centralized_files;
CREATE POLICY centralized_files_delete ON public.centralized_files
  FOR DELETE USING (
    is_account_member(account_id)
    AND (uploaded_by = auth.uid() OR is_account_member(account_id, 'admin'))
  );

-- ------------------------------------------------------------
-- La actividad, lista para mostrar
-- ------------------------------------------------------------
--
-- `security_invoker` no es opcional: sin eso la vista corre con los
-- permisos de su dueño y se saltea el RLS de activity_timeline, con lo
-- que cualquiera vería la actividad de todas las cuentas. Con esto, cada
-- quien ve lo que su RLS le permite.
--
-- El join va por `user_id` y el nombre sale de `full_name`; la versión
-- anterior unía por `p.id` y pedía `p.name`, que no existe.
DROP VIEW IF EXISTS public.unified_activity_feed;
CREATE VIEW public.unified_activity_feed
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.account_id,
  a.activity_type,
  a.title,
  a.description,
  a.metadata,
  a.user_id,
  a.created_at,
  a.object_type,
  a.object_id,
  p.full_name AS user_name,
  p.avatar_url
FROM public.activity_timeline a
LEFT JOIN public.profiles p
  ON p.user_id = a.user_id AND p.account_id = a.account_id
WHERE a.visibility = 'ALL';

-- ------------------------------------------------------------
-- Funciones
-- ------------------------------------------------------------

-- Deja constancia de algo que pasó.
--
-- SECURITY DEFINER para poder escribir el registro aunque quien llama no
-- tenga permiso de INSERT directo, pero comprueba la pertenencia a la
-- cuenta antes de escribir: si no, sería un agujero para anotar actividad
-- en cuentas ajenas. `search_path` fijo, como pide cualquier función con
-- definer.
CREATE OR REPLACE FUNCTION public.create_activity(
  p_account_id UUID,
  p_object_type VARCHAR,
  p_object_id UUID,
  p_activity_type VARCHAR,
  p_title VARCHAR,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_visibility VARCHAR DEFAULT 'ALL'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  IF NOT is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Sin acceso a esa cuenta';
  END IF;

  INSERT INTO public.activity_timeline (
    account_id, object_type, object_id, activity_type,
    title, description, metadata, user_id, visibility
  ) VALUES (
    p_account_id, p_object_type, p_object_id, p_activity_type,
    p_title, p_description, p_metadata, auth.uid(), p_visibility
  ) RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

-- Cuánta actividad hubo y de qué tipo.
--
-- Los dos agregados van en subconsultas separadas. Antes se cruzaban con
-- CROSS JOIN, y eso repite cada tipo por cada usuario: `jsonb_object_agg`
-- recibe la misma clave dos veces y aborta.
CREATE OR REPLACE FUNCTION public.get_activity_metrics(
  p_account_id UUID,
  p_days INTEGER DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_desde TIMESTAMPTZ := now() - make_interval(days => p_days);
  v_result JSONB;
BEGIN
  IF NOT is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Sin acceso a esa cuenta';
  END IF;

  SELECT jsonb_build_object(
    'total_activities',
      (SELECT count(*) FROM public.activity_timeline
        WHERE account_id = p_account_id AND created_at > v_desde),
    'by_type',
      coalesce((
        SELECT jsonb_object_agg(activity_type, n)
        FROM (
          SELECT activity_type, count(*) AS n
          FROM public.activity_timeline
          WHERE account_id = p_account_id AND created_at > v_desde
          GROUP BY activity_type
        ) t
      ), '{}'::jsonb),
    'by_user',
      coalesce((
        SELECT jsonb_object_agg(clave, n)
        FROM (
          -- Las actividades del sistema no tienen usuario, y una clave
          -- nula haría fallar el agregado.
          SELECT coalesce(user_id::text, 'sistema') AS clave, count(*) AS n
          FROM public.activity_timeline
          WHERE account_id = p_account_id AND created_at > v_desde
          GROUP BY coalesce(user_id::text, 'sistema')
        ) u
      ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
COMMENT ON TABLE public.custom_reports IS 'Reportes guardados, con sus filtros y métricas';
COMMENT ON TABLE public.ai_tool_executions IS 'Qué herramienta corrió la IA, con qué y cómo salió';
COMMENT ON TABLE public.custom_layouts IS 'Cómo se arma la ficha de cada objeto';
COMMENT ON TABLE public.activity_timeline IS 'Todo lo que pasó, en orden';
COMMENT ON TABLE public.advanced_tasks IS 'Tareas con dependencias y repetición';
COMMENT ON TABLE public.centralized_files IS 'Los archivos, todos en un lugar';
COMMENT ON VIEW public.unified_activity_feed IS 'La actividad lista para mostrar, respetando el RLS de quien consulta';
