import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { configDeWhatsApp } from '@/lib/whatsapp/credenciales'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params

    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // El account_id de quien pide: un companero que abre un archivo de la
    // bandeja compartida necesita las credenciales de la CUENTA, no una
    // fila propia que nunca existio.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    // De QUE linea vino este archivo. El identificador de medios lo emite
    // Meta por linea: pedirlo con el token de otra devuelve 404, asi que no
    // basta con tomar la principal. Se llega a la linea por el mensaje que
    // guarda esta misma direccion.
    // `messages` no tiene `account_id` — la propiedad se hereda de la
    // conversacion, y asi es como la comprueba la RLS. Se pide anidada para
    // que un identificador de medios de otra organizacion no devuelva nada
    // en vez de devolver su conversacion.
    const { data: mensaje } = await supabase
      .from('messages')
      .select('conversation_id, conversation:conversations!inner(account_id)')
      .eq('conversation.account_id', accountId)
      .like('media_url', `%/${mediaId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const config = await configDeWhatsApp(supabase, accountId, {
      conversationId: mensaje?.conversation_id ?? null,
    })

    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Get the download URL from Meta
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })

    // Download the binary data
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    })

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType || mediaInfo.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
