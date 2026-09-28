import { IsNotEmpty, IsString } from 'class-validator';

export class AddFavoriteDto {
  @IsString()
  @IsNotEmpty()
  channelId!: string;
}
