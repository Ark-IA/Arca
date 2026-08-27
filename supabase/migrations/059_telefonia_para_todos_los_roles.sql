-- ============================================================
-- El teléfono, disponible en todos los roles
-- ============================================================
--
-- La telefonía es operación, no configuración: quien atiende necesita el
-- teléfono, y eso incluye a un observador — en un centro de contacto ese rol
-- suele ser un supervisor que escucha y acompaña sin editar el CRM.
--
-- Casi todo ya estaba bien. Las credenciales SIP las lee cada uno de su
-- propia fila, la burbuja no mira el rol, y el generador de extensiones de
-- Asterisk no filtra por rol. Lo único que sobraba era el REGISTRO de la
-- llamada: pedía `agent`, así que un observador podía descolgar y la llamada
-- no quedaba anotada en ninguna parte. Para revisar después eso es peor que
-- no haber podido llamar: la llamada existió y no dejó rastro.
--
-- Un registro de llamada no es contenido que se edite. Es la constancia de
-- algo que ya pasó, y quien lo protagonizó tiene que poder dejarla.

-- Insertar: cualquier miembro, y SOLO su propia llamada.
--
-- Es a la vez más abierto y más estricto que antes: antes un asesor podía
-- insertar una llamada a nombre de cualquiera de la cuenta. `user_id` sale
-- de la sesión, así que nadie puede escribir el registro de otro.
drop policy if exists call_logs_insert on call_logs;
create policy call_logs_insert on call_logs
  for insert with check (
    is_account_member(account_id) and user_id = auth.uid()
  );

-- Actualizar: la propia, o cualquiera si es asesor para arriba.
--
-- Las dos mitades tienen su motivo. La primera deja a un observador cerrar
-- SU llamada con el desenlace — sin eso, cada una de sus llamadas quedaría
-- eternamente «sonando». La segunda conserva lo que ya se podía hacer:
-- anotar o corregir el registro de una llamada del equipo.
drop policy if exists call_logs_update on call_logs;
create policy call_logs_update on call_logs
  for update using (
    is_account_member(account_id)
    and (user_id = auth.uid() or is_account_member(account_id, 'agent'))
  );

-- Leer y borrar no cambian: leer ya era de cualquier miembro, y borrar sigue
-- siendo de administración. Un registro de llamadas que cualquiera pueda
-- borrar no sirve para auditar nada.

comment on table call_logs is
  'Registro de llamadas. Lo escribe el navegador al empezar y al terminar '
  'cada llamada, en cualquier rol: el teléfono está disponible para todos, y '
  'una llamada sin constancia no se puede revisar después.';
