import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIProvider } from './services/openai.provider';
import { AnthropicProvider } from './services/anthropic.provider';
import { HuggingFaceProvider } from './services/huggingface.provider';
import { AIOrchestrationService } from './services/ai-orchestration.service';
import { AiProvidersController } from './ai-providers.controller'; // Import the controller

@Module({
  imports: [ConfigModule],
  controllers: [AiProvidersController], // Add the controller to the declarations
  providers: [
    OpenAIProvider,
    AnthropicProvider,
    HuggingFaceProvider,
    AIOrchestrationService,
  ],
  exports: [
    OpenAIProvider,
    AnthropicProvider,
    HuggingFaceProvider,
    AIOrchestrationService,
  ],
})
export class AIProvidersModule {}
