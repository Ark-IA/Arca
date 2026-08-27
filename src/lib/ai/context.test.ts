import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversationContext, esMediaDescribible } from './context'

/** Minimal fake matching the query chain in buildConversationContext:
 *  from().select().eq().eq().order().limit() → { data, error }. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain as unknown as SupabaseClient
}

describe('buildConversationContext', () => {
  it('maps sender_type to role and returns chronological order', async () => {
    // DB returns newest-first (created_at DESC); the fn reverses it.
    const rows = [
      { sender_type: 'customer', content_text: 'third' },
      { sender_type: 'agent', content_text: 'second' },
      { sender_type: 'customer', content_text: 'first' },
    ]
    const out = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(out).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])
  })

  it('treats bot messages as assistant', async () => {
    const out = await buildConversationContext(
      fakeDb([{ sender_type: 'bot', content_text: 'auto reply' }]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'assistant', content: 'auto reply' }])
  })

  it('drops empty / whitespace-only messages', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: '   ' },
        { sender_type: 'customer', content_text: null },
        { sender_type: 'customer', content_text: 'real' },
      ]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'user', content: 'real' }])
  })
})

describe('buildConversationContext — audios y otros medios', () => {
  // El fallo que había: la consulta filtraba content_type='text', así que una
  // nota de voz desaparecía del contexto. El agente no veía ningún mensaje
  // nuevo y se quedaba callado — el bot dejaba de responder al recibir un
  // audio, sin ningún error que lo explicara.
  it('describe la nota de voz del cliente en vez de tragársela', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_type: 'audio', content_text: null },
      ]),
      'conv-1',
    )
    expect(out).toEqual([
      { role: 'user', content: '[el cliente envió una nota de voz]' },
    ])
  })

  it('usa la transcripción cuando la hay', async () => {
    // Un audio transcrito guarda su texto en el mismo campo que un mensaje
    // escrito. Para el modelo tiene que ser indistinguible de uno escrito.
    const out = await buildConversationContext(
      fakeDb([
        {
          sender_type: 'customer',
          content_type: 'audio',
          content_text: 'hola, quiero saber el precio',
        },
      ]),
      'conv-1',
    )
    expect(out).toEqual([
      { role: 'user', content: 'hola, quiero saber el precio' },
    ])
  })

  it('describe también imágenes, videos y archivos', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_type: 'image', content_text: null },
        { sender_type: 'customer', content_type: 'document', content_text: null },
      ]),
      'conv-1',
    )
    expect(out.map((m) => m.content)).toEqual([
      '[el cliente envió un archivo]',
      '[el cliente envió una imagen]',
    ])
  })

  it('NO describe los envíos propios sin texto', async () => {
    // Describir una plantilla nuestra sin texto sería llenarle el contexto
    // al modelo de ruido propio, que no aporta nada a qué contestar.
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'bot', content_type: 'template', content_text: null },
        { sender_type: 'customer', content_type: 'audio', content_text: null },
      ]),
      'conv-1',
    )
    expect(out).toEqual([
      { role: 'user', content: '[el cliente envió una nota de voz]' },
    ])
  })

  it('ignora un tipo desconocido sin texto', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_type: 'algo_nuevo', content_text: null },
      ]),
      'conv-1',
    )
    expect(out).toEqual([])
  })
})

describe('esMediaDescribible — a qué vale la pena despertar al agente', () => {
  // Los dos webhooks lo usan para decidir si llaman al despachador. Era la
  // pieza que faltaba: se arregló el contexto para que viera los audios y no
  // sirvió de nada, porque la condición del webhook exigía texto no vacío y
  // un audio sin transcribir lo deja vacío. El código nunca llegaba al
  // contexto arreglado.
  it('acepta lo que el contexto sabe describir', () => {
    expect(esMediaDescribible('audio')).toBe(true)
    expect(esMediaDescribible('image')).toBe(true)
    expect(esMediaDescribible('video')).toBe(true)
    expect(esMediaDescribible('document')).toBe(true)
    expect(esMediaDescribible('location')).toBe(true)
  })

  it('rechaza lo que no sabría describir', () => {
    // Despertar al agente por algo que el contexto ignora le entregaría una
    // conversación sin el mensaje nuevo: no diría nada, y encima con una
    // llamada al proveedor ya pagada.
    expect(esMediaDescribible('text')).toBe(false)
    expect(esMediaDescribible('interactive')).toBe(false)
    expect(esMediaDescribible('template')).toBe(false)
    expect(esMediaDescribible(null)).toBe(false)
    expect(esMediaDescribible(undefined)).toBe(false)
    expect(esMediaDescribible('')).toBe(false)
  })
})
