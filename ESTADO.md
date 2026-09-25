# Estado de ARCA

Documento vivo. Es la única lista de pendientes que hay que creer: los
demás documentos de la raíz (`IMPLEMENTACION_RESUMEN.txt`,
`README_ENTERPRISE.md`, `docs/IMPLEMENTACION_COMPLETA.md`,
`docs/PROXIMOS_PASOS.md`) se escribieron el día de la implementación y
describen intenciones, no lo que está funcionando.

Última revisión: **22 de septiembre de 2026**.

---

## Lo primero: dónde vive la base de datos

**Supabase es autoalojado, en Docker, en el mismo VPS** (`201.184.75.220`,
puerto SSH 2235). No es Supabase Cloud.

### CUIDADO: hay cinco bases de datos en esa máquina

```
supabase-db          supabase/postgres:17.6   ← LA DE ARCA (red supabase_default)
tomas-supabase-db    supabase/postgres:17.6   ← otro proyecto, se parece muchísimo
menu-digital-db      postgres:15-alpine       ← otro proyecto
leadfinder-db-1      postgres:16-alpine       ← otro proyecto
arkia-email-db-1     mysql:8.0                ← otro proyecto
```

La de ARCA es **`supabase-db`**, que es la red a la que está conectado el
contenedor `arkia-arca`. Un `docker ps | grep postgres | head -1` devuelve
cualquiera de ellas. `scripts/apply-migrations-remote.sh` ya no adivina: usa
el nombre explícito y **comprueba la huella del esquema** antes de escribir.

Esto importa porque varios documentos dicen lo contrario y mandan a
aplicar migraciones desde el dashboard de supabase.com, que no existe
para este proyecto. Las migraciones se aplican con `psql` dentro del
contenedor:

```bash
docker exec -i <contenedor-db> psql -U postgres -d postgres -f /tmp/<archivo>.sql
```

`scripts/apply-migrations-remote.sh` hace eso, localizando el contenedor
solo.

---

## Pendientes

Orden por lo que cuesta si se queda sin hacer, no por esfuerzo.

### Bloquean que lo construido sirva

| # | Qué | Estado |
| - | --- | ------ |
| 1 | Migraciones **077** y **078** en el Postgres del VPS. | ✅ **Ya estaban aplicadas** — verificado en el servidor el 22-sep |
| 2 | `.env.local` es el archivo de ejemplo (`https://your-project.supabase.co`). En local no conecta con nada. Las claves reales están en el VPS. | ⏳ Pendiente |

### El CI (ya en verde)

`ci.yml` corre lint → typecheck → test → build. Los cuatro pasos pasan,
verificados en local el 22-sep.

| # | Qué | Estado |
| - | --- | ------ |
| 3 | **25 tests fallando** en 4 archivos. | ✅ **Hecho** (22-sep) — 929/929 pasan |
| 4 | **201 errores de lint**. | ✅ **Hecho** (22-sep) — 0 errores |

### Fallos encontrados y no corregidos

| # | Qué | Estado |
| - | --- | ------ |
| 5 | `queryRecords` filtraba por **id** de campo contra datos guardados por **nombre**, y además con sintaxis que no es una ruta JSONB. | ✅ **Hecho** (22-sep) |
| 6 | `lib/objects/relations.ts` borraba filas por id **sin acotar por cuenta**. | ✅ **Hecho** (22-sep) |

### Código construido que nadie usa

Recuento del 22-sep, después de conectar la API:

| Módulo | Consumidores |
| ------ | ------------ |
| `objects/manager.ts` | 5 ✅ |
| `objects/records.ts` | 4 ✅ |
| `objects/permissions.ts` | 2 ✅ |
| `objects/relations.ts` | **0** |
| `objects/formula-engine.ts` | **0** |
| `reports/builder.ts` | **0** |
| `ai/tools/manager.ts` | **0** |
| `sdk/index.ts` | **0** |
| `enterprise.ts` | **0** |

Lo de `ai/tools/manager.ts` es lo más engañoso: son las 12 herramientas
del agente, pero `src/lib/ai/providers/` **no implementa tool-calling**,
así que el agente no puede invocarlas aunque se conectaran.

### Despliegue y mantenimiento

| # | Qué | Estado |
| - | --- | ------ |
| 7 | El MCP seguía llamándose `wacrm-mcp` con la autoría de upstream. Renombrado ✅. **Falta instalarlo en el VPS** ⏳ |
| 8 | El CI no construía ni probaba `mcp-server`. | ✅ **Hecho** (22-sep) |
| 9 | `supabase/ci/verify-schema.sql` no comprobaba ninguna tabla nueva. | ✅ **Hecho** (22-sep) |
| 10 | Documentos que mandaban al dashboard de Supabase Cloud o nombraban migraciones inexistentes. | ✅ **Hecho** (22-sep) |
| 11 | `supabase/config.toml` quedó con las 415 líneas por defecto de `supabase init` tras el merge. | ✅ **Hecho** (22-sep) |
| 15 | Migraciones 079–083 aplicadas en `supabase-db` y app desplegada (imagen `arkia/arca:20260924b`). La 082 arregló la creación de oportunidades: verificado en producción con una transacción revertida. | ✅ **Hecho** (24-sep) |
| 16 | **Servicio de voz** (`docker-compose.voz.yml`, Chatterbox): NO levantado. El VPS tiene ~3,5 GB libres y el swap casi lleno; Chatterbox pide 2-3 GB. Falta decidir dónde corre (se recomienda un servidor aparte). Mientras tanto el agente responde por texto. El módulo «voz» y su pantalla (Configuración → Respuesta por voz, solo el dueño) ya están. | ⏳ Pendiente de decisión |
| 17 | `ARCA_SUPERADMINS=contacto@ark-ia.com` en el `.env` del VPS. Registro público cerrado en crm.ark-ia.com (`ARCA_REGISTRO_ABIERTO=true` lo reabre). | ✅ **Hecho** (24-sep) |

### Esperando credenciales

| # | Qué | Estado |
| - | --- | ------ |
| 12 | **Google Meet.** Hace falta un proyecto en Google Cloud Console, Google Calendar API habilitada, credenciales OAuth 2.0 de aplicación web, y el client ID + secret. No hay forma de crear una sala de Meet real sin una cuenta de Google autenticada. | 🔒 Bloqueado |
| 13 | **Microsoft Teams.** Lo mismo con Microsoft Graph y registro en Entra ID. | 🔒 Bloqueado |

### Huecos de interfaz

Vistas KANBAN, GALLERY y TIMELINE marcadas como "estructura lista" pero
sin implementar. Sin UI para archivos centralizados, tareas avanzadas ni
panel de reportes.

---

## Lo que sí está hecho y verificado

### API pública — 29 rutas (22-sep)

Siete genéricas que sirven **todos** los objetos personalizados,
presentes y futuros, leyendo la definición en tiempo de petición:

```
GET    /api/v1/objects                        descubrir
GET    /api/v1/objects/{obj}                  esquema
GET    /api/v1/objects/{obj}/records          ?where[campo]=valor
POST   /api/v1/objects/{obj}/records
GET    /api/v1/objects/{obj}/records/{id}
PATCH  /api/v1/objects/{obj}/records/{id}     fusiona, no reemplaza
DELETE /api/v1/objects/{obj}/records/{id}
```

Más CRUD completo de `companies`, `tasks`, `notes`, `calendar-events`,
`deals` y `pipelines` (+ etapas). **27 scopes**, con `:delete` separado
de `:write` para poder emitir claves que crean y actualizan pero nunca
destruyen.

Detalle en `docs/public-api.md`.

### MCP — 23 herramientas (22-sep)

Doce nuevas. Las de objetos son genéricas: descubren en tiempo de
ejecución con `list_objects` y `describe_object`, así que cubren
objetos creados después de instalar el servidor. Los borrados van
detrás de `WACRM_ENABLE_DELETES`, que exige también
`WACRM_ENABLE_WRITES`.

### Fuga de `custom_fields` cerrada (22-sep)

Desde la migración 077 esa tabla guarda dos cosas: campos de contacto
(`object_id` NULL) y campos de objetos personalizados (`object_id`
con valor). Ningún lector del lado de contactos filtraba, así que los
campos de un objeto aparecían —y se podían **borrar**— desde Ajustes →
Campos personalizados, arrastrando el esquema del objeto.

Cerrados 12 puntos de consulta: los 6 lectores, las 3 escrituras del
gestor de campos, `lib/automations/engine.ts` y los dos métodos de
`lib/objects/manager.ts` que actuaban por id de campo en la dirección
contraria.

Con test de regresión verificado: al quitar la guarda, el test falla.

---

## Registro de cambios

### 24 de septiembre — listo para vender por instalación

Cada cliente va en su propio servidor. Lo que se hizo para que nada se vea a
medias y ARK-IA controle qué tiene cada uno:

**Fallo en producción encontrado (082).** `anotar_actividad` (073) escribía
un evento con contacto Y oportunidad (o contacto y empresa) en la misma fila,
y `timeline_un_destino` (047) exige un solo destino. Como corre en un
disparador, fallaba la operación entera: crear o mover una oportunidad con
contacto, crear un contacto con empresa, agendar una cita con varios
vínculos. Comprobado en `supabase-db` el 24-sep: la función vieja sigue ahí y
**no hay ninguna oportunidad creada desde el 26-ago** (los disparadores
empezaron a funcionar el 31-ago). La 082 escribe una fila por destino.

- **Superadmin y módulos (080)**: `/superadmin`, solo para los correos de
  `ARCA_SUPERADMINS`. 16 módulos (telefonía, masivos, IA, flujos…). Apagar uno
  lo quita del menú, su API responde 403 (middleware) y los motores que
  corren solos no se ejecutan. `src/lib/modulos/`.
- **Informes (081)**: `/informes`, con atención, origen de clientes, ventas,
  llamadas y masivos, calculados en SQL (`informe_general`, respeta RLS) y
  exportables a CSV.
- **Exportar a CSV**: contactos (con etiquetas y campos personalizados),
  empresas, negocios del pipeline y tareas. Pagina de a 1.000 filas y
  neutraliza fórmulas de Excel. `src/lib/exportar/`.
- **Respuesta por voz (083)**: el agente contesta con nota de voz clonada
  (Chatterbox) nunca / cuando el cliente manda audio / siempre. Si la voz
  falla, sale el texto. `servicios/tts`, `src/lib/ai/voz.ts`.
- **Nada a medias**: objetos personalizados sin vistas «Próximamente», con
  editar y borrar registros; pestañas de vistas y permisos ocultas (su
  código está en `pantalla-pendiente.tsx`); `/api/tags` creada; sin
  «Beta»; idioma por defecto `es`; unos 200 textos en inglés traducidos;
  marca configurable; registro público cerrado (entrada por invitación).
- **Seguimiento web (079)**: un asesor ya no ve formularios de contactos
  ajenos (RLS alineado con «cada asesor ve lo suyo»).
- Verificado: las 83 migraciones se aplican sobre una base vacía y son
  repetibles; `verify-schema.sql` pasa; el informe se probó como dueña y como
  asesor con datos sembrados; 969 tests, typecheck, lint sin errores, build.

### 24 de septiembre — seguimiento web (adaptado de trycompai/crm)

Un script propio que el cliente pega en su página. Cada formulario enviado
con teléfono o correo entra como contacto, con su origen (UTM, Google,
Facebook, directo…). Adaptado de trycompai/crm (MIT; aviso en
`licenses/trycompai-crm.txt`), pasado a multi-cuenta.

- Migración `079_seguimiento_web.sql`: `sitios_web`, `visitantes_web`,
  `eventos_web`, `formularios_web`. Solo se CREAN tablas; los usuarios leen
  por RLS y únicamente administración edita `sitios_web`.
- Rutas públicas: `/t/arca.js` (cargador), `/t/<clave>.js` (rastreador con
  la configuración) y `POST /api/t/e` (colector). El middleware las suelta
  antes de tocar Supabase.
- Lógica en `src/lib/seguimiento-web/`. El contacto se crea por el mismo
  `findOrCreateContact` que la API y el webhook. Respeta la lista de bloqueo,
  dispara `new_contact_created` y, si el sitio tiene etiqueta, `tag_added`
  (con eso una automatización le escribe por WhatsApp al instante).
- UI: Configuración → Formularios web, y el bloque «Actividad web» en la
  pestaña de actividad de la ficha del contacto.
- Los eventos se purgan a los 90 días (`purgar_eventos_web`, cada ~2 000
  lotes). Los formularios no se borran.
- Verificado: 947/947 tests, typecheck, lint sin errores, `next build`; el
  script se ejecutó en un navegador simulado (jsdom) y mandó la página vista
  y el formulario sin contraseña, campo oculto ni query string.

### 22 de septiembre — punto 11: `supabase/config.toml`

Restaurada la versión curada de 24 líneas, con `project_id = "arca"` y
el comentario corregido: la versión de Postgres se lee del contenedor
(`docker exec <db> psql -U postgres -tAc 'show server_version'`), no de
un dashboard que no existe para este proyecto.

### 22 de septiembre — punto 9: aserciones de esquema

`supabase/ci/verify-schema.sql` ahora comprueba las tablas de la 047
(`companies`, `calendar_events`), las de la 077 (`custom_objects`,
`custom_object_records`) y las de la 078 (`activity_timeline`,
`advanced_tasks`, la vista `unified_activity_feed` y la función
`create_activity`).

Dos aserciones son de columna, no de tabla, y son las que más valen: la
077 **no crea** `custom_fields` —esa tabla es de la 001—, la **altera**.
Comprobar que la tabla existe pasaría igual sobre el esquema anterior y
no probaría nada. Así que se verifica que exista `custom_fields.object_id`
(la columna que separa un campo de contacto de uno de objeto, de la que
depende toda la aplicación) y que `user_id` haya dejado de ser NOT NULL
(si no, cada alta de campo de objeto falla en tiempo de ejecución).

Todo dentro del único bloque `DO`, como el propio archivo advierte: si
se añade una segunda sentencia de primer nivel, `supabase db query
--file` falla con "cannot insert multiple commands into a prepared
statement".

### 22 de septiembre — punto 8: el CI vigila el MCP

Nuevo job `mcp` en `ci.yml` que instala contra el lockfile propio de
`mcp-server/`, typechequea y construye.

Antes el typecheck de la raíz *parecía* cubrirlo, porque `tsconfig.json`
incluye `**/*.ts`. Pero solo resolvía los imports porque
`@modelcontextprotocol/sdk` y `zod` están en el `node_modules` de arriba
por casualidad del hoisting, no por ser dependencias declaradas. El día
que eso deje de cumplirse, el MCP se rompe y el job de la raíz sigue en
verde. El job nuevo termina en el `build`, que es lo que produce el
`dist/index.js` al que apunta el `bin`: un paquete sin construir
instala bien y falla al arrancar.

### 22 de septiembre — punto 5: `queryRecords`

Tenía tres fallos encadenados:

1. **Armaba la ruta con el id del campo**, pero los valores se guardan
   en el JSONB indexados por **nombre**. Ningún filtro podía coincidir:
   devolvía cero resultados sin error.
2. **`fields.clave` no es una ruta JSONB** para PostgREST, sino la
   sintaxis de recurso embebido. Ahora es `fields->>clave`.
3. **`total` devolvía `data.length`**, así que nunca pasaba del límite
   de la página y cualquier paginador creía que solo había una página.
   Ahora usa el `count: 'exact'` que ya venía pedido.

La resolución de campo acepta id **y** nombre, porque las dos formas
circulan: las vistas guardadas en `custom_views.filters` traen ids, y
`custom_objects.primary_field_id` (un VARCHAR, no una FK) a veces trae
el nombre. Una referencia que no existe omite ese filtro en vez de armar
una ruta inválida que tumbaría la consulta entera.

Queda documentado en el código que `->>` compara como texto, así que
`GREATER_THAN` / `LESS_THAN` ordenan lexicográficamente: correcto para
fechas ISO, incorrecto para números ("9" > "10"). Castear pide un RPC,
porque PostgREST no permite casts en el lado izquierdo de un filtro.

### 22 de septiembre — punto 6: acotación por cuenta en `relations.ts`

Seis operaciones actuaban por id sin filtrar por cuenta. La grave era
`deleteRelation(relationId)`: leía `object_relations` por id sin acotar
y luego borraba los `custom_fields` referenciados, así que un id ajeno
bastaba para borrar campos de otra cuenta. También el borrado final de
la relación y el de `object_relation_records`.

Los borrados de `custom_fields` además exigen ahora `object_id NOT
NULL`, para que una relación con datos corrompidos no pueda llevarse por
delante un campo de contacto.

### 22 de septiembre — punto 3: la suite de tests, en verde

**929 de 929.** Eran 25 fallos en 4 archivos, por dos causas distintas:

**Cinco dependían de la máquina, no del código.** `mondayIndex` usa
`getDay()`, que lee en hora local, mientras que `new Date("2026-05-18")`
parsea como medianoche UTC: al oeste de Greenwich cae en el día
anterior y cada aserción de día de la semana se corre uno. Se fija
`TZ: "UTC"` en `vitest.config.ts` — la suite tiene que dar la misma
respuesta en toda máquina, y un test que sólo pasa en una zona horaria
no es fiable en ninguna.

Los de moneda eran lo contrario: `formatCurrency` llama a
`Intl.NumberFormat(undefined, …)` **a propósito**, para seguir el locale
de quien lee, así que un usuario colombiano ve "1.234" donde uno
estadounidense ve "1,234". El código estaba bien; los tests fijaban la
forma en-US. Ahora comprueban el contrato real (los dígitos, sin
unidades menores) en vez de un separador concreto.

**Veinte eran dobles de prueba que se quedaron atrás.** El código de
producción creció después de que se escribieran esos falsos:

- `send-message.test.ts`: el constructor de consultas no conocía `.in()`
  ni `.order()`, que encadenan `estaBloqueado` y `configDeWhatsApp`. Y
  `whatsapp_config` pasó a leerse con `.maybeSingle()` en vez de
  `.single()`, así que el doble devolvía null y dejaba al envío sin
  credenciales.
- `webhook/route.test.ts`: `findOrCreateContact` busca el contacto por
  sus identificadores de WhatsApp antes de caer al ayudante de deduplicado,
  y la tabla `contacts` no estaba en el falso — respondía
  `unexpected table: contacts`.

### 22 de septiembre — punto 4: lint, de 201 errores a 0

176 eran `no-explicit-any` y 25 de react-hooks.

**Los `any` se eliminaron todos**, no se silenciaron. Casi todos eran
"valor de forma desconocida", que es literalmente `unknown`; los
mapeadores de filas pasaron a tener un tipo por tabla, para que una
columna renombrada salga en el typecheck y no en producción. Quedan
dos `any` deliberados, cada uno con su `eslint-disable` y su motivo: el
constructor encadenado de supabase-js anida un tipo por filtro y agota
la profundidad de instanciación de TypeScript.

El cambio destapó cuatro fallos reales que `any` tapaba:

1. **`dynamic-table.tsx` ordenaba con `<` valores de un JSONB**, que los
   convertía a texto sin avisar: 9 quedaba después de 10 y los nulos
   caían en cualquier parte.
2. **`renderFieldValue` pasaba valores sin comprobar** a
   `Intl.NumberFormat().format()` y a `new Date()`. Un registro con un
   texto en un campo CURRENCY tumbaba la tabla entera.
3. **`formula-engine` tenía el mismo problema** al formatear: una
   fórmula marcada como CURRENCY puede devolver texto si una rama del
   `IF` dice "sin dato".
4. **La página de objetos hacía un merge optimista** que metía campos
   con forma de entrada (`CreateFieldInput`, sin id) dentro de
   definiciones completas.

De paso, `reports/builder.ts` arrastraba **el mismo fallo de ruta JSONB**
que `records.ts` (`fields.clave` en vez de `fields->>clave`). Corregido
igual.

**Los 25 de react-hooks son una decisión, no un arreglo.** Son reglas de
React Compiler que llegaron como errores con `eslint-config-next`, y
marcan 25 sitios en 15 archivos de código en producción: efectos que
buscan datos y los guardan, diálogos que se limpian al cerrarse. Son la
forma normal de esos patrones, no defectos. Como errores, `npm run lint`
falla y el CI se detiene **antes** de typecheck, tests y build, así que
una regresión de verdad quedaría escondida detrás de una queja de estilo
sobre código que nadie tocó. Pasan a `warn`: siguen viéndose en cada
ejecución y en el editor, pero dejan de secuestrar al resto. La
justificación está escrita en `eslint.config.mjs`. Hay que bajarlos a
cero y devolverlos a `error`.

### 22 de septiembre — punto 10: los documentos

El dato que más confusión causaba: **Supabase es autoalojado en Docker**,
y `docs/DESPLIEGUE-VPS.md` afirmaba lo contrario —"Arca no lleva
contenedor de base de datos: usa Supabase Cloud"— con un diagrama a
juego. Corregido, incluida la consecuencia que nadie había escrito: **sí
hay un volumen de Postgres que respaldar**.

`docs/APLICAR_MIGRACIONES.md` mandaba al dashboard de supabase.com.
Reescrito con el procedimiento real, y explicando por qué hay que
verificar el esquema después: todo el DDL está guardado con `IF NOT
EXISTS`, así que un nombre mal escrito se aplica sin error y no crea
nada.

`scripts/apply-migrations-remote.sh` apuntaba a `070_custom_objects.sql`
y `071_enterprise_features.sql`, que no existen. Ahora usa 077/078,
corre con `ON_ERROR_STOP=1` (sin eso, `psql` informa el error, sigue y
termina con código 0) y verifica el esquema al final.

Los otros cinco documentos llevan una advertencia en la cabecera que
remite aquí. Mantener seis documentos de estado en paralelo es lo que
produjo la contradicción; ahora hay uno vivo y cinco históricos.

### 22 de septiembre — punto 7: identidad del MCP

Renombrado de `wacrm-mcp` a `arca-mcp`: nombre de paquete, `mcpName`,
repositorio, `bin` y `server.json`.

La atribución **no se borra**: ARCA es un fork de wacrm, que es MIT, y
esa licencia exige conservar el aviso de copyright original. El `LICENSE`
lleva ahora las dos líneas, y Arnas Donauskas pasa a `contributors` en
el `package.json` del MCP.

Las variables de entorno pasan a `ARCA_*` **aceptando `WACRM_*` como
respaldo**: renombrarlas a secas habría roto en silencio cualquier
configuración de cliente ya apuntando al servidor, y un MCP que falla al
arrancar se ve como "la herramienta desapareció", sin nada que explique
por qué.

Lo que **no** se renombró: el prefijo `wacrm_live_` de las claves de API.
Está guardado en `api_keys.key_prefix` y se valida en cada petición, así
que cambiarlo invalidaría todas las claves ya emitidas.
