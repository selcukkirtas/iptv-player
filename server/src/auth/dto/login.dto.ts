import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  /** Absent/empty is valid for a profile that has no PIN set. */
  @IsOptional()
  @IsString()
  pin?: string;
}
