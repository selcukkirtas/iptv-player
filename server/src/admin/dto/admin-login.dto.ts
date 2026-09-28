import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Minimum administrator password length. */
export const MIN_ADMIN_PASSWORD = 8;

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class AdminSetupDto {
  @IsString()
  @MinLength(MIN_ADMIN_PASSWORD, {
    message: `password must be at least ${MIN_ADMIN_PASSWORD} characters`,
  })
  password!: string;
}

export class ChangeAdminPasswordDto {
  @IsString()
  @IsNotEmpty()
  current!: string;

  @IsString()
  @MinLength(MIN_ADMIN_PASSWORD, {
    message: `password must be at least ${MIN_ADMIN_PASSWORD} characters`,
  })
  next!: string;
}
