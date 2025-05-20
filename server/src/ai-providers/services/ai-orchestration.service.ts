import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { HuggingFaceProvider } from './huggingface.provider';

@Injectable()
export class AIOrchestrationService {
  private readonly providers: Map<string, AIProvider>;
  private readonly logger = new Logger(AIOrchestrationService.name);
  private readonly fallbackOrder: string[];
  
  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly huggingfaceProvider: HuggingFaceProvider,
  ) {
    // Initialize providers map
    this.providers = new Map();
    this.providers.set(openaiProvider.id, openaiProvider);
    this.providers.set(anthropicProvider.id, anthropicProvider);
    this.providers.set(huggingfaceProvider.id, huggingfaceProvider);
    
    // Define fallback order (can be configured via env variables)
    this.fallbackOrder = [
      this.configService.get<string>('AI_PRIMARY_PROVIDER', 'openai'),
      this.configService.get<string>('AI_SECONDARY_PROVIDER', 'anthropic'),
      this.configService.get<string>('AI_TERTIARY_PROVIDER', 'huggingface'),
    ];
  }
  
  /**
   * Get available AI providers
   */
  getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get available models for a specific provider
   */
  getModelsForProvider(providerId: string): string[] {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return provider.models;
  }
  
  /**
   * Generate a completion using the specified provider
   * @param providerId Provider ID
   * @param model Model name
   * @param messages Array of messages
   * @param options Completion options
   */
  async generateCompletion(
    providerId: string,
    model: string,
    messages: AIChatMessage[],
    options?: AICompletionOptions,
  ): Promise<string> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    return provider.generateCompletion(messages, model, options);
  }
  
  /**
   * Generate a completion with automatic fallback to other providers
   * @param messages Array of messages
   * @param options Completion options
   */
  async generateCompletionWithFallback(
    messages: AIChatMessage[],
    options?: AICompletionOptions,
  ): Promise<{ providerId: string; model: string; completion: string }> {
    let lastError: Error | null = null;
    
    // Try each provider in fallback order
    for (const providerId of this.fallbackOrder) {
      try {
        const provider = this.providers.get(providerId);
        if (!provider || provider.models.length === 0) {
          continue;
        }
        
        // Use the first model for the provider
        const model = provider.models[0];
        const completion = await provider.generateCompletion(messages, model, options);
        
        return {
          providerId,
          model,
          completion,
        };
      } catch (error) {
        this.logger.warn(`Provider ${providerId} failed: ${error.message}`);
        lastError = error;
      }
    }
    
    // If all providers failed
    throw lastError || new Error('All providers failed to generate completion');
  }
  
  /**
   * Stream a completion using the specified provider
   * @param providerId Provider ID
   * @param model Model name
   * @param messages Array of messages
   * @param callbacks Stream callbacks
   * @param options Completion options
   */
  async streamCompletion(
    providerId: string,
    model: string,
    messages: AIChatMessage[],
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions,
  ): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    return provider.generateCompletionStream(messages, model, callbacks, options);
  }
  
  /**
   * Stream a completion with automatic fallback to other providers
   * @param messages Array of messages
   * @param callbacks Stream callbacks
   * @param options Completion options
   */
  async streamCompletionWithFallback(
    messages: AIChatMessage[],
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions,
  ): Promise<string> {
    const originalOnError = callbacks.onError;
    
    // Try each provider in fallback order
    for (let i = 0; i < this.fallbackOrder.length; i++) {
      const providerId = this.fallbackOrder[i];
      const provider = this.providers.get(providerId);
      
      if (!provider || provider.models.length === 0) {
        continue;
      }
      
      const model = provider.models[0];
      if (!model) {
        this.logger.warn(`No model available for provider ${providerId}, trying next provider`);
        continue;
      }

      const isLastProvider = i === this.fallbackOrder.length - 1;
      
      try {
        // Create a promise that resolves when streaming is complete
        const streamPromise = new Promise<string>((resolve, reject) => {
          const enhancedCallbacks: AIStreamCallbacks = {
            onToken: callbacks.onToken,
            onComplete: (fullResponse) => {
              if (callbacks.onComplete) {
                callbacks.onComplete(fullResponse);
              }
              resolve(fullResponse);
            },
            onError: (error) => {
              // Don't call the original onError unless this is the last provider
              if (isLastProvider && originalOnError) {
                originalOnError(error);
              }
              reject(error);
            },
          };
          
          provider.generateCompletionStream(messages, model, enhancedCallbacks, options);
        });
        
        // Return the full response when streaming is complete
        return await streamPromise;
      } catch (error) {
        this.logger.warn(
          `Provider ${providerId} streaming failed, trying next provider: ${error.message}`,
        );
        
        if (isLastProvider && originalOnError) {
          originalOnError(error);
        }
      }
    }
    
    throw new Error('All providers failed to stream completion');
  }
}
