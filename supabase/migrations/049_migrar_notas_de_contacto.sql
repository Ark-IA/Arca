-- ============================================================
-- Unificar las notas
-- ============================================================
--
-- Hasta ahora convivían dos sistemas: `contact_notes` (migración 001, atada a
-- un contacto, sin título, con RLS por autor) y `notes` + `note_targets`
-- (migración 047, colgable de contacto, empresa o negocio).
--
-- Dos sistemas de notas es peor que cualquiera de los dos: quien escribe una
-- no sabe cuál usó, y buscarla exige mirar en los dos lados. Esta migración
-- pasa lo viejo a lo nuevo.
--
-- La tabla vieja NO se borra. Si algo saliera mal, los datos originales
-- siguen ahí; borrarla es una decisión para más adelante, cuando se haya
-- comprobado que nadie la lee.

insert into notes (id, account_id, user_id, title, body, created_at, updated_at)
select
  cn.id,                -- se conserva el identificador: así la migración es
                        -- idempotente y no duplica al reejecutarse
  c.account_id,
  cn.user_id,
  null,                 -- las notas viejas no tenían título
  cn.note_text,
  cn.created_at,
  cn.created_at
from contact_notes cn
join contacts c on c.id = cn.contact_id
where c.account_id is not null
on conflict (id) do nothing;

insert into note_targets (note_id, contact_id, created_at)
select cn.id, cn.contact_id, cn.created_at
from contact_notes cn
join contacts c on c.id = cn.contact_id
join notes n on n.id = cn.id       -- solo las que se pudieron copiar arriba
where not exists (
  select 1 from note_targets nt
  where nt.note_id = cn.id and nt.contact_id = cn.contact_id
);

comment on table contact_notes is
  'OBSOLETA desde la migración 049. Su contenido vive ahora en notes + '
  'note_targets. Se conserva como respaldo; ningún código la lee.';
