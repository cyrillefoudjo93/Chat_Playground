import { io, Socket } from 'socket.io-client';
import React from 'react'; // Import React for types

// Use a relative URL that will work in any environment
const URL = '/chat'; // Your NestJS WebSocket server URL and namespace

// Create a socket instance that will be connected later once we have a token
export let socket: Socket;

// Define Message type (can be imported from App.tsx or a shared types file if preferred)
export type Message = {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isAIMessage?: boolean;
  roomId?: string;
  type?: string;
  user?: any;
  isPartial?: boolean; // Added to handle streaming tokens
  isFinal?: boolean; // Added to indicate final part of a streamed message
};

// Function to initialize the socket connection with a proper token
export async function initializeSocket(): Promise<Socket> {
  try {
    // Fetch the demo token from the backend
    const response = await fetch('/api/auth/demo-token');
    if (!response.ok) {
      throw new Error(`Failed to get auth token: ${response.statusText} (${response.status})`);
    }
    
    const { accessToken } = await response.json();
    console.log('Obtained authentication token for WebSocket connection');
    
    // Initialize the Socket.IO connection with the token
    socket = io(URL, {
      autoConnect: false, // We will manually connect
      transports: ['websocket'], // Prefer WebSocket transport
      auth: {
        token: accessToken,
      },
      reconnectionAttempts: 3, // Limit reconnection attempts
      reconnectionDelay: 5000, // Delay before trying to reconnect
    });
    
    return socket;
  } catch (error) {
    console.error('Error getting authentication token:', error);
    
    // Fallback to a connection without a token - will likely be rejected by the server
    // And configure it to not retry aggressively or at all, as it won't have a token.
    socket = io(URL, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false, // Disable reconnection for the no-token fallback
    });
    
    // It might be better to throw the error here so App.tsx knows initialization failed
    // and doesn't try to connect a socket that's guaranteed to fail auth.
    // For now, returning the non-reconnecting socket to see if it breaks the loop.
    return socket;
  }
}

// Function to set up event listeners on the socket
export function setupSocketListeners(socket: Socket, setMessages: React.Dispatch<React.SetStateAction<Message[]>>): void {
  // Remove existing listeners to prevent duplicates
  socket.off('connect');
  socket.off('disconnect');
  socket.off('connect_error');
  socket.off('newMessage');
  socket.off('aiToken');
  socket.off('aiComplete');
  socket.off('aiError');

  socket.on('connect', () => {
    console.log('Connected to NestJS Chat Gateway (Socket.IO)');
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from NestJS Chat Gateway (Socket.IO):', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection Error with NestJS Chat Gateway (Socket.IO):', error);
  });

  socket.on('newMessage', (data: Message) => {
    console.log('Received new message from server:', data);
    const newMessage: Message = {
      ...data,
      timestamp: new Date(data.timestamp || Date.now()), // Ensure timestamp is a Date object
      sender: data.sender || 'ai', // Default to AI if sender is not specified
    };
    setMessages((prevMessages: Message[]) => [...prevMessages, newMessage]);
  });

  socket.on('aiToken', (data: { messageId: string, token: string, sender: 'ai', timestamp?: string | number }) => {
    console.log('Received AI token:', data);
    setMessages((prevMessages: Message[]) => {
      const existingMessageIndex = prevMessages.findIndex((msg: Message) => msg.id === data.messageId && msg.sender === 'ai');
      if (existingMessageIndex !== -1) {
        const updatedMessages = [...prevMessages];
        updatedMessages[existingMessageIndex] = {
          ...updatedMessages[existingMessageIndex],
          content: updatedMessages[existingMessageIndex].content + data.token,
          timestamp: new Date(data.timestamp || updatedMessages[existingMessageIndex].timestamp),
          isPartial: true,
          isFinal: false,
        };
        return updatedMessages;
      } else {
        const newMessage: Message = {
          id: data.messageId,
          content: data.token,
          sender: 'ai',
          timestamp: new Date(data.timestamp || Date.now()),
          isAIMessage: true,
          isPartial: true,
          isFinal: false,
        };
        return [...prevMessages, newMessage];
      }
    });
  });

  socket.on('aiComplete', (data: { messageId: string, finalContent?: string, sender: 'ai', timestamp?: string | number }) => {
    console.log('Received AI completion for messageId:', data.messageId, 'finalContent:', data.finalContent);
    setMessages((prevMessages: Message[]) => {
      const existingMessageIndex = prevMessages.findIndex((msg: Message) => msg.id === data.messageId && msg.sender === 'ai');
      if (existingMessageIndex !== -1) {
        const updatedMessages = [...prevMessages];
        updatedMessages[existingMessageIndex] = {
          ...updatedMessages[existingMessageIndex],
          content: data.finalContent !== undefined ? data.finalContent : updatedMessages[existingMessageIndex].content,
          timestamp: new Date(data.timestamp || updatedMessages[existingMessageIndex].timestamp),
          isPartial: false,
          isFinal: true,
        };
        return updatedMessages;
      } else if (data.finalContent !== undefined) {
        const newMessage: Message = {
          id: data.messageId,
          content: data.finalContent,
          sender: 'ai',
          timestamp: new Date(data.timestamp || Date.now()),
          isAIMessage: true,
          isPartial: false,
          isFinal: true,
        };
        return [...prevMessages, newMessage];
      }
      return prevMessages;
    });
  });

  socket.on('aiError', (data: { messageId?: string, error: string, sender: 'ai' }) => {
    console.error('Received AI error:', data);
    // Optionally, display this error in the chat UI
    const errorMessage: Message = {
      id: data.messageId || `error-${Date.now()}`,
      content: `AI Error: ${data.error}`,
      sender: 'ai',
      timestamp: new Date(),
      isAIMessage: true,
      type: 'error', // Custom type for styling
    };
    setMessages((prevMessages: Message[]) => [...prevMessages, errorMessage]);
  });
}
