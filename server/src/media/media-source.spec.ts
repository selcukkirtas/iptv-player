import { BadRequestException } from '@nestjs/common';
import { formatMediaRef, parseMediaRef } from './media-source';

describe('parseMediaRef', () => {
  it('parses a channel ref', () => {
    expect(parseMediaRef('channel:abc')).toEqual({
      kind: 'channel',
      id: 'abc',
    });
  });

  it('parses a movie ref', () => {
    expect(parseMediaRef('movie:12345')).toEqual({
      kind: 'movie',
      id: '12345',
    });
  });

  it('parses an episode ref into series + episode', () => {
    expect(parseMediaRef('episode:55:990')).toEqual({
      kind: 'episode',
      seriesId: '55',
      id: '990',
    });
  });

  it('keeps colons that belong to the id itself', () => {
    expect(parseMediaRef('channel:tvg:uk:bbc')).toEqual({
      kind: 'channel',
      id: 'tvg:uk:bbc',
    });
  });

  it.each([
    ['', 'empty'],
    ['channel', 'no separator'],
    ['channel:', 'no id'],
    [':abc', 'no kind'],
    ['episode:55', 'episode without episode id'],
    ['episode:55:', 'episode with empty episode id'],
    ['playlist:1', 'unknown kind'],
    ['http://evil.example/x', 'a raw URL'],
  ])('rejects %p (%s)', (input) => {
    expect(() => parseMediaRef(input)).toThrow(BadRequestException);
  });

  it('round-trips through formatMediaRef', () => {
    for (const src of ['channel:abc', 'movie:9', 'episode:55:990']) {
      expect(formatMediaRef(parseMediaRef(src))).toBe(src);
    }
  });
});
