/**
 * Transcripción de notas de voz.
 *
 * Un cliente que manda un audio está diciendo algo. Sin esto, ese algo no
 * llega a ningún lado: el mensaje se guarda sin texto, los flujos no
 * encuentran ninguna palabra que reconocer, las automatizaciones de palabra
 * clave nunca coinciden y el agente de IA ni ve que haya llegado un mensaje.
 * El bot enmudece justo cuando el cliente se tomó el trabajo de hablar.
 *
 * Convertido a texto, todo lo de aguas abajo funciona igual que si hubiera
 * escrito. No hay una rama «si es audio» en el motor de flujos ni en el de
 * automatizaciones, y eso es la mitad del valor de resolverlo acá.
 *
 * Habla el protocolo de OpenAI (`POST /audio/transcriptions`, multipart), que
 * es el que implementan también Groq y casi todos los demás. Por eso la
 * dirección base es configurable en vez de tener una lista de proveedores
 * conocidos: cambiar de proveedor es cambiar una URL y una clave.
 */

/** Nunca se espera más que esto por un audio. */
const TIEMPO_LIMITE_MS = 25_000

/**
 * Tope de tamaño. El de OpenAI son 25 MB; se corta antes de descargar para
 * no traerse un archivo enorme y descubrir al final que no se puede mandar.
 */
const MAXIMO_BYTES = 24 * 1024 * 1024

/**
 * Los dos protocolos que se hablan.
 *
 *   openai      POST {base}/audio/transcriptions   con clave, campo `model`
 *   whispercpp  POST {base}/inference              sin clave, modelo ya cargado
 *
 * Se guarda cuál en la configuración en vez de deducirlo de la dirección.
 * Adivinar por la URL funciona hoy y se rompe el día que alguien ponga el
 * servicio local detrás de un nombre de dominio.
 */
export type ProtocoloTranscripcion = 'openai' | 'whispercpp'

export interface ConfigTranscripcion {
  protocolo: ProtocoloTranscripcion
  /** Vacía cuando el servicio es local: no autentica nada. */
  apiKey: string
  model: string
  baseUrl: string
}

/**
 * Lee la configuración de transcripción de una cuenta.
 *
 * Devuelve `null` cuando no está configurada. Quien llama tiene que saber
 * seguir sin ella: sin transcripción el sistema no se rompe, solo responde
 * peor.
 */
export function configDeTranscripcion(fila: {
  transcription_kind?: string | null
  transcription_api_key?: string | null
  transcription_model?: string | null
  transcription_base_url?: string | null
} | null): ConfigTranscripcion | null {
  const protocolo: ProtocoloTranscripcion =
    fila?.transcription_kind === 'whispercpp' ? 'whispercpp' : 'openai'

  const apiKey = fila?.transcription_api_key?.trim() ?? ''

  // Con el servicio local NO se exige clave. Exigirla obligaría a inventar
  // un valor de relleno, y como las claves se guardan cifradas ese relleno
  // fallaría al descifrarse y apagaría la transcripción sin explicar nada.
  if (protocolo === 'openai' && !apiKey) return null

  const base = fila?.transcription_base_url?.trim()
  if (protocolo === 'whispercpp' && !base) return null

  return {
    protocolo,
    apiKey,
    model: fila?.transcription_model?.trim() || 'whisper-1',
    baseUrl: (base || 'https://api.openai.com/v1').replace(/\/+$/, ''),
  }
}

/**
 * Nombre de archivo con una extensión coherente con el tipo.
 *
 * No es cosmético: la API de OpenAI decide el formato por la extensión del
 * archivo que se le manda, y rechaza el envío si no la reconoce. Un `.bin`
 * hace fallar una transcripción que habría salido bien.
 */
function nombreSegunTipo(mime: string | null | undefined): string {
  const t = (mime ?? '').toLowerCase()
  if (t.includes('ogg')) return 'audio.ogg' // WhatsApp manda ogg/opus
  if (t.includes('mpeg') || t.includes('mp3')) return 'audio.mp3'
  if (t.includes('mp4') || t.includes('m4a')) return 'audio.m4a'
  if (t.includes('wav')) return 'audio.wav'
  if (t.includes('webm')) return 'audio.webm'
  if (t.includes('amr')) return 'audio.amr'
  if (t.includes('aac')) return 'audio.aac'
  return 'audio.ogg'
}

export interface ResultadoTranscripcion {
  texto: string
}

/**
 * Descarga el audio y lo transcribe.
 *
 * Devuelve `null` ante cualquier problema — sin clave, archivo enorme, el
 * proveedor caído, un audio de puro silencio. NO lanza: quien llama está en
 * el camino de un mensaje entrante, y una transcripción fallida no puede
 * impedir que el mensaje se procese. Sin texto se responde peor; con una
 * excepción no se responde nada.
 */
export async function transcribirAudio(args: {
  url: string
  mime?: string | null
  config: ConfigTranscripcion
  /** Cabeceras para descargar el audio, si la fuente las pide. */
  cabecerasDescarga?: Record<string, string>
}): Promise<ResultadoTranscripcion | null> {
  const { url, mime, config, cabecerasDescarga } = args

  try {
    const corte = AbortSignal.timeout(TIEMPO_LIMITE_MS)

    const descarga = await fetch(url, {
      headers: cabecerasDescarga,
      signal: corte,
    })
    if (!descarga.ok) {
      console.error('[transcribir] no se pudo descargar el audio:', descarga.status)
      return null
    }

    // Se mira el tamaño anunciado antes de leer el cuerpo. Con un archivo
    // que se pasa del tope, leerlo entero para descartarlo después es
    // memoria y tiempo gastados en algo que ya se sabía.
    const anunciado = Number(descarga.headers.get('content-length') ?? '0')
    if (anunciado > MAXIMO_BYTES) {
      console.warn('[transcribir] audio demasiado grande:', anunciado)
      return null
    }

    const datos = await descarga.arrayBuffer()
    if (datos.byteLength === 0 || datos.byteLength > MAXIMO_BYTES) {
      console.warn('[transcribir] audio vacío o demasiado grande:', datos.byteLength)
      return null
    }

    const esLocal = config.protocolo === 'whispercpp'

    const formulario = new FormData()
    formulario.append(
      'file',
      new Blob([datos], { type: mime || 'audio/ogg' }),
      nombreSegunTipo(mime),
    )
    // whisper.cpp carga UN modelo al arrancar y rechaza el campo; OpenAI lo
    // exige. Es la única diferencia real entre los dos, además de la ruta.
    if (!esLocal) formulario.append('model', config.model)
    // Texto plano: no hacen falta marcas de tiempo ni segmentos, y el JSON
    // completo obligaría a navegar una estructura para sacar lo mismo.
    formulario.append('response_format', 'text')

    const respuesta = await fetch(
      `${config.baseUrl}${esLocal ? '/inference' : '/audio/transcriptions'}`,
      {
        method: 'POST',
        // Sin cabecera de autorización cuando es local: mandar «Bearer »
        // vacío hace que algunos servidores devuelvan 401 por una credencial
        // malformada, que es lo contrario de no mandar ninguna.
        headers: esLocal ? {} : { Authorization: `Bearer ${config.apiKey}` },
        body: formulario,
        signal: corte,
      },
    )

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      console.error(
        '[transcribir] el proveedor respondió',
        respuesta.status,
        detalle.slice(0, 200),
      )
      return null
    }

    const texto = (await respuesta.text()).trim()
    // Un audio de puro silencio devuelve cadena vacía. Guardar eso como
    // texto del mensaje sería peor que no transcribir: el mensaje parecería
    // escrito y vacío en vez de una nota de voz que no se entendió.
    if (!texto) return null

    return { texto }
  } catch (e) {
    console.error('[transcribir] falló:', e instanceof Error ? e.message : e)
    return null
  }
}
