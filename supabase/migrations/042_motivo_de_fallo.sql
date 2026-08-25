-- ============================================================
-- Motivo del fallo de un mensaje
-- ============================================================
--
-- Cuando Meta no puede entregar un mensaje manda un webhook de estado con
-- status='failed' Y un arreglo `errors` que dice por que: fuera de la
-- ventana de 24 horas, numero inalcanzable, bloqueado por calidad, etc.
--
-- El manejador copiaba el estado y TIRABA el motivo. En pantalla quedaba una
-- equis roja sin explicacion, y para averiguar la causa habia que salir a
-- reproducir el envio a mano contra la API de Meta. Guardar el motivo
-- convierte diez minutos de investigacion en una linea legible.

alter table messages add column if not exists error_code integer;
alter table messages add column if not exists error_title text;
alter table messages add column if not exists error_detail text;

comment on column messages.error_code is
  'Codigo de error de Meta cuando el mensaje no se pudo entregar (ej. 131047 = fuera de la ventana de 24 h).';
comment on column messages.error_title is
  'Titulo corto del error, tal como lo manda Meta.';
comment on column messages.error_detail is
  'Descripcion larga del error. Es lo que se le muestra a quien opera.';

-- Solo interesan los mensajes que fallaron: un indice sobre toda la tabla
-- ocuparia espacio para responder una pregunta que solo se hace de ellos.
create index if not exists idx_messages_error_code
  on messages (error_code) where error_code is not null;
