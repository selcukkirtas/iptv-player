import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  vote_average: number;
  runtime: number;
  poster_path: string;
  genres: Array<{ id: number; name: string }>;
  credits: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      order: number;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
    }>;
  };
  external_ids?: {
    imdb_id?: string;
  };
}

interface TMDBSeries {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  last_air_date: string;
  vote_average: number;
  poster_path: string;
  status: string;
  genres: Array<{ id: number; name: string }>;
  aggregate_credits?: {
    cast: Array<{
      id: number;
      name: string;
      roles: Array<{ character: string; episode_count: number }>;
    }>;
    crew: Array<{
      id: number;
      name: string;
      jobs: Array<{ job: string; episode_count: number }>;
    }>;
  };
  external_ids?: {
    imdb_id?: string;
  };
}

/**
 * TMDB API client for metadata enrichment
 * Pi 3 dostu hafif istemci (caching, rate limiting)
 */
@Injectable()
export class TMDBClientService {
  private readonly logger = new Logger(TMDBClientService.name);
  private readonly apiKey: string;
  private readonly client: AxiosInstance;
  private readonly baseUrl = 'https://api.themoviedb.org/3';
  private readonly posterBaseUrl = 'https://image.tmdb.org/t/p/w200';
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY || '';

    if (!this.apiKey) {
      this.logger.warn(
        'TMDB_API_KEY env var is not set. Metadata enrichment disabled.',
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10s timeout for Pi 3
      params: {
        api_key: this.apiKey,
        language: 'en-US',
      },
    });
  }

  /**
   * Rate limiter for Pi 3 network (25 req/sec limit dari TMDB)
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (this.requestCount >= 25 && elapsed < 1000) {
      const delay = 1000 - elapsed;
      await new Promise((resolve) => setTimeout(resolve, delay));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    } else if (elapsed >= 1000) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    this.requestCount++;
  }

  /**
   * Search movie by title and year
   */
  async searchMovie(
    title: string,
    year?: number,
  ): Promise<{ id: number; title: string } | null> {
    if (!this.apiKey) return null;

    try {
      await this.rateLimit();

      const response = await this.client.get('/search/movie', {
        params: {
          query: title,
          year,
          page: 1,
        },
      });

      const results = response.data.results;
      if (!results || results.length === 0) {
        return null;
      }

      return {
        id: results[0].id,
        title: results[0].title,
      };
    } catch (error) {
      this.logger.error(`TMDB movie search failed for "${title}": ${error}`);
      return null;
    }
  }

  /**
   * Fetch full movie details with credits and external IDs
   */
  async getMovieDetails(tmdbId: number): Promise<TMDBMovie | null> {
    if (!this.apiKey) return null;

    try {
      await this.rateLimit();

      const response = await this.client.get(`/movie/${tmdbId}`, {
        params: {
          append_to_response: 'credits,external_ids',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `TMDB getMovieDetails failed for id ${tmdbId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * Search series by title and year
   */
  async searchSeries(
    title: string,
    year?: number,
  ): Promise<{ id: number; name: string } | null> {
    if (!this.apiKey) return null;

    try {
      await this.rateLimit();

      const response = await this.client.get('/search/tv', {
        params: {
          query: title,
          first_air_date_year: year,
          page: 1,
        },
      });

      const results = response.data.results;
      if (!results || results.length === 0) {
        return null;
      }

      return {
        id: results[0].id,
        name: results[0].name,
      };
    } catch (error) {
      this.logger.error(`TMDB series search failed for "${title}": ${error}`);
      return null;
    }
  }

  /**
   * Fetch full series details with credits and external IDs
   */
  async getSeriesDetails(tmdbId: number): Promise<TMDBSeries | null> {
    if (!this.apiKey) return null;

    try {
      await this.rateLimit();

      const response = await this.client.get(`/tv/${tmdbId}`, {
        params: {
          append_to_response: 'aggregate_credits,external_ids',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `TMDB getSeriesDetails failed for id ${tmdbId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * Construct poster URL
   */
  getPosterUrl(posterPath: string | null): string | undefined {
    if (!posterPath) return undefined;
    return `${this.posterBaseUrl}${posterPath}`;
  }

  /**
   * Check if TMDB API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
