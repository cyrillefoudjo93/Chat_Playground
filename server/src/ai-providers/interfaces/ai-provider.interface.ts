export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface AIStreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface AIProvider {
  id: string;
  name: string;
  readonly models: string[]; // Added readonly
  generateCompletion(
    messages: AIChatMessage[],
    model: string,
    options?: AICompletionOptions
  ): Promise<string>;
  
  generateCompletionStream(
    messages: AIChatMessage[],
    model: string,
    callbacks: AIStreamCallbacks,
    options?: AICompletionOptions
  ): Promise<void>;
}
