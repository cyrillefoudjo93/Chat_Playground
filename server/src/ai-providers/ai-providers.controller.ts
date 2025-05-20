import { Controller, Get } from '@nestjs/common';
import { AIOrchestrationService } from './services/ai-orchestration.service';

@Controller('ai-providers')
export class AiProvidersController {
  constructor(private readonly aiOrchestrationService: AIOrchestrationService) {}

  @Get('models')
  getAvailableModels() {
    const providers = this.aiOrchestrationService.getProviders(); // Corrected method name
    // Assuming provider IDs are suitable for display or we map them to display names
    // For now, let's return the provider IDs as model names.
    // This can be enhanced to return more descriptive names if needed.
    return providers.map(provider => ({ id: provider.id, name: this.mapProviderIdToName(provider.id) })); // Access provider.id
  }

  private mapProviderIdToName(providerId: string): string {
    switch (providerId.toLowerCase()) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'huggingface':
        return 'HuggingFace';
      default:
        return providerId;
    }
  }
}
