import { parseCatalogName } from './catalog-name';

describe('parseCatalogName', () => {
  it('takes the title from the first segment and the year from a bare year segment', () => {
    expect(parseCatalogName('Gerçek Sahtekâr | 2026 | 5.5 | NF')).toEqual({
      title: 'Gerçek Sahtekâr',
      year: 2026,
    });
  });

  it('extracts the year from a date segment when there is no bare year', () => {
    expect(
      parseCatalogName('Arka Sokaklar | 751. Bölüm | 05.06.2026 | Disney+'),
    ).toEqual({ title: 'Arka Sokaklar', year: 2026 });
  });

  it('handles the legacy "Title (2023)" form', () => {
    expect(parseCatalogName('The Alpha Movie (2023)')).toEqual({
      title: 'The Alpha Movie',
      year: 2023,
    });
  });

  it('returns just the title when no year is present', () => {
    expect(parseCatalogName('Madam Secretary')).toEqual({
      title: 'Madam Secretary',
    });
  });

  it('prefers a bare year over a later date segment', () => {
    expect(parseCatalogName('Film | 2019 | 01.01.2024 | X')).toEqual({
      title: 'Film',
      year: 2019,
    });
  });
});
