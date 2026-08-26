'use client';

/**
 * Telefono por WebRTC contra el Asterisk propio.
 *
 * JsSIP se carga con import() dinamico dentro del efecto: la libreria toca
 * `window` y `navigator` al evaluarse, asi que importarla arriba rompe el
 * renderizado en el servidor.
 *
 * El registro SIP vive mientras el CRM este abierto. No se reconecta a mano:
 * JsSIP ya reintenta solo, y encima de eso duplicariamos registros.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CredencialesSip } from '@/lib/telefonia/sip';
import { iniciarTimbre, iniciarTonoDeLlamada } from '@/lib/telefonia/tonos-llamada';

export type EstadoTelefono =
  /** Todavia no se sabe si esta persona tiene extension. */
  | 'cargando'
  /** No tiene extension asignada: no se muestra el telefono. */
  | 'sin-extension'
  /** Tiene extension pero el registro fallo. */
  | 'sin-conexion'
  /** Registrado y libre. */
  | 'libre'
  /** Marcando hacia afuera, esperando que contesten. */
  | 'llamando'
  /** Entra una llamada. */
  | 'entrante'
  /** Conversacion en curso. */
  | 'en-llamada';

export interface Softphone {
  estado: EstadoTelefono;
  /** Motivo legible cuando el estado es 'sin-conexion' o 'sin-extension'. */
  motivo: string | null;
  extension: string | null;
  /** Quien esta del otro lado, cuando hay llamada. */
  interlocutor: string | null;
  /** Segundos desde que contestaron. */
  segundos: number;
  silenciado: boolean;
  llamar: (destino: string) => void;
  contestar: () => void;
  colgar: () => void;
  alternarSilencio: () => void;
  /** Envia un tono DTMF durante la llamada (menus de voz). */
  enviarTono: (tecla: string) => void;
}

// Tipos minimos de JsSIP. Se declaran a mano porque el paquete no trae los
// suyos y `any` suelto por todo el archivo esconderia errores reales.
interface SesionJsSip {
  direction: 'incoming' | 'outgoing';
  remote_identity: { display_name?: string | null; uri: { user: string } };
  connection?: RTCPeerConnection;
  answer(opciones: unknown): void;
  terminate(): void;
  sendDTMF(tono: string): void;
  mute(opciones: { audio: boolean }): void;
  unmute(opciones: { audio: boolean }): void;
  on(evento: string, manejador: (datos?: unknown) => void): void;
  isEnded(): boolean;
}

interface AgenteJsSip {
  start(): void;
  stop(): void;
  call(destino: string, opciones: unknown): void;
  on(evento: string, manejador: (datos?: unknown) => void): void;
}

/**
 * Opciones de medio para llamar y contestar.
 *
 * Los servidores ICE los da el servidor, no una constante: las credenciales
 * del TURN caducan y van firmadas por usuario. Sin TURN la llamada se
 * establece igual, pero detras de un NAT simetrico no se oye a nadie -- por
 * eso se pasan siempre y no solo cuando falla la ruta directa.
 */
function opcionesMedio(iceServers: RTCIceServer[]) {
  return {
    mediaConstraints: { audio: true, video: false },
    pcConfig: {
      iceServers,
      // Se recogen las candidatas de TURN aunque ya haya una ruta directa
      // aparente. Descubrir a mitad de llamada que la directa no servia es
      // demasiado tarde: el usuario ya escucho el silencio.
      iceTransportPolicy: 'all' as RTCIceTransportPolicy,
    },
  };
}

export function useSoftphone(): Softphone {
  const [estado, setEstado] = useState<EstadoTelefono>('cargando');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [extension, setExtension] = useState<string | null>(null);
  const [interlocutor, setInterlocutor] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [silenciado, setSilenciado] = useState(false);

  const agenteRef = useRef<AgenteJsSip | null>(null);
  const sesionRef = useRef<SesionJsSip | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const credRef = useRef<CredencialesSip | null>(null);
  const registroRef = useRef<string | null>(null);
  /** Cómo callar el tono que esté sonando ahora mismo, si hay alguno. */
  const pararTonoRef = useRef<(() => void) | null>(null);

  const pararTono = useCallback(() => {
    pararTonoRef.current?.();
    pararTonoRef.current = null;
  }, []);

  // --- registro de la llamada en la base -------------------------------
  const abrirRegistro = useCallback(
    async (direccion: 'inbound' | 'outbound', numero: string) => {
      try {
        const r = await fetch('/api/telefonia/llamadas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction: direccion,
            [direccion === 'outbound' ? 'to_number' : 'from_number']: numero,
            extension: credRef.current?.extension ?? null,
          }),
        });
        const d = await r.json();
        registroRef.current = typeof d.id === 'string' ? d.id : null;
      } catch {
        // Que falle el registro no puede impedir la llamada. Se pierde la
        // estadistica, no la conversacion.
        registroRef.current = null;
      }
    },
    [],
  );

  const cerrarRegistro = useCallback(
    async (estadoFinal: string, contestada: boolean) => {
      const id = registroRef.current;
      if (!id) return;
      // 'answered' NO es el final de la llamada, es su mitad. Si se soltara el
      // identificador aca, el 'completed' posterior no tendria a que fila
      // apuntar: la llamada quedaria registrada como contestada, sin hora de
      // fin, y por tanto sin duracion. El informe mostraria todas las
      // llamadas atendidas con duracion vacia.
      if (estadoFinal !== 'answered') registroRef.current = null;
      try {
        await fetch('/api/telefonia/llamadas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: estadoFinal, answered: contestada }),
        });
      } catch {
        /* ver arriba */
      }
    },
    [],
  );

  // --- ciclo de vida del agente SIP ------------------------------------
  useEffect(() => {
    let vivo = true;
    let agente: AgenteJsSip | null = null;

    (async () => {
      let datos: {
        habilitado?: boolean;
        motivo?: string;
        credenciales?: CredencialesSip;
      };
      try {
        const r = await fetch('/api/telefonia/credenciales', { cache: 'no-store' });
        datos = await r.json();
      } catch {
        if (vivo) {
          setEstado('sin-extension');
        }
        return;
      }
      if (!vivo) return;

      if (!datos.habilitado || !datos.credenciales) {
        setEstado('sin-extension');
        setMotivo(datos.motivo ?? null);
        return;
      }

      const cred = datos.credenciales;
      credRef.current = cred;
      setExtension(cred.extension);

      const JsSIP = (await import('jssip')).default;
      if (!vivo) return;

      // El elemento de audio se crea una vez y se reutiliza. Crear uno por
      // llamada deja los anteriores sonando en algunos navegadores.
      if (!audioRef.current) {
        const el = document.createElement('audio');
        el.autoplay = true;
        document.body.appendChild(el);
        audioRef.current = el;
      }

      // Red de seguridad: si la pagina va por https, el WebSocket TIENE que
      // ir por wss. El navegador bloquea el mixto en silencio, asi que un
      // `ws://` mal derivado en el servidor se manifestaria como un telefono
      // que nunca conecta y sin ningun error que lo explique.
      const urlSocket =
        window.location.protocol === 'https:'
          ? cred.websocket.replace(/^ws:/, 'wss:')
          : cred.websocket;

      const socket = new JsSIP.WebSocketInterface(urlSocket);
      agente = new JsSIP.UA({
        sockets: [socket],
        uri: `sip:${cred.endpoint}@${cred.dominio}`,
        password: cred.password,
        display_name: cred.nombre,
        register: true,
        // Los temporizadores de sesion cortan llamadas largas cuando el otro
        // extremo no los implementa igual. Asterisk no los necesita.
        session_timers: false,
      }) as unknown as AgenteJsSip;
      agenteRef.current = agente;

      agente.on('registered', () => {
        if (!vivo) return;
        setEstado((previo) =>
          previo === 'cargando' || previo === 'sin-conexion' ? 'libre' : previo,
        );
        setMotivo(null);
      });

      agente.on('registrationFailed', (datosEvento) => {
        if (!vivo) return;
        const causa =
          (datosEvento as { cause?: string } | undefined)?.cause ?? 'desconocida';
        setEstado('sin-conexion');
        setMotivo(`El teléfono no pudo conectarse (${causa}).`);
      });

      agente.on('disconnected', (d) => {
        if (!vivo) return;
        // Con la direccion delante, un fallo futuro se diagnostica en un
        // vistazo: si aparece `ws://` en una pagina `https://`, es el
        // navegador bloqueando contenido mixto y no la central caida.
        console.error('[telefonia] websocket caido', {
          url: urlSocket,
          detalle: d,
        });
        setEstado((previo) =>
          previo === 'en-llamada' || previo === 'llamando' ? previo : 'sin-conexion',
        );
        setMotivo('Se perdió la conexión con la central. Reintentando…');
      });

      agente.on('newRTCSession', (datosEvento) => {
        const ev = datosEvento as { session: SesionJsSip; originator: string };
        const sesion = ev.session;

        // Una llamada entrante mientras ya hay otra en curso se rechaza. Sin
        // esto, contestar la segunda dejaria la primera colgada a medias.
        if (sesionRef.current && !sesionRef.current.isEnded()) {
          if (ev.originator === 'remote') sesion.terminate();
          return;
        }

        sesionRef.current = sesion;
        const quien =
          sesion.remote_identity.display_name || sesion.remote_identity.uri.user;
        setInterlocutor(quien);
        setSilenciado(false);

        if (ev.originator === 'remote') {
          setEstado('entrante');
          pararTono();
          pararTonoRef.current = iniciarTimbre();
          void abrirRegistro('inbound', sesion.remote_identity.uri.user);
        } else {
          // Saliente: el tono empieza en cuanto Asterisk avisa que el otro
          // extremo esta sonando (`progress` = 180 Ringing). Arrancarlo antes
          // mentiria -- estaria sonando aca sin que suene alla todavia.
          sesion.on('progress', () => {
            if (!vivo) return;
            pararTono();
            pararTonoRef.current = iniciarTonoDeLlamada();
          });
        }

        // El audio del otro lado llega como pista del RTCPeerConnection.
        sesion.on('peerconnection', (d) => {
          const pc = (d as { peerconnection: RTCPeerConnection }).peerconnection;
          pc.addEventListener('track', (evento) => {
            const pista = evento as RTCTrackEvent;
            if (audioRef.current && pista.streams[0]) {
              audioRef.current.srcObject = pista.streams[0];
            }
          });
        });

        sesion.on('accepted', () => {
          if (!vivo) return;
          // Lo primero: callar el tono. Si sigue sonando se mezcla con la voz
          // del otro lado y parece que la linea esta rota.
          pararTono();
          setEstado('en-llamada');
          setSegundos(0);
          void cerrarRegistro('answered', true);
        });
        sesion.on('confirmed', () => {
          if (!vivo) return;
          setEstado('en-llamada');
        });

        const terminar = (final: string) => {
          pararTono();
          if (!vivo) return;
          sesionRef.current = null;
          setEstado('libre');
          setInterlocutor(null);
          setSegundos(0);
          setSilenciado(false);
          if (audioRef.current) audioRef.current.srcObject = null;
          void cerrarRegistro(final, false);
        };

        sesion.on('ended', () => terminar('completed'));
        sesion.on('failed', (d) => {
          const causa = (d as { cause?: string } | undefined)?.cause ?? '';
          // JsSIP distingue el rechazo del "no contesta"; guardarlos por
          // separado es lo que hace util el informe de llamadas perdidas.
          const final =
            causa === 'Busy' ? 'busy'
            : causa === 'Canceled' ? 'canceled'
            : causa === 'No Answer' ? 'no_answer'
            : 'failed';
          terminar(final);
        });
      });

      agente.start();
    })();

    return () => {
      vivo = false;
      pararTono();
      try {
        sesionRef.current?.terminate();
      } catch {
        /* ya estaba cerrada */
      }
      agente?.stop();
      agenteRef.current = null;
    };
  }, [abrirRegistro, cerrarRegistro, pararTono]);

  // Cronometro de la llamada. Vive aparte del agente para no reconstruir el
  // registro SIP cada segundo.
  useEffect(() => {
    if (estado !== 'en-llamada') return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const llamar = useCallback(
    (destino: string) => {
      const cred = credRef.current;
      const agente = agenteRef.current;
      const limpio = destino.replace(/[^0-9*#+]/g, '');
      if (!cred || !agente || limpio === '') return;
      setEstado('llamando');
      setInterlocutor(limpio);
      void abrirRegistro('outbound', limpio);
      agente.call(
        `sip:${limpio}@${cred.dominio}`,
        opcionesMedio(cred.iceServers as RTCIceServer[]),
      );
    },
    [abrirRegistro],
  );

  const contestar = useCallback(() => {
    const cred = credRef.current;
    if (!cred) return;
    sesionRef.current?.answer(opcionesMedio(cred.iceServers as RTCIceServer[]));
  }, []);

  const colgar = useCallback(() => {
    try {
      sesionRef.current?.terminate();
    } catch {
      /* la sesion ya se habia cerrado sola */
    }
  }, []);

  const alternarSilencio = useCallback(() => {
    const s = sesionRef.current;
    if (!s) return;
    setSilenciado((previo) => {
      if (previo) s.unmute({ audio: true });
      else s.mute({ audio: true });
      return !previo;
    });
  }, []);

  const enviarTono = useCallback((tecla: string) => {
    sesionRef.current?.sendDTMF(tecla);
  }, []);

  return {
    estado,
    motivo,
    extension,
    interlocutor,
    segundos,
    silenciado,
    llamar,
    contestar,
    colgar,
    alternarSilencio,
    enviarTono,
  };
}
