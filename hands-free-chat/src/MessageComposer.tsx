import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface MessageComposerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  partyKitClient?: any; // Make partyKitClient optional
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  socket?: Socket | null; // Add socket reference for AI messages
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
}

const MessageComposer: React.FC<MessageComposerProps> = ({
  partyKitClient,
  selectedModel,
  setSelectedModel,
  socket,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);

  useEffect(() => {
    console.log('Fetching available models...');
    // Use relative URL to automatically adapt to where the frontend is served from
    // This will work both in development and production environments
    fetch('/api/ai-providers/models') 
      .then(response => {
        if (!response.ok) {
          console.error('Fetch response not OK:', response);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Received models data:', data);
        if (Array.isArray(data) && data.length > 0) {
          setAvailableModels(data);
          // Set a default model only if the current selectedModel (from props) is not in the fetched list.
          const currentModelIsInList = data.some((m: AIModel) => m.id === selectedModel);
          if (!currentModelIsInList) {
            // If the current selectedModel is not valid, set it to the first model from the fetched list.
            setSelectedModel(data[0].id);
          }
        } else {
          console.warn('Fetched models data is not a valid array or is empty:', data);
          setAvailableModels([]); 
        }
      })
      .catch(error => {
        console.error('Error fetching models:', error);
        setAvailableModels([]); 
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Changed dependency array to [] for fetching once on mount.
  // The comment above disables the exhaustive-deps lint warning for this specific case,
  // as selectedModel and setSelectedModel are used in the effect but we intentionally want it to run once.
  // setSelectedModel is stable, and selectedModel is used to determine the initial default.

  const handleSend = () => {
    if (input.trim() && selectedModel) {
      if (socket && socket.connected) {
        // Send AI message via NestJS socket
        socket.emit('sendAiMessage', { 
          text: input, 
          model: selectedModel,
          roomId: 'general' // Default room
        });
      } else if (partyKitClient) { // Only use partyKitClient if it exists
        // Fallback to PartyKit backend
        partyKitClient.send(JSON.stringify({ type: 'message', text: input, model: selectedModel }));
      } else {
        console.warn('No WebSocket connection available (Socket.IO or PartyKit) to send message.');
      }
      
      setInput('');
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height to shrink if text is deleted
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline on Enter
      handleSend();
    }
  };

  return (
    <div className="flex items-center p-4 border-t border-gray-200 bg-gray-700">
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="mr-2 p-2 border border-gray-500 rounded-md bg-gray-600 text-white focus:ring-blue-500 focus:border-blue-500"
        title="Select AI Model"
        disabled={availableModels.length === 0} // Disable if no models are loaded
      >
        {availableModels.length === 0 ? (
          <option value="" disabled>Loading models...</option>
        ) : (
          availableModels.map(model => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))
        )}
      </select>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown} // Add keydown handler for Enter to send
        placeholder="Type a message... (Shift+Enter for newline)"
        className="flex-grow p-2 border border-gray-500 rounded-md resize-none overflow-hidden bg-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 max-h-[100px]"
        rows={1}
        style={{ maxHeight: '100px' }} // Set a max height for the textarea
      />
      <button
        onClick={handleSend}
        className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        disabled={!input.trim()} // Disable button if input is empty
      >
        Send
      </button>
    </div>
  );
};

export default MessageComposer;