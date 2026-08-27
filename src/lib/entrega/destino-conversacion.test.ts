import { describe, it, expect } from 'vitest'

import { parcheDeEntrega, resolverDestino } from './destino-conversacion'

describe('resolverDestino — leer configuraciones viejas y nuevas', () => {
  it('usa el destino explícito cuando está', () => {
    expect(resolverDestino({ destino: 'ia' })).toBe('ia')
    expect(resolverDestino({ destino: 'cola' })).toBe('cola')
    expect(resolverDestino({ destino: 'asesor' })).toBe('asesor')
  })

  // Lo que había antes de que existiera el campo. Si esto se rompe, todos
  // los flujos ya escritos cambian de comportamiento al desplegar.
  it('sin destino, una persona asignada significa «asesor»', () => {
    expect(resolverDestino({ assign_to: 'usuario-1' })).toBe('asesor')
    expect(resolverDestino({ agent_id: 'usuario-1' })).toBe('asesor')
  })

  it('sin destino y sin persona significa «cola»', () => {
    expect(resolverDestino({})).toBe('cola')
    expect(resolverDestino({ assign_to: null, agent_id: null })).toBe('cola')
  })

  it('ignora un destino inventado y vuelve a deducir', () => {
    expect(resolverDestino({ destino: 'marte', assign_to: 'u1' })).toBe('asesor')
    expect(resolverDestino({ destino: 'marte' })).toBe('cola')
  })
})

describe('parcheDeEntrega — qué campos se tocan en cada caso', () => {
  it('al agente de IA: le devuelve el turno de verdad', () => {
    const p = parcheDeEntrega('ia')
    // Los cuatro juntos. Si faltara el asignado, la IA se saltaría el hilo
    // igual porque una persona a cargo tiene prioridad; si faltara el
    // contador, no diría nada en una conversación que ya gastó el tope.
    expect(p.assigned_agent_id).toBeNull()
    expect(p.ai_autoreply_disabled).toBe(false)
    expect(p.ai_reply_count).toBe(0)
    expect(p.cola_id).toBeNull()
    expect(p.status).toBe('open')
  })

  it('a una cola: apaga la IA y guarda en cuál espera', () => {
    const p = parcheDeEntrega('cola', { colaId: 'cola-ventas' })
    expect(p.cola_id).toBe('cola-ventas')
    expect(p.assigned_agent_id).toBeNull()
    // Si la IA siguiera contestando, el cliente recibiría respuestas
    // automáticas mientras espera a una persona de verdad.
    expect(p.ai_autoreply_disabled).toBe(true)
    expect(p.status).toBe('pending')
  })

  it('a la cola sin elegir cuál: BORRA la cola anterior', () => {
    // Omitir el campo la conservaría, y la conversación seguiría listada en
    // una cola que ya no le corresponde.
    const p = parcheDeEntrega('cola', {})
    expect('cola_id' in p).toBe(true)
    expect(p.cola_id).toBeNull()
  })

  it('a un asesor: lo asigna y lo saca de la cola', () => {
    const p = parcheDeEntrega('asesor', { asesorId: 'usuario-7' })
    expect(p.assigned_agent_id).toBe('usuario-7')
    expect(p.cola_id).toBeNull()
    expect(p.ai_autoreply_disabled).toBe(true)
    expect(p.status).toBe('pending')
  })

  it('a un asesor sin id: no escribe un asignado vacío', () => {
    // Poner null aquí desasignaría a quien ya estuviera atendiendo.
    const p = parcheDeEntrega('asesor', {})
    expect('assigned_agent_id' in p).toBe(false)
  })

  it('los tres destinos dejan la conversación en un estado coherente', () => {
    for (const destino of ['ia', 'cola', 'asesor'] as const) {
      const p = parcheDeEntrega(destino, { asesorId: 'u1', colaId: 'c1' })
      // Nunca puede quedar a la vez en una cola y a nombre de alguien: son
      // dos respuestas distintas a «¿quién atiende esto?».
      expect(Boolean(p.cola_id) && Boolean(p.assigned_agent_id)).toBe(false)
      expect(p.updated_at).toBeTypeOf('string')
    }
  })
})
