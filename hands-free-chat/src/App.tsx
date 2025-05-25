import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './App.css';
import MessageComposer from './MessageComposer';
import ChatTreeVisualization from './ChatTreeVisualization';
import SvgIllustrationSystem from './SvgIllustrationSystem';
import robotAnimation from './assets/robot-animation.json';
import ViewportManager from './utils/ViewportManager';
import ResponsiveContainer from './components/ResponsiveContainer';
import { initializeSocket, setupSocketListeners } from './SocketIoClient';
import { Socket } from 'socket.io-client';

// Sample message type
type Message = {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isAIMessage?: boolean;
  roomId?: string;
  type?: string;
  user?: any;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false); // Renamed for clarity
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const appRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState(''); // Will be set to first available model
  const socketRef = useRef<Socket | null>(null); // Reference to hold the socket instance

  // Handle viewport size changes using ViewportManager
  useEffect(() => {
    const dimensions = ViewportManager.getViewportDimensions();
    setViewportWidth(dimensions.width);
    setViewportHeight(dimensions.height);
    
    const handleResize = (dims: { width: number, height: number }) => {
      setViewportWidth(dims.width);
      setViewportHeight(dims.height);
    };
    
    ViewportManager.onResize(handleResize);
    
    if (appRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (Math.abs(width - viewportWidth) > 5 || Math.abs(height - viewportHeight) > 5) {
            setViewportWidth(width);
            setViewportHeight(height);
          }
        }
      });
      
      resizeObserver.observe(appRef.current);
      
      return () => {
        ViewportManager.removeResizeCallback(handleResize);
        resizeObserver.disconnect();
      };
    }
    
    return () => {
      ViewportManager.removeResizeCallback(handleResize);
    };
  }, [viewportHeight, viewportWidth]);

  // Socket connection setup
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component
    let connectionAttempts = 0;
    const maxConnectionAttempts = 3;

    const connectSocket = async () => {
      if (socketRef.current && socketRef.current.connected) {
        console.log('Socket already connected.');
        return;
      }

      if (connectionAttempts >= maxConnectionAttempts) {
        console.error('Max socket connection attempts reached.');
        if (isMounted) setIsSocketConnected(false);
        return;
      }

      connectionAttempts++;
      console.log(`Attempting socket connection (${connectionAttempts}/${maxConnectionAttempts})...`);

      try {
        const newSocket = await initializeSocket(); // initializeSocket now handles token fetching
        
        newSocket.on('connect', () => {
          console.log('Socket.IO connected from App.tsx');
          // Join the default chat room after connecting
          newSocket.emit('joinRoom', { roomId: 'general' });
          if (isMounted) setIsSocketConnected(true);
          connectionAttempts = 0; // Reset attempts on successful connection
        });
    
        newSocket.on('disconnect', (reason) => {
          console.log('Socket.IO disconnected from App.tsx:', reason);
          if (isMounted) setIsSocketConnected(false);
          // Optionally, attempt to reconnect if the reason is not 'io server disconnect' or after a delay
          // However, initializeSocket already configures some reconnection behavior.
          // If the disconnection is due to auth failure, repeated calls here might loop.
        });
    
        newSocket.on('connect_error', (error) => {
          console.error('Socket.IO connection error from App.tsx:', error);
          if (isMounted) setIsSocketConnected(false);
          // If error is auth related, retrying immediately might not help
          // Consider a delay or check error type before retrying connectSocket()
          if (error.message.includes('auth') || error.message.includes('Unauthorized')) {
            console.warn('Authentication error during socket connection. Will not retry immediately.');
          } else if (connectionAttempts < maxConnectionAttempts) {
            setTimeout(connectSocket, 5000); // Retry after a delay for other errors
          }
        });

        setupSocketListeners(newSocket, setMessages);
        newSocket.connect(); // Manually connect after listeners are set up
        socketRef.current = newSocket;

      } catch (error) {
        console.error('Failed to initialize or connect socket:', error);
        if (isMounted) setIsSocketConnected(false);
        if (connectionAttempts < maxConnectionAttempts) {
           setTimeout(connectSocket, 7000); // Retry initialization after a longer delay
        }
      }
    };

    connectSocket(); // Initial attempt to connect

    return () => {
      isMounted = false;
      // Clean up Socket.IO connection
      if (socketRef.current) {
        console.log('Cleaning up socket connection in App.tsx');
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        // Listeners added by setupSocketListeners are on the socket instance,
        // disconnecting should handle them or they are specific to that instance.
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (isMounted) setIsSocketConnected(false); // Ensure state is updated on unmount
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  return (
    <motion.div 
      ref={appRef}
      className="app-container"
      style={{ 
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <header className="header-container p-3 bg-gray-800 shadow-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">AI Chat Playground</h1>
          <div className="flex items-center">
            <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-sm">{isSocketConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <ResponsiveContainer
          onViewportChange={(dims) => {
            console.log('Viewport changed:', dims);
          }}
        >
          <div className="layout-container">
            <div className="three-column-layout">
              <div className="primary-sidebar">
                <div className="p-3 p-md-4">
                  <h2 className="text-lg font-semibold mb-3">Navigation</h2>
                  <nav className="space-y-2">
                    <div className="nav-item hover:bg-gray-700 hover:bg-opacity-50 cursor-pointer">
                      <h3 className="font-medium">Chat History</h3>
                    </div>
                    <div className="nav-item hover:bg-gray-700 hover:bg-opacity-50 cursor-pointer">
                      <h3 className="font-medium">Saved Conversations</h3>
                    </div>
                  </nav>
                </div>
                
                <div className="scroll-container p-3">
                  <h2 className="text-lg font-semibold mb-3">Chat History</h2>
                  <ChatTreeVisualization messages={messages} />
                </div>
              </div>
              
              <div className="main-content-area flex flex-col">
                <div className="scroll-container bg-gray-800 rounded-lg mb-3">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4">
                      <div className="responsive-illustration">
                        <SvgIllustrationSystem 
                          animationData={robotAnimation} 
                          loop={true} 
                          autoplay={true}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                      <p className="text-gray-400 mt-4 text-sm md:text-base">No messages yet. Start a conversation!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3 p-md-4">
                      {messages.map(message => (
                        <motion.div 
                          key={message.id}
                          className={`message-box ${message.sender === 'user' ? 'user' : 'ai'}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <p className="text-sm md:text-base">{message.content}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="message-input-container bg-gray-800 rounded-lg p-3 mt-auto">
                  <MessageComposer 
                    selectedModel={selectedModel} 
                    setSelectedModel={setSelectedModel}
                    socket={socketRef.current}
                  />
                </div>
              </div>
              
              <div className="secondary-sidebar">
                <div className="p-3 p-md-4">
                  <h2 className="text-lg font-semibold mb-3">Information</h2>
                  <div className="mb-4">
                    <h3 className="text-base font-medium mb-2">Status</h3>
                    <div className="flex items-center p-2 bg-gray-700 bg-opacity-50 rounded-lg">
                      <span className={`inline-block w-3 h-3 rounded-full mr-3 ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      <span className="text-sm">{isSocketConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="scroll-container p-3">
                  <div className="mb-4">
                    <h3 className="text-base font-medium mb-2">Statistics</h3>
                    <div className="bg-gray-700 bg-opacity-50 p-2 rounded-lg text-sm">
                      <p className="flex justify-between py-1">
                        <span>Messages</span>
                        <span>{messages.length}</span>
                      </p>
                      <p className="flex justify-between py-1 border-t border-gray-600">
                        <span>User Messages</span>
                        <span>{messages.filter(m => m.sender === 'user').length}</span>
                      </p>
                      <p className="flex justify-between py-1 border-t border-gray-600">
                        <span>AI Responses</span>
                        <span>{messages.filter(m => m.sender === 'ai').length}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="viewport-info bg-gray-700 bg-opacity-30 p-2 rounded-lg text-xs">
                    <p>Viewport: {viewportWidth}px × {viewportHeight}px</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveContainer>
      </main>

      <footer className="bg-gray-800 p-2 shadow-lg mt-auto">
        <div className="text-center text-xs text-gray-400">
          AI Chat Playground &copy; 2025
        </div>
      </footer>
    </motion.div>
  );
}

export default App;
