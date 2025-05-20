import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIProvider.name);
  
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly models = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('OpenAI API key not provided. OpenAI provider will not work correctly.');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
    });
  }

  private mapToChatCompletionMessage(msg: AIChatMessage): ChatCompletionMessageParam {
    switch (msg.role) {
      case 'function':
        return {
          role: 'function',
          content: msg.content,
          name: msg.name || 'unknown',
        };
      case 'assistant':
        return {
          role: 'assistant',
          content: msg.content,
          ...(msg.functionCall ? {
            function_call: {
              name: msg.functionCall.name,
              arguments: msg.functionCall.arguments,
            }
          } : {})
        };
      case 'system':
        return {
          role: 'system',
          content: msg.content,
        };
      case 'user':
      default:
        return {
          role: 'user',
          content: msg.content,
        };
    }
  }
  
  async generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions,
  ): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: messages.map(msg => this.mapToChatCompletionMessage(msg)),
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP || 1,
        frequency_penalty: options?.frequencyPenalty || 0,
        presence_penalty: options?.presencePenalty || 0,
        ...(options?.stopSequences ? { stop: options.stopSequences } : {}),
      });
      
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error(`OpenAI completion failed: ${error.message}`, error.stack);
      throw new Error(`OpenAI completion failed: ${error.message}`);
    }
  }
  
  async generateCompletionStream(
    messages: AIChatMessage[],
    model: string,
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions,
  ): Promise<void> {
    try {
      const stream = await this.openai.chat.completions.create({
        model: model,
        messages: messages.map(msg => this.mapToChatCompletionMessage(msg)),
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP || 1,
        frequency_penalty: options?.frequencyPenalty || 0,
        presence_penalty: options?.presencePenalty || 0,
        ...(options?.stopSequences ? { stop: options.stopSequences } : {}),
        stream: true,
      });
      
      let fullResponse = '';
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          if (callbacks.onToken) {
            callbacks.onToken(content);
          }
        }
      }
      
      if (callbacks.onComplete) {
        callbacks.onComplete(fullResponse);
      }
    } catch (error) {
      this.logger.error(`OpenAI stream failed: ${error.message}`, error.stack);
      if (callbacks.onError) {
        callbacks.onError(error);
      }
      throw error;
    }
  }
}
