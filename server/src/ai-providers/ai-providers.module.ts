import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIProvider } from './services/openai.provider';
import { AnthropicProvider } from './services/anthropic.provider';
import { HuggingFaceProvider } from './services/huggingface.provider';
import { MistralProvider } from './services/mistral.provider';
import { GeminiProvider } from './services/gemini.provider';
import { AIOrchestrationService } from './services/ai-orchestration.service';
import { AiProvidersController } from './ai-providers.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AiProvidersController],
  providers: [
    OpenAIProvider,
    AnthropicProvider,
    HuggingFaceProvider,
    MistralProvider,
    GeminiProvider,
    AIOrchestrationService,
  ],
  exports: [
    OpenAIProvider,
    AnthropicProvider,
    HuggingFaceProvider,
    MistralProvider,
    GeminiProvider,
    AIOrchestrationService,
  ],
})
export class AIProvidersModule {}
