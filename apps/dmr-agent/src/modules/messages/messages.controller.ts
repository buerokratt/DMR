import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { ExternalServiceMessageDto } from '@dmr/shared';

@Controller({ path: 'messages', version: '1' })
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  sendMessage(@Body() data: ExternalServiceMessageDto): Promise<void> {
    return this.messagesService.sendEncryptedMessageToServer(data);
  }
}
