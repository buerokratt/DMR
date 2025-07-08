import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IAgent } from '../interfaces';

export class AgentDto implements IAgent {
  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  authenticationCertificate!: string;

  @IsString()
  @IsNotEmpty()
  createdAt!: string;

  @IsString()
  @IsNotEmpty()
  updatedAt!: string;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}
