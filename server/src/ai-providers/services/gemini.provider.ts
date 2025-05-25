import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AIProvider {
  private readonly gemini: GoogleGenerativeAI;
  private readonly logger = new Logger(GeminiProvider.name);

  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly models = ['gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn('Gemini API key not provided. Gemini provider will not work correctly.');
    }

    this.gemini = new GoogleGenerativeAI(apiKey || 'dummy-key');
  }

  private mapToChatMessage(msg: AIChatMessage): { role: string; parts: { text: string }[] } {
    return {
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    };
  }

  async generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions
  ): Promise<string> {
    try {
      const modelInstance = this.gemini.getGenerativeModel({ model });
      const chat = modelInstance.startChat({
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens,
          topP: options?.topP || 1,
        },
      });

      const response = await chat.sendMessage(
        messages[messages.length - 1].content // Gemini API expects only the last message
      );
      const result = await response.response;
      return result.text();
    } catch (error) {
      this.logger.error('Error generating Gemini completion:', error);
      throw error;
    }
  }

  async generateCompletionStream(
    messages: AIChatMessage[],
    model: string,
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions
  ): Promise<void> {
    try {
      const modelInstance = this.gemini.getGenerativeModel({ model });
      const chat = modelInstance.startChat({
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens,
          topP: options?.topP || 1,
        },
      });

      const response = await chat.sendMessageStream(
        messages[messages.length - 1].content
      );

      let fullResponse = '';
      
      for await (const chunk of response.stream) {
        const text = chunk.text();
        fullResponse += text;
        if (callbacks.onToken) {
          callbacks.onToken(text);
        }
      }

      callbacks.onComplete?.(fullResponse);
    } catch (error) {
      this.logger.error('Error in Gemini completion stream:', error);
      callbacks.onError?.(error as Error);
    }
  }
}
