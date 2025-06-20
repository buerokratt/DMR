import { IsNotEmpty, IsString } from 'class-validator';
import { BaseMessageDto } from './base-message.dto';

export class AgentDecryptedMessageDto extends BaseMessageDto {
  @IsString({ each: true })
  @IsNotEmpty()
  payload!: string[];
}
