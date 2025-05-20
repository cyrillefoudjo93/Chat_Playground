import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class AnthropicProvider implements AIProvider {
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(AnthropicProvider.name);
  
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly models = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
  
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('Anthropic API key not provided. Anthropic provider will not work correctly.');
    }
    
    this.anthropic = new Anthropic({
      apiKey: apiKey || 'dummy-key',
    });
  }
  
  async generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions,
  ): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: model,
        messages: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
          ...(msg.name ? { name: msg.name } : {}),
        })),
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 1,
      });

      return response.content.map(block => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      }).join('');
      
    } catch (error) {
      this.logger.error(`Anthropic completion failed: ${error.message}`, error.stack);
      throw new Error(`Anthropic completion failed: ${error.message}`);
    }
  }
  
  async generateCompletionStream(
    messages: AIChatMessage[],
    model: string,
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions,
  ): Promise<void> {
    try {
      const stream = await this.anthropic.messages.create({
        model: model,
        messages: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
          ...(msg.name ? { name: msg.name } : {}),
        })),
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 1,
        stream: true,
      });
      
      let fullResponse = '';
      
      for await (const chunk of stream) {
        // Handle content blocks using type assertion for stream events
        const event = chunk as { type: string; delta?: { text?: string } };
        
        if (event.type === 'content_block_delta' && event.delta?.text) {
          const text = event.delta.text;
          fullResponse += text;
          if (callbacks.onToken) {
            callbacks.onToken(text);
          }
        }
      }
      
      if (callbacks.onComplete) {
        callbacks.onComplete(fullResponse);
      }
    } catch (error) {
      this.logger.error(`Anthropic stream failed: ${error.message}`, error.stack);
      if (callbacks.onError) {
        callbacks.onError(error);
      }
      throw error;
    }
  }
}
