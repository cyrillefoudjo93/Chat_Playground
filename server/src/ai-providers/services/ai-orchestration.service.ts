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
import { MistralProvider } from './mistral.provider';
import { GeminiProvider } from './gemini.provider';

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
    private readonly mistralProvider: MistralProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {
    // Initialize providers map
    this.providers = new Map();
    this.logger.debug('Initializing AIOrchestrationService');
    try {
      this.providers.set(openaiProvider.id, openaiProvider);
      this.providers.set(anthropicProvider.id, anthropicProvider);
      this.providers.set(huggingfaceProvider.id, huggingfaceProvider);
      this.providers.set(mistralProvider.id, mistralProvider);
      this.providers.set(geminiProvider.id, geminiProvider);
      this.logger.debug('Providers map initialized successfully.');
    } catch (error) {
      this.logger.error('Error initializing providers map:', error);
    }
    
    // Define fallback order (can be configured via env variables)
    try {
      this.fallbackOrder = [
        this.configService.get<string>('AI_PRIMARY_PROVIDER', 'openai'),
        this.configService.get<string>('AI_SECONDARY_PROVIDER', 'anthropic'),
        this.configService.get<string>('AI_TERTIARY_PROVIDER', 'huggingface'),
      ];
      this.logger.debug(`Fallback order set: ${this.fallbackOrder.join(', ')}`);
    } catch (error) {
      this.logger.error('Error setting fallback order:', error);
    }
  }
  
  /**
   * Get available AI providers (only those with valid API keys)
   */
  getProviders(): AIProvider[] {
    this.logger.debug('Attempting to get enabled providers...');
    const enabledProviders: AIProvider[] = [];
    
    if (!this.providers || this.providers.size === 0) {
      this.logger.warn('Providers map is not initialized or is empty.');
      return [];
    }

    // Check each provider for valid API key
    for (const provider of this.providers.values()) {
      if (!provider || !provider.id) {
        this.logger.warn('Encountered an undefined provider or provider with no ID in the map.');
        continue;
      }
      this.logger.debug(`Checking provider: ${provider.id}`);
      const apiKeyName = this.getApiKeyNameForProvider(provider.id);
      const apiKey = this.configService.get<string>(apiKeyName);
      this.logger.debug(`API Key Name for ${provider.id}: ${apiKeyName}, Fetched API Key: ${apiKey ? 'Exists' : 'Not Found or Empty'}`);
      
      // Only include providers with valid API keys (not placeholders, test keys, or empty)
      if (apiKey && 
          apiKey !== 'test-key' && 
          apiKey !== 'dummy-key' && 
          !apiKey.startsWith('your-') &&
          !apiKey.endsWith('-api-key') &&
          apiKey.length > 10) {
        this.logger.log(`Provider ${provider.id} is ENABLED.`);
        enabledProviders.push(provider);
      } else {
        this.logger.warn(`Provider ${provider.id} is DISABLED - API key '${apiKeyName}' is missing, a placeholder, or too short. Current value: '${apiKey}'`);
      }
    }
    
    this.logger.debug(`Returning ${enabledProviders.length} enabled providers: ${enabledProviders.map(p => p.id).join(', ')}`);
    return enabledProviders;
  }

  /**
   * Get the environment variable name for a provider's API key
   */
  private getApiKeyNameForProvider(providerId: string): string {
    switch (providerId) {
      case 'openai':
        return 'OPENAI_API_KEY';
      case 'anthropic':
        return 'ANTHROPIC_API_KEY';
      case 'huggingface':
        return 'HUGGINGFACE_API_KEY';
      case 'mistral':
        return 'MISTRAL_API_KEY';
      case 'gemini':
        return 'GEMINI_API_KEY';
      default:
        return `${providerId.toUpperCase()}_API_KEY`;
    }
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
