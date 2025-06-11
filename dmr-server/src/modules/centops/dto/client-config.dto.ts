import { IsString, IsUUID, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

export class ClientConfigDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  authenticationCertificate: string;

  @IsString()
  @IsNotEmpty()
  createdAt: string;

  @IsString()
  @IsNotEmpty()
  updatedAt: string;
}
