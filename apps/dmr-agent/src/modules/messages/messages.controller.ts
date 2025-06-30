import { Body, Controller, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { ExternalServiceMessageDto } from '@dmr/shared';
import { TimeoutInterceptor } from '../../common/interceptors/timeout.interceptor';

@Controller({ path: 'messages', version: '1' })
@UseInterceptors(TimeoutInterceptor)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  sendMessage(@Body() data: ExternalServiceMessageDto): Promise<void> {
    return this.messagesService.sendEncryptedMessageToServer(data);
  }
}
