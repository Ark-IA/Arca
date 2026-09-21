-- ============================================================
-- Buscar en la base de conocimiento de la conexión que corresponde
-- ============================================================
--
-- Las dos funciones de búsqueda filtraban solo por cuenta. Con varias
-- conexiones eso significa que el agente comercial puede citar el manual de
-- soporte en mitad de una venta, y el de soporte puede prometer un descuento
-- que leyó en la documentación comercial.
--
-- Se añade un parámetro en vez de cambiar las funciones existentes: al tener
-- otra firma, quedan como SOBRECARGA y todo lo que llame a las de tres
-- parámetros sigue funcionando igual. Es lo que permite desplegar el esquema
-- antes que el código sin una ventana en la que nada anda.
--
-- El filtro es «compartidos MÁS los de esta conexión»:
--
--   connection_id IS NULL          -> documento de toda la cuenta
--   connection_id = p_connection_id -> documento de esta conexión
--
-- Con `p_connection_id` nulo solo salen los compartidos. Hoy TODOS los
-- documentos tienen la conexión vacía —la columna acaba de nacer— así que
-- todos siguen siendo visibles para todos, exactamente como ayer.

create or replace function public.match_ai_knowledge_fts(
  p_account_id    uuid,
  p_query         text,
  p_match_count   integer,
  p_connection_id uuid
)
returns table (id uuid, content text, rank real) as $$
  select c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) as rank
  from ai_knowledge_chunks c
  where c.account_id = p_account_id
    and c.fts @@ plainto_tsquery('simple', p_query)
    and (c.connection_id is null or c.connection_id = p_connection_id)
  order by rank desc
  limit greatest(p_match_count, 0);
$$ language sql stable security invoker set search_path = public;

-- `plainto_tsquery('simple', ...)` y no `websearch_to_tsquery('spanish', ...)`,
-- que fue el primer intento y no encontraba NADA.
--
-- La columna `fts` es generada con `to_tsvector('simple', content)`. La
-- configuración de la consulta tiene que ser la misma que la del índice: con
-- «spanish» las palabras se derivan a otra raíz y no coinciden ni consigo
-- mismas. Se vio en la prueba — un documento con la palabra «platano» daba
-- cero resultados buscando «platano».
--
-- Cambiar la columna a «spanish» sería mejor para el español, pero es otra
-- decisión y otro día: obliga a regenerar todos los fragmentos y no es lo que
-- esta migración vino a hacer.

create or replace function public.match_ai_knowledge_semantic(
  p_account_id      uuid,
  p_query_embedding text,
  p_match_count     integer,
  p_connection_id   uuid
)
returns table (id uuid, content text, distance real) as $$
  select c.id,
         c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) as distance
  from ai_knowledge_chunks c
  where c.account_id = p_account_id
    and c.embedding is not null
    and (c.connection_id is null or c.connection_id = p_connection_id)
  order by c.embedding <=> p_query_embedding::vector(1536)
  limit greatest(p_match_count, 0);
$$ language sql stable security invoker set search_path = public;

revoke all on function public.match_ai_knowledge_fts(uuid, text, integer, uuid) from public;
grant execute on function public.match_ai_knowledge_fts(uuid, text, integer, uuid) to authenticated, service_role;
revoke all on function public.match_ai_knowledge_semantic(uuid, text, integer, uuid) from public;
grant execute on function public.match_ai_knowledge_semantic(uuid, text, integer, uuid) to authenticated, service_role;

-- Los fragmentos heredan la conexión de su documento. Se repite el dato a
-- propósito: la búsqueda semántica recorre `ai_knowledge_chunks` y unirla con
-- la tabla de documentos en cada consulta encarecería la consulta más
-- caliente del agente.
create or replace function public.heredar_conexion_del_documento()
returns trigger
language plpgsql
as $$
begin
  if new.connection_id is null then
    select d.connection_id into new.connection_id
    from ai_knowledge_documents d where d.id = new.document_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conexion_del_fragmento on ai_knowledge_chunks;
create trigger trg_conexion_del_fragmento
  before insert on ai_knowledge_chunks
  for each row execute function public.heredar_conexion_del_documento();

-- Y se pone al día lo que ya estaba cargado, por si algún documento tuviera
-- conexión antes de que existiera el disparador.
update ai_knowledge_chunks c
set connection_id = d.connection_id
from ai_knowledge_documents d
where d.id = c.document_id
  and c.connection_id is distinct from d.connection_id;
