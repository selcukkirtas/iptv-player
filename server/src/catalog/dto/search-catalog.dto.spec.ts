import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { SearchCatalogDto } from './search-catalog.dto';

describe('SearchCatalogDto', () => {
  it('converts numeric query params to numbers', () => {
    const dto = plainToInstance(SearchCatalogDto, {
      year: '2024',
      minRating: '7.5',
      maxImdbScore: '8.3',
    });

    expect(dto.year).toBe(2024);
    expect(dto.minRating).toBe(7.5);
    expect(dto.maxImdbScore).toBe(8.3);
  });
});
