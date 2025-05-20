import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './App.css';
import MessageComposer from './MessageComposer';
import ChatTreeVisualization from './ChatTreeVisualization';
import SvgIllustrationSystem from './SvgIllustrationSystem';
import partySocket from './PartyKitClient';
import robotAnimation from './assets/robot-animation.json';
import ViewportManager from './utils/ViewportManager';
import ResponsiveContainer from './components/ResponsiveContainer';
import { socket as chatSocket } from './SocketIoClient'; // For NestJS Chat Server

// Sample message type
type Message = {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const appRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState('openai'); // Default to OpenAI
  const partyKitClient = useRef(partySocket); // Use a ref for partySocket

  // Handle viewport size changes using ViewportManager
  useEffect(() => {
    // Get initial dimensions
    const dimensions = ViewportManager.getViewportDimensions();
    setViewportWidth(dimensions.width);
    setViewportHeight(dimensions.height);
    
    // Register for viewport changes
    const handleResize = (dims: { width: number, height: number }) => {
      setViewportWidth(dims.width);
      setViewportHeight(dims.height);
    };
    
    ViewportManager.onResize(handleResize);
    
    // Create ResizeObserver for app container element sizing
    if (appRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          // Check for significant changes to avoid unnecessary rerenders
          if (Math.abs(width - viewportWidth) > 5 || Math.abs(height - viewportHeight) > 5) {
            setViewportWidth(width);
            setViewportHeight(height);
          }
        }
      });
      
      resizeObserver.observe(appRef.current);
      
      // Clean up
      return () => {
        ViewportManager.removeResizeCallback(handleResize);
        resizeObserver.disconnect();
      };
    }
    
    return () => {
      ViewportManager.removeResizeCallback(handleResize);
    };
  }, [viewportHeight, viewportWidth]); // Added dependencies

  // PartyKit connection setup
  useEffect(() => {
    // Setup PartyKit connection status
    const handleOpen = () => {
      setIsConnected(true);
      console.log('Connected to collaboration server');
    };

    const handleClose = () => {
      setIsConnected(false);
      console.log('Disconnected from collaboration server');
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message') {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            content: data.content,
            sender: 'ai',
            timestamp: new Date()
          }]);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    partySocket.addEventListener('open', handleOpen);
    partySocket.addEventListener('close', handleClose);
    partySocket.addEventListener('message', handleMessage);

    // Connect to NestJS Chat Gateway
    chatSocket.connect();

    // Example: Listen for 'newMessage' from NestJS Chat Gateway
    chatSocket.on('newMessage', (data) => {
      console.log('Received message from NestJS Chat Gateway:', data);
      // You might want to add this message to your messages state
      // Ensure the message format is compatible or adapt it
      setMessages(prev => [...prev, {
        id: data.id || crypto.randomUUID(), // Ensure ID exists
        content: data.text || data.content, // Adapt based on server message structure
        sender: data.user?.username || 'server', // Adapt sender info
        timestamp: new Date(data.timestamp || Date.now()), // Ensure valid timestamp
        isAIMessage: data.isAIMessage || false, // Example: if you distinguish AI messages
        roomId: data.roomId,
        type: data.type,
        user: data.user,
      } as Message]);
    });

    // Example: Listen for AI responses from NestJS Chat Gateway
    chatSocket.on('aiToken', (data) => {
      console.log('AI Token from NestJS:', data.token);
      // Handle streaming AI tokens, e.g., append to the last message if it's an AI response
    });

    chatSocket.on('aiComplete', (data) => {
      console.log('AI Completion from NestJS:', data.response);
      // Finalize AI response
    });

    chatSocket.on('aiError', (data) => {
      console.error('AI Error from NestJS:', data.error);
    });

    return () => {
      partySocket.removeEventListener('open', handleOpen);
      partySocket.removeEventListener('close', handleClose);
      partySocket.removeEventListener('message', handleMessage);

      // Disconnect from NestJS Chat Gateway
      chatSocket.disconnect();
      // Remove specific listeners to prevent memory leaks
      chatSocket.off('newMessage');
      chatSocket.off('aiToken');
      chatSocket.off('aiComplete');
      chatSocket.off('aiError');
    };
  }, []);

  // const sendMessage = (content: string) => { // This function is no longer needed as MessageComposer handles sending
  //   const newMessage: Message = {
  //     id: crypto.randomUUID(),
  //     content,
  //     sender: 'user',
  //     timestamp: new Date()
  //   };
    
  //   setMessages(prev => [...prev, newMessage]);
    
  //   partyKitClient.current.send(JSON.stringify({
  //     type: 'message',
  //     content,
  //     model: selectedModel 
  //   }));

  //   chatSocket.emit('sendMessage', {
  //     roomId: 'general', 
  //     text: content,
  //     type: 'text',
  //     model: selectedModel 
  //   });
  // };

  // Function to request AI completion from NestJS Chat Server
  // const requestAICompletion = (prompt: string) => { // This function is unused, commenting out
  //   console.log('Requesting AI completion for:', prompt);
  //   chatSocket.emit('requestAICompletion', {
  //     prompt: prompt,
  //     model: selectedModel // Include selected model
  //     // providerId: 'openai', // Optional: specify provider
  //     // model: 'gpt-3.5-turbo', // Optional: specify model
  //   });
  // };

  // Using CSS for responsive illustration sizing

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
            <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <ResponsiveContainer
          onViewportChange={(dims) => {
            console.log('Viewport changed:', dims);
            // You could trigger layout adjustments here based on dimensions
          }}
        >
          <div className="layout-container">
            <div className="three-column-layout">
            {/* Primary Sidebar */}
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
            
            {/* Main Content Area */}
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
                  partyKitClient={partyKitClient.current} // Pass the actual client
                  selectedModel={selectedModel} 
                  setSelectedModel={setSelectedModel} 
                  // onSendMessage is removed as MessageComposer now handles sending directly
                />
              </div>
            </div>
            
            {/* Secondary Sidebar */}
            <div className="secondary-sidebar">
              <div className="p-3 p-md-4">
                <h2 className="text-lg font-semibold mb-3">Information</h2>
                <div className="mb-4">
                  <h3 className="text-base font-medium mb-2">Status</h3>
                  <div className="flex items-center p-2 bg-gray-700 bg-opacity-50 rounded-lg">
                    <span className={`inline-block w-3 h-3 rounded-full mr-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
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

export default App
