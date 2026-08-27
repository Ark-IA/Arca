-- ============================================================
-- Configurar el sistema pasa a ser cosa de administración
-- ============================================================
--
-- Las guardas de las rutas de API ya exigen `admin` para tocar flujos y
-- automatizaciones. Esto cierra la puerta de atrás: el navegador tiene la
-- clave pública de Supabase, así que cualquiera con la consola abierta podía
-- escribir directo contra la base saltándose la API entera. Las políticas
-- pedían `agent`, y un asesor las pasaba.
--
-- La diferencia de fondo no es cuánto se puede escribir sino el ALCANCE: un
-- asesor que manda un mensaje afecta una conversación; un asesor que edita el
-- flujo de bienvenida cambia lo que le pasa a todos los que escriban a partir
-- de ese momento, y nadie se entera hasta que un cliente se queja.
--
-- LEER no cambia. Un asesor puede seguir consultando qué flujos hay: le sirve
-- para entender por qué una conversación llegó como llegó, y no le permite
-- alterar nada.

-- ------------------------------------------------------------
-- Flujos
-- ------------------------------------------------------------

drop policy if exists flows_insert on flows;
create policy flows_insert on flows
  for insert with check (is_account_member(account_id, 'admin'));

drop policy if exists flows_update on flows;
create policy flows_update on flows
  for update using (is_account_member(account_id, 'admin'));

drop policy if exists flows_delete on flows;
create policy flows_delete on flows
  for delete using (is_account_member(account_id, 'admin'));

-- Los nodos suben con su flujo: dejarlos en `agent` permitiría reescribir el
-- contenido de un flujo sin tocar la fila del flujo, que es exactamente el
-- mismo daño por otra puerta.
drop policy if exists flow_nodes_modify on flow_nodes;
create policy flow_nodes_modify on flow_nodes
  for all using (
    exists (
      select 1 from flows f
      where f.id = flow_nodes.flow_id
        and is_account_member(f.account_id, 'admin')
    )
  );

-- ------------------------------------------------------------
-- Automatizaciones
-- ------------------------------------------------------------

drop policy if exists automations_insert on automations;
create policy automations_insert on automations
  for insert with check (is_account_member(account_id, 'admin'));

drop policy if exists automations_update on automations;
create policy automations_update on automations
  for update using (is_account_member(account_id, 'admin'));

drop policy if exists automations_delete on automations;
create policy automations_delete on automations
  for delete using (is_account_member(account_id, 'admin'));

drop policy if exists automation_steps_modify on automation_steps;
create policy automation_steps_modify on automation_steps
  for all using (
    exists (
      select 1 from automations a
      where a.id = automation_steps.automation_id
        and is_account_member(a.account_id, 'admin')
    )
  );

-- El motor no se ve afectado: corre con la clave de servicio, que no pasa por
-- RLS. Un flujo sigue respondiéndole a un cliente aunque quien lo escribió
-- haya dejado de ser administrador.
