/**
 * Piezas compartidas entre el servidor y el navegador para la telefonia.
 *
 * El nombre del endpoint en Asterisk se arma aca y en el generador de
 * configuracion del servidor (`/opt/arkia/asterisk/generar-extensiones.sh`).
 * Si alguna vez cambia, tiene que cambiar en los dos lados o los telefonos
 * dejan de registrarse sin decir por que.
 */

/** Una extension es un numero de 3 a 6 digitos. Igual que en la base. */
export const EXTENSION_REGEX = /^[0-9]{3,6}$/

export function esExtensionValida(valor: string): boolean {
  return EXTENSION_REGEX.test(valor.trim())
}

/**
 * Nombre del endpoint tal como lo conoce Asterisk.
 *
 * La extension sola no alcanza: es unica dentro de una cuenta, no en toda la
 * central. Dos organizaciones pueden tener su 1001 y Asterisk las veria como
 * el mismo telefono. El prefijo -- los primeros 8 caracteres del identificador
 * de cuenta -- las separa.
 */
export function nombreEndpoint(accountId: string, extension: string): string {
  return `${prefijoCuenta(accountId)}_${extension}`
}

export function prefijoCuenta(accountId: string): string {
  return accountId.replace(/-/g, '').slice(0, 8)
}

/** Contexto del plan de marcado que le corresponde a una cuenta. */
export function contextoCuenta(accountId: string): string {
  return `cuenta_${prefijoCuenta(accountId)}`
}

/**
 * Direccion del WebSocket de Asterisk.
 *
 * nginx termina el TLS y hace de puente hacia el 8088 local, asi que desde el
 * navegador es wss sobre el mismo dominio del CRM.
 *
 * OJO con el protocolo. Detras del proxy, el contenedor recibe la peticion
 * por http en claro, asi que `request.url` dice `http://` aunque la persona
 * este en `https://`. Derivar el WebSocket de ahi daba `ws://`, y un
 * navegador NUNCA abre un WebSocket inseguro desde una pagina segura: lo
 * bloquea como contenido mixto, sin mensaje visible. El telefono se quedaba
 * en "Se perdio la conexion con la central" y a Asterisk no le llegaba ni un
 * REGISTER, porque la conexion no salia del navegador.
 *
 * Por eso se fuerza `wss` salvo que el origen sea local sin cifrar, que es el
 * unico caso legitimo de `ws://` (desarrollo en localhost).
 */
export function urlWebSocket(origen: string): string {
  const u = new URL(origen)
  const esLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  const protocolo = u.protocol === 'https:' || !esLocal ? 'wss:' : 'ws:'
  return `${protocolo}//${u.host}/ws`
}

/**
 * Servidor ICE tal como lo espera RTCPeerConnection.
 *
 * Los de tipo `turn:` llevan usuario y clave; los `stun:` no.
 */
export interface ServidorIce {
  urls: string | string[]
  username?: string
  credential?: string
}

/** Lo que el navegador necesita para registrarse. */
export interface CredencialesSip {
  extension: string
  password: string
  /** Nombre del endpoint: es el usuario SIP real, no la extension. */
  endpoint: string
  /** Dominio SIP con el que se arma el URI. */
  dominio: string
  websocket: string
  /** Nombre para mostrar en el identificador de llamada. */
  nombre: string
  /**
   * STUN y TURN.
   *
   * STUN solo le dice al navegador cual es su direccion publica, y con eso
   * basta en la mayoria de las redes domesticas. Detras de un NAT simetrico
   * -- oficinas, algunas redes moviles -- cada destino ve un puerto distinto,
   * asi que la direccion que descubrio por STUN no sirve para el otro
   * extremo: la llamada se establece y no se oye nada, o se oye en un solo
   * sentido. TURN resuelve eso retransmitiendo el audio por el servidor, que
   * siempre es alcanzable desde los dos lados.
   */
  iceServers: ServidorIce[]
}
