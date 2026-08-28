-- ============================================================
-- Redacción de la respuesta a audios e imágenes
-- ============================================================
--
-- Texto pedido por el cliente, con dos correcciones de ortografía:
--
--   «escribenos»  ->  «escribinos»
--       El resto del mensaje vosea («necesitás», «te respondo»), y el
--       imperativo voseante de escribir es «escribí» / «escribinos». Con
--       «escribenos» quedaría mezclado, y además sin tilde no es tuteo
--       correcto tampoco: sería «escríbenos».
--
--   «todo lo qué necesitás»  ->  «todo lo que necesitás»
--       Aquí «que» es un relativo, no una pregunta. La tilde diacrítica
--       solo va en interrogativos y exclamativos: «¿qué necesitás?» lleva,
--       «todo lo que necesitás» no. El signo de pregunta que envuelve la
--       frase no lo cambia — lo interrogado es la petición entera, no el
--       «que».
--
-- Se corrigen porque esto lo lee cada cliente que manda un audio, y una
-- tilde de más en una plataforma que se vende como profesional se nota.

update ai_configs
set unsupported_media_message =
  '¡Gracias por comunicarte con ARK-IA! 🙌 Para poder ayudarte ya mismo, ¿escribinos por texto todo lo que necesitás? Así te respondo al instante.';

alter table ai_configs
  alter column unsupported_media_message set default
    '¡Gracias por comunicarte con ARK-IA! 🙌 Para poder ayudarte ya mismo, ¿escribinos por texto todo lo que necesitás? Así te respondo al instante.';
