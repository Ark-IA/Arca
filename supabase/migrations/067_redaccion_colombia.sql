-- ============================================================
-- Redacción de la respuesta a audios e imágenes (Colombia)
-- ============================================================
--
-- Texto tal como lo escribió el cliente.
--
-- La versión anterior decía «escribinos», que es el imperativo voseante del
-- Río de la Plata. En Colombia no se vosea: allí es «escríbenos». Corregir
-- hacia el voseo fue corregir hacia otro país.
--
-- Queda como lo pidió, sin más ajustes. Es su marca hablándole a sus
-- clientes, y quien sabe cómo suena bien ahí es él.

update ai_configs
set unsupported_media_message =
  '¡Gracias por comunicarte con ARK-IA! 🙌 Para poder ayudarte ya mismo, ¿escribenos por texto todo lo qué necesitás? Así te respondo al instante.';

alter table ai_configs
  alter column unsupported_media_message set default
    '¡Gracias por comunicarte con ARK-IA! 🙌 Para poder ayudarte ya mismo, ¿escribenos por texto todo lo qué necesitás? Así te respondo al instante.';
