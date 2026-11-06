import { describe, expect, it } from 'vitest'
import { pruefeSchluessel } from './schluessel'

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (nutzlast: unknown) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(nutzlast)}.signatur`

describe('pruefeSchluessel', () => {
  it('lässt den öffentlichen Schlüssel durch (anon-JWT und publishable)', () => {
    expect(pruefeSchluessel(jwt({ role: 'anon', ref: 'abc' }))).toBeNull()
    expect(pruefeSchluessel('sb_publishable_abc123')).toBeNull()
  })
  it('lehnt den service_role-Schlüssel ab', () => {
    expect(pruefeSchluessel(jwt({ role: 'service_role' }))).toBe('service_role')
    expect(pruefeSchluessel(`  ${jwt({ role: 'service_role' })}\n`)).toBe('service_role')
  })
  it('lehnt jede andere Rolle ab', () => {
    expect(pruefeSchluessel(jwt({ role: 'authenticated' }))).toBe('falsche_rolle')
    expect(pruefeSchluessel(jwt({ sub: 'u1' }))).toBe('falsche_rolle')
  })
  it('lehnt den neuen geheimen Schlüssel ab', () => {
    expect(pruefeSchluessel('sb_secret_abc123')).toBe('geheimer_schluessel')
    expect(pruefeSchluessel('SB_SECRET_abc123')).toBe('geheimer_schluessel')
  })
  it('lässt leere und nicht prüfbare Werte durch (die fehlende Konfiguration meldet die App selbst)', () => {
    expect(pruefeSchluessel(undefined)).toBeNull()
    expect(pruefeSchluessel('')).toBeNull()
    expect(pruefeSchluessel('fake-anon-key')).toBeNull()
    expect(pruefeSchluessel('a.b.c')).toBeNull()
    expect(pruefeSchluessel(`x.${btoa('kein json')}.y`)).toBeNull()
  })
})
