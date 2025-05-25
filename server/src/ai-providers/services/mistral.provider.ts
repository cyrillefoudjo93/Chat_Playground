import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIChatMessage,
  AICompletionOptions,
  AIProvider,
  AIStreamCallbacks,
} from '../interfaces/ai-provider.interface';

// Helper function to parse Server-Sent Events (SSE)
async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
  logger: Logger,
): AsyncGenerator<any, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let chunkCounter = 0;

  // logger.debug('[parseSSE] Starting to read from stream.'); // Already exists

  // Helper to process a string that might contain multiple JSON objects
  async function* processJsonString(jsonStr: string, context: string): AsyncGenerator<any, void, undefined> {
    let currentJsonStr = jsonStr.trim();
    if (!currentJsonStr) {
      logger.debug(`[parseSSE] ${context}: processJsonString received empty or whitespace string.`);
      return;
    }
    logger.debug(`[parseSSE] ${context}: processJsonString processing: "${currentJsonStr}"`);

    while (currentJsonStr) {
      try {
        const parsed = JSON.parse(currentJsonStr);
        logger.debug(`[parseSSE] ${context}: Successfully parsed: ${JSON.stringify(parsed)}`);
        yield parsed;
        chunkCounter++; // Correctly increment itemsYielded
        return; 
      } catch (e) {
        logger.warn(`[parseSSE] ${context}: Initial parse failed for "${currentJsonStr}". Error: ${e.message}`);
        const match = /Unexpected non-whitespace character after JSON at position (\\d+)/.exec(e.message);
        if (match && match[1]) {
          const position = parseInt(match[1], 10);
          const firstJsonPart = currentJsonStr.substring(0, position);
          logger.debug(
            `[parseSSE] ${context}: Attempting to parse first JSON part: "${firstJsonPart}" (up to position ${position})`,
          );
          try {
            const parsedFirst = JSON.parse(firstJsonPart);
            logger.debug(
              `[parseSSE] ${context}: Successfully parsed first part: ${JSON.stringify(parsedFirst)}`
            );
            yield parsedFirst;
            chunkCounter++; // Correctly increment itemsYielded
            currentJsonStr = currentJsonStr.substring(position).trim();
            if (currentJsonStr.length > 0) {
              logger.debug(`[parseSSE] ${context}: Remaining segment to process: "${currentJsonStr}"`);
            }
            continue; 
          } catch (e2) {
            logger.error(
              `[parseSSE] ${context}: Failed to parse the extracted first JSON part. Error: ${e2.message}. Original full segment: "${currentJsonStr}". Extracted part for parsing: "${firstJsonPart}". Position used for split: ${position}. Discarding full segment.`
            );
            currentJsonStr = ''; 
          }
        } else if (e.message.includes("Unexpected token 'd' at position 0 in JSON") || e.message.includes("Unexpected token 'e' at position 0 in JSON")) { // check for event: too
           logger.warn(`[parseSSE] ${context}: Possible 'data: data: ' or 'event: type' prefix issue. Original: "${jsonStr}". Current segment: "${currentJsonStr}". Discarding segment.`);
           currentJsonStr = ''; 
        }
        else {
          logger.error(
            `[parseSSE] ${context}: Unhandled parsing error for "${currentJsonStr}". Error: ${e.message}. Discarding segment.`,
          );
          currentJsonStr = ''; 
        }
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        logger.debug(`[parseSSE] Stream is done. Processing final buffer content: "${buffer}"`);
        if (buffer.trim().length > 0) {
          const finalLines = buffer.split(/\\r\\n|\\n|\\r/);
          logger.debug(`[parseSSE] Final buffer split into lines: ${JSON.stringify(finalLines)}`);

          for (const line of finalLines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
              const jsonString = trimmedLine.substring(5).trim();
              if (jsonString) {
                logger.debug(`[parseSSE] Final Buffer: Processing data line: "${jsonString}"`);
                for await (const item of processJsonString(jsonString, `Final Buffer Line: "${jsonString.substring(0, Math.min(50, jsonString.length))}..."`)) {
                  logger.debug(`[parseSSE] Final Buffer: Attempting to yield: ${JSON.stringify(item)}`);
                  logger.debug(`[parseSSE] Yielding item from final buffer line: ${JSON.stringify(item)}`);
                  yield item;
                  // itemsYielded is incremented by processJsonString
                }
              } else {
                logger.debug(`[parseSSE] Final Buffer: Empty data line after 'data:', skipping: "${trimmedLine}"`);
              }
            } else if (trimmedLine && trimmedLine.toLowerCase() !== '[done]' && !trimmedLine.toLowerCase().startsWith('event:')) {
              logger.warn(`[parseSSE] Final Buffer: Non-data, non-[DONE], non-event line encountered and skipped: "${trimmedLine}"`);
            }
          }

          if (chunkCounter === 0 && buffer.trim().length > 0) {
             const hasDataLines = finalLines.some(l => l.trim().startsWith('data:'));
             if (!hasDataLines) {
                logger.warn(`[parseSSE] Stream ended with unprocessed buffer content that did not contain 'data:' lines: "${buffer}"`);
             } else {
                logger.warn(`[parseSSE] Stream ended, 'data:' lines were present in buffer, but processJsonString yielded no items from them. Buffer: "${buffer}"`);
             }
          }
        } else {
          logger.debug('[parseSSE] Stream is done. Final buffer is empty.');
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      logger.debug(`[parseSSE] Decoded chunk. Current buffer: "${buffer}"`);

      let lines = buffer.split(/\\r\\n|\\n|\\r/); 

      if (lines.length > 0 && (!buffer.endsWith('\\n') && !buffer.endsWith('\\r'))) {
        buffer = lines.pop() || ''; 
      } else {
        buffer = ''; 
      }

      for (const line of lines) {
        const trimmedLine = line.trim(); 
        if (trimmedLine.startsWith('data:')) {
          const jsonStr = trimmedLine.substring(5).trim();
          if (jsonStr === '[DONE]') { 
            logger.debug('[parseSSE] Main Loop: Received [DONE] marker, stopping generation.');
            // Try to release lock before returning, as finally might be skipped.
            try {
                if (!reader.closed) reader.releaseLock();
                logger.debug('[parseSSE] Stream reader released due to [DONE] in main loop.');
            } catch (rlError) {
                logger.warn(`[parseSSE] Error releasing reader on [DONE]: ${rlError.message}`);
            }
            logger.debug(
              `[parseSSE] Processing finished due to [DONE]. Total items yielded: ${chunkCounter}.`
            );
            return; 
          }
          if (jsonStr) {
            for await (const parsedItem of processJsonString(jsonStr, "Main Loop")) {
                logger.debug(`[parseSSE] Main Loop: Attempting to yield: ${JSON.stringify(parsedItem)}`);
                yield parsedItem;
            }
          }
        } else if (trimmedLine) {
          logger.debug(`[parseSSE] Main Loop: Received non-data line: "${trimmedLine}"`);
        }
      }
    }
  } catch (error) {
    logger.error('[parseSSE] Error reading or processing stream:', error.stack || error);
  } finally {
    try {
        // Ensure the lock is released if the stream hasn't been closed/released already.
        // reader.closed might not be fully reliable depending on exact stream state,
        // but it's a reasonable check. A more robust check might involve a flag.
        if (typeof reader?.releaseLock === 'function') { // Check if reader and releaseLock exist
            // Attempt to release if not obviously closed.
            // A more advanced check would be to see if the lock is active.
            // For now, rely on it potentially throwing if already released, and catch that.
            reader.releaseLock();
            logger.debug('[parseSSE] Stream reader released in finally block.');
        }
    } catch (releaseError) {
        // This error often means it was already released (e.g. by the [DONE] path) or the stream was already closed.
        logger.warn(`[parseSSE] Error releasing reader in finally: ${releaseError.message}. May have been released or closed already.`);
    }
    logger.debug(
      `[parseSSE] Processing finished. Total items yielded by parseSSE: ${chunkCounter}.`,
    );
  }
}

@Injectable()
export class MistralProvider implements AIProvider {
  // private readonly mistral: MistralClient; // Comment out original client instance
  private readonly logger = new Logger(MistralProvider.name);
  private readonly apiKey: string | undefined; // Allow apiKey to be undefined initially
  
  readonly id = 'mistral';
  readonly name = 'Mistral AI';
  readonly models = ['mistral-medium', 'mistral-large', 'mistral-small', 'codestral'];
  
  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MISTRAL_API_KEY'); // Assign directly
    
    if (!this.apiKey) {
      this.logger.warn('MISTRAL_API_KEY not found in config. Mistral provider will likely not work correctly.');
    } else {
      this.logger.log('MISTRAL_API_KEY found and will be used for direct API calls.');
    }
  }

  private mapToChatMessage(msg: AIChatMessage): { role: string; content: string } {
    return {
      role: msg.role,
      content: msg.content,
    };
  }

  async generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions
  ): Promise<string> {
    if (!this.apiKey) {
      this.logger.error('Cannot generate completion without MISTRAL_API_KEY.');
      throw new Error('Mistral API key not configured.');
    }
    const payload = {
      model: model,
      messages: messages.map(this.mapToChatMessage),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens, // Ensure correct parameter name for Mistral API
      top_p: options?.topP, // Ensure correct parameter name
      stream: false, // Explicitly set stream to false for non-streaming
    };

    this.logger.debug(`[MistralProvider] Generating non-streamed completion with payload: ${JSON.stringify(payload, null, 2)}`);

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Mistral API error: ${response.status} ${response.statusText} - ${errorBody}`);
        throw new Error(`Mistral API request failed: ${response.status} ${errorBody}`);
      }

      const responseData = await response.json();
      this.logger.debug(`[MistralProvider] Non-streamed response data: ${JSON.stringify(responseData, null, 2)}`);
      return responseData.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('Error generating Mistral completion (non-streamed):', error);
      throw error;
    }
  }

  async generateCompletionStream(
    messages: AIChatMessage[],
    modelId: string,
    callbacks: AIStreamCallbacks, // callbacks is not optional and comes before options
    options?: AICompletionOptions,
  ): Promise<void> { // Return type is Promise<void>
    if (!this.apiKey) {
      this.logger.error(
        'Cannot generate completion stream without MISTRAL_API_KEY.',
      );
      // Call onError callback if provided, then throw
      callbacks?.onError?.(new Error('Mistral API key not configured.'));
      throw new Error('Mistral API key not configured.');
    }
    const payload = {
      model: modelId,
      messages: messages.map(this.mapToChatMessage),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stream: true,
    };

    this.logger.debug(
      `[MistralProvider] Generating streamed completion with payload: ${JSON.stringify(payload, null, 2)}`,
    );

    let chunkCounter = 0;
    let accumulatedContent = '';

    try {
      const response = await fetch(
        'https://api.mistral.ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(
          `Mistral API request failed: ${response.status} ${response.statusText} - ${errorBody}`
        );
        this.logger.error(
          `[MistralProvider] API request failed: ${response.status} ${response.statusText} - ${errorBody}`,
        );
        callbacks?.onError?.(error);
        throw error;
      }

      if (!response.body) {
        const error = new Error('Response body is null');
        this.logger.error('[MistralProvider] Response body is null.');
        callbacks?.onError?.(error);
        throw error;
      }

      const sseStream = parseSSE(response.body, this.logger);

      for await (const chunk of sseStream) {
        this.logger.debug(`[generateCompletionStream] Received chunk from sseStream: ${JSON.stringify(chunk)}`);
        chunkCounter++;
        if (chunk.choices && chunk.choices.length > 0) {
          const delta = chunk.choices[0].delta;
          if (delta && delta.content) {
            const content = delta.content;
            accumulatedContent += content;
            // yield content; // Not yielding string directly, using callbacks
            if (callbacks?.onToken) {
              try {
                callbacks.onToken(content);
              } catch (callbackError) {
                this.logger.error(
                  '[MistralProvider] Error in onToken callback:',
                  callbackError,
                );
              }
            }
          }
          if (chunk.choices[0].finish_reason) {
            this.logger.debug(
              `[MistralProvider] Stream finished with reason: ${chunk.choices[0].finish_reason}`,
            );
            // Use onComplete instead of onCompletion
            if (callbacks?.onComplete) {
               try {
                // Pass only accumulatedContent to onComplete as per AIStreamCallbacks
                callbacks.onComplete(accumulatedContent);
              } catch (callbackError) {
                this.logger.error(
                  '[MistralProvider] Error in onComplete callback:',
                  callbackError,
                );
              }
            }
            // The stream will end naturally.
            // The `finally` block of this try/catch will handle final logging.
            // If onComplete was called, it signals the end of content.
            return; // Explicitly return to signify completion based on finish_reason
          }
        }
      }
      // If the loop finishes without a finish_reason (e.g. stream just ends)
      // and onComplete hasn't been called yet, call it now.
      if (callbacks?.onComplete) {
        this.logger.debug('[MistralProvider] Stream ended, calling onComplete with accumulated content.');
        try {
          callbacks.onComplete(accumulatedContent);
        } catch (callbackError) {
          this.logger.error(
            '[MistralProvider] Error in final onComplete callback:',
            callbackError,
          );
        }
      }

    } catch (error) {
      this.logger.error(
        '[MistralProvider] Error during stream generation:',
        error.stack || error,
      );
      if (callbacks?.onError) {
        try {
          callbacks.onError(error as Error);
        } catch (callbackError) {
          this.logger.error(
            '[MistralProvider] Error in onError callback:',
            callbackError,
          );
        }
      } else {
        // If no onError callback, the error should have been thrown already or will be.
        // To be safe, rethrow if not already handled by specific error checks above.
        if (!(error instanceof Error && error.message.startsWith("Mistral API request failed"))) {
             throw error;
        }
      }
    } finally {
      this.logger.debug(
        `[generateCompletionStream] FINALLY_ACC_CONTENT_CHECK: "${accumulatedContent}"`,
      );
      this.logger.debug(
        `[MistralProvider] generateCompletionStream processing finished. Total chunks processed by generateCompletionStream: ${chunkCounter}.`,
      );
    }
  }
}
