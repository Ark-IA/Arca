-- ============================================================
-- Segunda puerta de entrada al flujo de recepción
-- ============================================================
--
-- El flujo se dispara con el primer mensaje de cada persona. Eso deja fuera a
-- todo el que ya escribió alguna vez: su primer mensaje ya pasó y no hay forma
-- de repetirlo salvo borrarle el historial.
--
-- Dos problemas en uno:
--
--   1. No se puede PROBAR el flujo con un número conocido. Hay que conseguir
--      un teléfono virgen cada vez.
--   2. Y lo más importante: un cliente que ya conversó con nosotros no puede
--      volver al menú. Le queda solo escribir en texto libre y esperar que el
--      agente de IA entienda, cuando lo que quiere es la lista de opciones.
--
-- La solución son palabras clave sobre el MISMO flujo, no un flujo duplicado:
-- dos grafos idénticos se separan al primer cambio que alguien haga en uno y
-- olvide en el otro.
--
-- Coincidencia EXACTA, no parcial. Con «contiene», un mensaje como
-- «hola, tengo un problema con la factura» abriría el menú en vez de ir al
-- agente de IA, que es justo lo contrario de lo que esa persona necesita.
-- Exigiendo la palabra sola, escribirla es una acción deliberada.

update flows
set trigger_config = jsonb_build_object(
      'keywords', jsonb_build_array(
        'menu', 'menú',        -- con y sin tilde: nadie acentúa al escribir rápido
        'inicio', 'empezar',
        'hola', 'buenas',
        'opciones', 'volver',
        'ayuda'
      ),
      'match_type', 'exact',
      'case_sensitive', false
    )
where name = 'Recepción ARK-IA';

comment on column flows.trigger_config is
  'Configuración del disparador. En los flujos de tipo keyword define qué '
  'palabras lo abren. En los de first_inbound_message las palabras son '
  'OPCIONALES y actúan como segunda puerta: quien ya escribió antes puede '
  'volver al menú escribiéndolas. Sin palabras, el flujo solo atiende el '
  'primer mensaje, igual que siempre.';
