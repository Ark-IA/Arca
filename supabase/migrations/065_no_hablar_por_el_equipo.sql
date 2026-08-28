-- ============================================================
-- El asistente habla por sí mismo, no por el equipo
-- ============================================================
--
-- El texto anterior decía: «no puedo escuchar audios ni ver imágenes por
-- acá». Es falso, y de la peor manera: es falso sobre la PLATAFORMA. El
-- asistente automático no puede oír el audio, pero un asesor humano abre la
-- conversación, le da play y lo escucha sin problema.
--
-- Decirle a un cliente que algo no se puede cierra una puerta que está
-- abierta. Quien mandó una foto de una factura y lee «no puedo ver imágenes»
-- entiende que mandarla fue inútil y que tiene que describirla con palabras —
-- cuando en realidad la foto ya está en la bandeja y le sirve a la persona
-- que lo atienda.
--
-- El texto nuevo no niega nada. Pide texto para poder ayudar EN ESE MOMENTO,
-- que es lo único cierto y lo único que hace falta.

update ai_configs
set unsupported_media_message =
  '¡Gracias por tu mensaje! 🙌 Para poder ayudarte ya mismo, ¿me contás por texto qué necesitás? Así te respondo al instante.'
-- Solo si nadie lo cambió todavía. Pisar un texto que alguien escribió a
-- mano sería arreglar un problema creando otro.
where unsupported_media_message =
  'Recibí tu mensaje 🙌 pero no puedo escuchar audios ni ver imágenes por acá. ¿Me lo escribís y seguimos?';

alter table ai_configs
  alter column unsupported_media_message set default
    '¡Gracias por tu mensaje! 🙌 Para poder ayudarte ya mismo, ¿me contás por texto qué necesitás? Así te respondo al instante.';

comment on column ai_configs.unsupported_media_message is
  'Respuesta automática cuando llega una nota de voz o una imagen que el '
  'asistente no puede procesar. Pide texto para poder responder al momento; '
  'NO debe decir que el audio o la imagen no se pueden ver, porque un asesor '
  'humano sí puede — el archivo queda en la conversación. Vacío = no se '
  'responde.';
