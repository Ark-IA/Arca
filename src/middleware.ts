import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Páginas protegidas.
  //
  // Se listan las PÚBLICAS y se protege todo lo demás, al revés de como estaba.
  // La lista de protegidas se desincronizaba sola: nombraba siete rutas y para
  // cuando se revisó ya faltaban /flows, /agents, /notifications y las tres
  // nuevas (/companies, /tasks, /calendar). Nadie se dio cuenta porque los
  // datos igual estaban a salvo -- RLS no devuelve nada sin sesión -- pero la
  // página se pintaba vacía un instante antes de que el cliente redirigiera.
  //
  // Invertida, la lista falla CERRADA: una página nueva nace protegida, y
  // abrirla al público exige escribirlo a propósito.
  const rutasPublicas = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/join', // aceptar una invitación: por definición se llega sin sesión
    '/api/whatsapp/webhook',
    '/api/meta/webhook',
  ]
  const ruta = request.nextUrl.pathname
  const esPublica =
    ruta === '/' || rutasPublicas.some((p) => ruta === p || ruta.startsWith(`${p}/`))

  // Las rutas de API no se redirigen a /login: quien las llama es código, y un
  // 302 hacia una página HTML se le manifiesta como una respuesta ilegible.
  // Contestan 401 más abajo.
  if (!user && !esPublica && !ruta.startsWith('/api/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Rutas de API que necesitan sesión.
  //
  // Igual que arriba: se nombran las que NO la necesitan y se protege el
  // resto. Antes solo cubría `/api/whatsapp/`, así que las de telefonía, Meta
  // y las de la cuenta quedaban fuera del control del middleware -- se
  // salvaban únicamente porque cada una comprueba el rol por su cuenta, y
  // bastaba una ruta nueva que se olvidara de hacerlo.
  //
  // Las rutas públicas de API son los webhooks (los llama Meta, sin sesión) y
  // la API pública v1, que se autentica con su propia clave y no con cookies.
  const apiPublica =
    ruta.includes('/webhook') || ruta.startsWith('/api/v1/')
  if (!user && ruta.startsWith('/api/') && !apiPublica) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
