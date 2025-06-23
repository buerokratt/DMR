import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { ExternalServiceMessageDto } from '@dmr/shared';

@Controller({ path: 'agent', version: '1' })
export class AgentsController {
  constructor(private readonly agentService: AgentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  sendMessage(@Body() data: ExternalServiceMessageDto): Promise<void> {
    return this.agentService.sendEncryptedMessageToServer(data);
  }
}
