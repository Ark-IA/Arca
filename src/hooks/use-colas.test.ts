import { describe, it, expect } from 'vitest'

import { colasDe, esMia } from './use-colas'
import type { ColaConMiembros } from './use-colas'

const YO = 'usuario-yo'
const OTRO = 'usuario-otro'

const COLAS: ColaConMiembros[] = [
  {
    id: 'ventas',
    name: 'Ventas',
    description: null,
    color: 'emerald',
    is_active: true,
    miembros: [{ user_id: YO, full_name: 'Yo' }],
  },
  {
    id: 'soporte',
    name: 'Soporte',
    description: null,
    color: 'blue',
    is_active: true,
    miembros: [{ user_id: OTRO, full_name: 'Otro' }],
  },
]

describe('colasDe', () => {
  it('devuelve solo las colas donde está la persona', () => {
    expect([...colasDe(COLAS, YO)]).toEqual(['ventas'])
    expect([...colasDe(COLAS, OTRO)]).toEqual(['soporte'])
  })

  it('sin usuario, ninguna', () => {
    expect(colasDe(COLAS, null).size).toBe(0)
    expect(colasDe(COLAS, undefined).size).toBe(0)
  })
})

describe('esMia — qué ve cada asesor', () => {
  const mias = colasDe(COLAS, YO)

  it('ve lo que espera en su cola', () => {
    expect(esMia({ cola_id: 'ventas' }, YO, mias)).toBe(true)
  })

  it('NO ve lo que espera en una cola ajena', () => {
    expect(esMia({ cola_id: 'soporte' }, YO, mias)).toBe(false)
  })

  it('ve lo que está a su nombre, aunque sea de otra cola', () => {
    // Si se lo asignaron a mano, es suyo. La cola ya no manda.
    expect(esMia({ cola_id: 'soporte', assigned_agent_id: YO }, YO, mias)).toBe(true)
  })

  it('NO ve lo que está a nombre de otra persona', () => {
    expect(esMia({ cola_id: 'ventas', assigned_agent_id: OTRO }, YO, mias)).toBe(false)
  })

  // La regla que más importa. Una conversación sin encolar es la de alguien
  // que acaba de escribir y a quien ningún flujo derivó todavía: si no la ve
  // nadie porque no es «de nadie», el cliente nuevo espera en silencio.
  it('TODOS ven lo que no está en ninguna cola', () => {
    expect(esMia({ cola_id: null }, YO, mias)).toBe(true)
    expect(esMia({}, YO, mias)).toBe(true)
    expect(esMia({ cola_id: null }, OTRO, colasDe(COLAS, OTRO))).toBe(true)
  })

  it('sin cola pero asignada a otro, no', () => {
    // Ya tiene dueño: dejarla visible para todos duplicaría el trabajo.
    expect(esMia({ cola_id: null, assigned_agent_id: OTRO }, YO, mias)).toBe(false)
  })

  it('quien no está en ninguna cola sigue viendo lo no encolado', () => {
    // Un asesor recién creado, todavía sin colas, no puede quedar ciego.
    const sinColas = new Set<string>()
    expect(esMia({ cola_id: null }, 'nuevo', sinColas)).toBe(true)
    expect(esMia({ cola_id: 'ventas' }, 'nuevo', sinColas)).toBe(false)
  })
})
