import PartySocket from "partysocket";

const partySocket = new PartySocket({
  host: "localhost:1999", // Replace with your PartyKit host
  room: "my-chat-room", // Replace with your desired room name
});

partySocket.onmessage = (event: MessageEvent) => {
  console.log("Received message:", event.data);
  // Handle incoming messages here
};

partySocket.onopen = () => {
  console.log("Connected to PartyKit");
};

partySocket.onclose = () => {
  console.log("Disconnected from PartyKit");
};

partySocket.onerror = (event: Event) => {
  console.error("PartyKit error occurred", event);
};

export default partySocket;