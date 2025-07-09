import { IsNotEmpty, IsUUID } from 'class-validator';
import { ExternalServiceMessageDto } from './external-service-message.dto';

export class DMRServerMessageDto extends ExternalServiceMessageDto {
  @IsUUID()
  @IsNotEmpty()
  senderId!: string;
}
