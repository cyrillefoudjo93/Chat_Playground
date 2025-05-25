import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SimpleRateLimitGuard } from '../rate-limiting/guards/simple-rate-limit.guard';
import { AIOrchestrationService } from './services/ai-orchestration.service';

@Controller('ai-providers')
export class AiProvidersController {
  constructor(private readonly aiOrchestrationService: AIOrchestrationService) {}

  @Get('models')
  @Throttle({ 'ai-request': { limit: 20, ttl: 60000 } }) // 20 requests per minute
  getAvailableModels() {
    const providers = this.aiOrchestrationService.getProviders(); // This now returns only enabled providers
    const models: { id: string; name: string; provider: string }[] = [];
    
    // Extract individual models from each enabled provider
    providers.forEach(provider => {
      provider.models.forEach(modelId => {
        models.push({
          id: `${provider.id}:${modelId}`, // Use provider:model format for unique identification
          name: `${this.mapProviderIdToName(provider.id)} - ${modelId}`,
          provider: provider.id
        });
      });
    });
    
    return models;
  }

  private mapProviderIdToName(providerId: string): string {
    switch (providerId.toLowerCase()) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'huggingface':
        return 'HuggingFace';
      case 'mistral':
        return 'Mistral AI';
      case 'gemini':
        return 'Google Gemini';
      default:
        return providerId;
    }
  }
}
