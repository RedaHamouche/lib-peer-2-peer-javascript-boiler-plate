import process from "node:process";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { multiaddr } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
import { gossipsub } from "@libp2p/gossipsub";
import { identify } from "@libp2p/identify";
import readline from "node:readline";

const main = async () => {
  const node = await createLibp2p({
    addresses: {
      // add a listen address (localhost) to accept TCP connections on a random port
      listen: ["/ip4/127.0.0.1/tcp/0"],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      ping: ping({
        protocolPrefix: "ipfs", // default
      }),
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: true,
      }),
    },
  });

  // start libp2p
  await node.start();
  console.log("libp2p has started");

  // print out listening addresses
  console.log("listening on addresses:");
  node.getMultiaddrs().forEach((addr) => {
    console.log(addr.toString());
  });

  // Print our own peer ID for clarity
  console.log(`📋 My peer ID: ${node.peerId.toString()}`);

  // Add event listeners to see when connections happen
  node.addEventListener("peer:connect", (evt) => {
    console.log(
      `🔗 Someone connected to me! Their peer ID: ${evt.detail.toString()}`
    );
  });

  node.addEventListener("peer:disconnect", (evt) => {
    console.log(
      `❌ Someone disconnected from me! Their peer ID: ${evt.detail.toString()}`
    );
  });

  // Chat topic
  const CHAT_TOPIC = "libp2p-chat";

  // Subscribe to chat messages
  await node.services.pubsub.subscribe(CHAT_TOPIC);
  console.log(`📢 Subscribed to chat topic: ${CHAT_TOPIC}`);

  // Handle incoming messages
  node.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic === CHAT_TOPIC) {
      const message = JSON.parse(new TextDecoder().decode(evt.detail.data));
      const senderId = evt.detail.from.toString();
      const isFromMe = senderId === node.peerId.toString();

      if (!isFromMe) {
        console.log(`💬 [${senderId.slice(-8)}]: ${message.text}`);
      }
    }
  });

  // Function to send a message
  const sendMessage = (text) => {
    const message = {
      text: text,
      timestamp: Date.now(),
      sender: node.peerId.toString(),
    };

    const data = new TextEncoder().encode(JSON.stringify(message));
    node.services.pubsub.publish(CHAT_TOPIC, data);
    console.log(`💬 [You]: ${text}`);
  };

  // Setup readline for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle user input
  rl.on("line", (input) => {
    const message = input.trim();
    if (message) {
      sendMessage(message);
    }
  });

  console.log(
    "\n💬 Chat started! Type your messages and press Enter to send them."
  );
  console.log("💡 Connect to another peer to start chatting!");

  // ping peer if received multiaddr
  if (process.argv.length >= 3) {
    const ma = multiaddr(process.argv[2]);
    console.log(`pinging remote peer at ${process.argv[2]}`);
    const latency = await node.services.ping.ping(ma);
    console.log(`pinged ${process.argv[2]} in ${latency}ms`);
    console.log("💡 Now you can chat with the connected peer!");
  } else {
    console.log("no remote peer address given, skipping ping");
    console.log(
      "💡 Start another instance with this node's address to connect and chat!"
    );
  }

  const stop = async () => {
    // stop libp2p
    await node.stop();
    console.log("libp2p has stopped");
    process.exit(0);
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
};

main().then().catch(console.error);
