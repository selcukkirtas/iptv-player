import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Empty string (clears/absent) or a 4–8 digit PIN. */
const PIN_PATTERN = /^$|^[0-9]{4,8}$/;

/** `null` => unrestricted; an array => only those category names. */
class AllowedGroupsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  movies?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  series?: string[] | null;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  kids?: boolean;

  /** Hide age-restricted categories without marking the profile as kids. */
  @IsOptional()
  @IsBoolean()
  hideAdult?: boolean;

  /** Suspend the profile: it keeps its settings but cannot be signed into. */
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(PIN_PATTERN, { message: 'pin must be 4–8 digits' })
  pin?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AllowedGroupsDto)
  allowed?: AllowedGroupsDto;
}
