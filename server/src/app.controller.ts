import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public() // Allow public access to this endpoint
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public() // Allow public access to this endpoint
  getHealth(): { status: string; timestamp: string; version: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
    };
  }
}

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50(2))
// Issue: No evidence of disclosure mechanism informing users about the use of copyrighted training data
// Suggestion: Add model information method that includes training data disclosure in AIOrchestrationService
// ──────────────────────────────────────────────────────────
getModelInfo(providerId: string) {
  const provider = this.providers.get(providerId);
  return {
    provider: provider?.name,
    models: provider?.models,
    disclosure: 'This model was trained on data that may include copyrighted material. See provider terms.'
  };
}

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50(3))
// Issue: No specific safeguards documented against generation of illegal content
// Suggestion: Add basic content moderation check before returning AI completions
// ──────────────────────────────────────────────────────────
const completion = await provider.generateCompletion(messages, model, options);
if (this.containsProhibitedContent(completion)) {
  throw new Error('Content violates safety policies');
}
return completion;

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50(4))
// Issue: No evidence of bias testing or safeguards against unlawful discrimination
// Suggestion: Add bias disclaimer to model metadata and log potential sensitive topics
// ──────────────────────────────────────────────────────────
const models = provider.models;
this.logger.warn('AI output may reflect biases from training data. Review for protected characteristics.');
return models;
