import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HfInference } from '@huggingface/inference';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class HuggingFaceProvider implements AIProvider {
  private readonly hf: HfInference;
  private readonly logger = new Logger(HuggingFaceProvider.name);
  
  readonly id = 'huggingface';
  readonly name = 'Hugging Face';
  readonly models = ['meta-llama/Llama-2-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'];
  
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('Hugging Face API key not provided. HuggingFace provider will not work correctly.');
    }
    
    this.hf = new HfInference(apiKey || 'dummy-key');
  }
  
  async generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions,
  ): Promise<string> {
    try {
      // Convert messages to Hugging Face format
      const prompt = this.formatMessagesForModel(messages, model);
      
      // Call the Hugging Face inference API
      const response = await this.hf.textGeneration({
        model: model,
        inputs: prompt,
        parameters: {
          max_new_tokens: options?.maxTokens || 512,
          temperature: options?.temperature || 0.7,
          top_p: options?.topP || 0.95,
        },
      });
      
      return response.generated_text || '';
    } catch (error) {
      this.logger.error(`Hugging Face completion failed: ${error.message}`, error.stack);
      throw new Error(`Hugging Face completion failed: ${error.message}`);
    }
  }
  
  async generateCompletionStream(
    messages: AIChatMessage[],
    model: string,
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions,
  ): Promise<void> {
    try {
      // Convert messages to Hugging Face format
      const prompt = this.formatMessagesForModel(messages, model);
      
      // HF inference doesn't natively support streaming, so we simulate it
      // In a production app, you would use the HF Inference Endpoints API with streaming
      const fullResponse = await this.generateCompletion(messages, model, options);
      
      // Simulate streaming by sending chunks
      // This is just a demo implementation - in production you'd use real streaming
      const chunkSize = 4;
      let position = 0;
      
      while (position < fullResponse.length) {
        const chunk = fullResponse.slice(position, position + chunkSize);
        position += chunkSize;
        
        if (callbacks.onToken) {
          callbacks.onToken(chunk);
        }
        
        // Add a small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      
      if (callbacks.onComplete) {
        callbacks.onComplete(fullResponse);
      }
    } catch (error) {
      this.logger.error(`Hugging Face stream failed: ${error.message}`, error.stack);
      if (callbacks.onError) {
        callbacks.onError(error);
      }
      throw error;
    }
  }
  
  // Helper to format messages for different model types
  private formatMessagesForModel(messages: AIChatMessage[], model: string): string {
    // Format for Llama-2
    if (model.includes('llama')) {
      let formattedPrompt = '';
      
      for (const message of messages) {
        if (message.role === 'system') {
          formattedPrompt += `<s>[INST] <<SYS>>\n${message.content}\n<</SYS>>\n\n`;
        } else if (message.role === 'user') {
          formattedPrompt += `${message.content} [/INST]\n`;
        } else if (message.role === 'assistant') {
          formattedPrompt += `${message.content} </s><s>[INST] `;
        }
      }
      
      return formattedPrompt;
    }
    
    // Format for Mixtral
    else if (model.includes('mixtral')) {
      let formattedPrompt = '';
      
      for (const message of messages) {
        if (message.role === 'system') {
          formattedPrompt += `<s>[INST] ${message.content}\n\n`;
        } else if (message.role === 'user') {
          formattedPrompt += `${message.content} [/INST]\n`;
        } else if (message.role === 'assistant') {
          formattedPrompt += `${message.content} </s><s>[INST] `;
        }
      }
      
      return formattedPrompt;
    } 
    
    // Generic format for other models
    else {
      return messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }
  }
}
