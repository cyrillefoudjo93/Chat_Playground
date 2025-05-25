import PartySocket from "partysocket";
import { ErrorEvent } from "partysocket/ws";

interface PartyKitClient {
  send: (message: string) => void;
  close: () => void;
  onmessage?: ((event: MessageEvent) => void) | null;
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
}

// Only initialize PartySocket if we're in development and need it
let socket: PartyKitClient;

try {
  const partySocket = new PartySocket({
    host: "localhost:1999", // Replace with your PartyKit host
    room: "my-chat-room", // Replace with your desired room name
  });

  // Wrap the PartySocket instance to match our interface
  socket = {
    send: (message: string) => partySocket.send(message),
    close: () => partySocket.close(),
    get onmessage() { return partySocket.onmessage || null; },
    set onmessage(handler) {
      partySocket.onmessage = handler || null;
    },
    get onopen() { 
      return partySocket.onopen ? () => partySocket.onopen!(new Event('open')) : null;
    },
    set onopen(handler) {
      partySocket.onopen = handler ? () => handler() : null;
    },
    get onclose() {
      return partySocket.onclose ? () => partySocket.onclose!(new CloseEvent('close')) : null;
    },
    set onclose(handler) {
      partySocket.onclose = handler ? () => handler() : null;
    },
    get onerror() {
      return partySocket.onerror || null;
    },
    set onerror(handler) {
      partySocket.onerror = handler || null;
    }
  };
} catch (error) {
  console.log("PartySocket initialization skipped or failed. This is normal if PartyKit is not needed.");
  // Create a dummy socket object if PartyKit is not available
  socket = {
    send: () => console.log("PartyKit not available, message not sent"),
    close: () => console.log("PartyKit not available, cannot close connection"),
    onmessage: null,
    onopen: null,
    onclose: null,
    onerror: null
  };
}

export default socket;