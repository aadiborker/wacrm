import { describe, expect, it } from 'vitest'
import {
  buildMediaFileName,
  buildS3ObjectKey,
  companySlugFromName,
} from './s3'

describe('companySlugFromName', () => {
  it('slugifies company names for S3 prefixes', () => {
    expect(companySlugFromName('Pashupathi Lights', 'abc')).toBe(
      'pashupathi-lights',
    )
    expect(companySlugFromName('Campco', 'abc')).toBe('campco')
    expect(companySlugFromName('Zuno AI', 'abc')).toBe('zuno-ai')
  })

  it('falls back to account id when name is empty', () => {
    expect(companySlugFromName('  ', 'uuid-1')).toBe('account-uuid-1')
  })
})

describe('buildS3ObjectKey', () => {
  it('nests under company / bucket / file', () => {
    expect(
      buildS3ObjectKey('pashupathi', 'chat-media', 'photo.png', 1700000000000),
    ).toBe('pashupathi/chat-media/1700000000000-photo.png')
  })
})

describe('buildMediaFileName', () => {
  it('sanitizes basename and lower-cases extension', () => {
    expect(buildMediaFileName('My Invoice (final).PDF', 1700000000000)).toBe(
      '1700000000000-My_Invoice_final_.pdf',
    )
  })
})
