-- ============================================================
-- Cada flujo elige por qué canales se activa
-- ============================================================
--
-- Hasta ahora un flujo activo se activaba en TODOS los canales conectados,
-- sin manera de decir lo contrario. Eso obliga a duplicar el flujo entero
-- cuando alguien quiere un menú distinto en Instagram, y no deja apagarlo en
-- un canal para probarlo sin molestar a los clientes de los otros.
--
-- El valor por defecto son los tres. Es importante que sea así y no una
-- lista vacía: todos los flujos que ya existen quedan funcionando
-- exactamente igual que ayer, sin que nadie tenga que abrirlos a tocar nada.

alter table flows
  add column if not exists channels text[] not null
    default array['whatsapp','facebook','instagram']::text[];

-- Repara cualquier fila que haya quedado sin canales antes de que la
-- restricción de abajo empezara a impedirlo. Sin esto, añadir la restricción
-- falla sobre esas filas y la migración entera se cae.
update flows
set channels = array['whatsapp','facebook','instagram']::text[]
where channels is null or cardinality(channels) = 0;

-- Un flujo sin ningún canal no se activaría nunca, y desde la interfaz eso
-- se vería como «lo activé y no hace nada»: el peor tipo de fallo, porque no
-- avisa. Se exige al menos uno, y que sean canales reales.
--
-- `cardinality` y NO `array_length`. Sobre un array vacío `array_length`
-- devuelve NULL, no cero, y una condición NULL dentro de un CHECK se da por
-- cumplida: la restricción escrita con `array_length(channels,1) >= 1` deja
-- pasar exactamente el caso que venía a impedir. `cardinality('{}')` es 0.
alter table flows drop constraint if exists flows_channels_check;
alter table flows add constraint flows_channels_check check (
  cardinality(channels) >= 1
  and channels <@ array['whatsapp','facebook','instagram']::text[]
);

comment on column flows.channels is
  'Canales por los que este flujo se activa. El motor compara contra el canal '
  'de la conversación entrante. Por defecto los tres, para que los flujos '
  'anteriores a esta columna sigan comportándose igual.';

-- El motor filtra por canal en cada mensaje entrante, sobre los flujos
-- activos de la cuenta. El índice existente cubre (account_id, status); el
-- canal se comprueba sobre ese conjunto ya reducido, que es pequeño.
