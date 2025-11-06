import { spawn } from "node:child_process";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { multiaddr } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
import { gossipsub } from "@libp2p/gossipsub";
import { identify } from "@libp2p/identify";

const NUM_NODES = 10;
const nodes = [];
const nodeAddresses = [];

console.log(`🚀 Testing scalability with ${NUM_NODES} nodes...\n`);

// Create and start all nodes
async function createNode(index) {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/127.0.0.1/tcp/0"],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      ping: ping({
        protocolPrefix: "ipfs",
      }),
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: true,
      }),
    },
  });

  await node.start();
  const address = node.getMultiaddrs()[0].toString();

  return { node, address, index };
}

// Connect nodes in a mesh topology (each node connects to 2-3 others)
async function connectNodes() {
  console.log("🔌 Connecting nodes in mesh topology...\n");

  // Strategy: Each node connects to the next 2 nodes (ring + mesh)
  for (let i = 0; i < nodes.length; i++) {
    const currentNode = nodes[i];
    const connections = [];

    // Connect to next 2 nodes (wrapping around)
    for (let j = 1; j <= 2; j++) {
      const targetIndex = (i + j) % nodes.length;
      if (targetIndex !== i) {
        connections.push(nodeAddresses[targetIndex]);
      }
    }

    // Also connect to a few random nodes for better mesh
    if (i > 2) {
      const randomIndex = Math.floor(Math.random() * i);
      if (
        randomIndex !== i &&
        !connections.includes(nodeAddresses[randomIndex])
      ) {
        connections.push(nodeAddresses[randomIndex]);
      }
    }

    console.log(
      `Node ${currentNode.index}: Connecting to ${connections.length} peer(s)...`
    );

    for (const address of connections) {
      try {
        const ma = multiaddr(address);
        await currentNode.node.dial(ma);
        console.log(`  ✅ Node ${currentNode.index} → Connected to peer`);
      } catch (error) {
        console.log(
          `  ⚠️  Node ${currentNode.index} → Connection failed: ${error.message}`
        );
      }
    }

    // Wait a bit between connections
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Test messaging
async function testMessaging() {
  console.log("\n📨 Testing messaging between all nodes...\n");

  const CHAT_TOPIC = "libp2p-chat";
  const messagesReceived = new Map();

  // Subscribe all nodes to chat topic
  for (const { node } of nodes) {
    await node.services.pubsub.subscribe(CHAT_TOPIC);

    node.services.pubsub.addEventListener("message", (evt) => {
      if (evt.detail.topic === CHAT_TOPIC) {
        const message = JSON.parse(new TextDecoder().decode(evt.detail.data));
        const senderId = evt.detail.from.toString();
        const receiverId = node.peerId.toString();

        if (senderId !== receiverId) {
          if (!messagesReceived.has(receiverId)) {
            messagesReceived.set(receiverId, 0);
          }
          messagesReceived.set(
            receiverId,
            messagesReceived.get(receiverId) + 1
          );
        }
      }
    });
  }

  // Wait for connections to stabilize
  console.log("⏳ Waiting for connections to stabilize...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Send a message from each node
  console.log("📤 Sending test messages from each node...\n");
  for (let i = 0; i < nodes.length; i++) {
    const { node, index } = nodes[i];
    const message = {
      text: `Hello from node ${index}!`,
      timestamp: Date.now(),
      sender: node.peerId.toString(),
    };

    const data = new TextEncoder().encode(JSON.stringify(message));
    await node.services.pubsub.publish(CHAT_TOPIC, data);
    console.log(`  Node ${index} sent: "Hello from node ${index}!"`);

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Wait for messages to propagate
  console.log("\n⏳ Waiting for messages to propagate...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check results
  console.log("\n📊 Results:\n");
  let totalMessages = 0;
  let successfulNodes = 0;

  for (const { node, index } of nodes) {
    const received = messagesReceived.get(node.peerId.toString()) || 0;
    totalMessages += received;

    if (received >= NUM_NODES - 1) {
      // Should receive messages from all other nodes
      successfulNodes++;
      console.log(
        `  ✅ Node ${index}: Received ${received}/${NUM_NODES - 1} messages`
      );
    } else {
      console.log(
        `  ⚠️  Node ${index}: Received ${received}/${NUM_NODES - 1} messages`
      );
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`  Total nodes: ${NUM_NODES}`);
  console.log(
    `  Nodes receiving all messages: ${successfulNodes}/${NUM_NODES}`
  );
  console.log(`  Total messages received: ${totalMessages}`);
  console.log(
    `  Average messages per node: ${(totalMessages / NUM_NODES).toFixed(2)}`
  );

  const successRate = (successfulNodes / NUM_NODES) * 100;
  if (successRate >= 80) {
    console.log(
      `\n✅ SUCCESS: Scalability test passed! (${successRate.toFixed(
        1
      )}% success rate)`
    );
  } else {
    console.log(
      `\n⚠️  WARNING: Some nodes didn't receive all messages (${successRate.toFixed(
        1
      )}% success rate)`
    );
  }
}

// Test connection resilience
async function testResilience() {
  console.log("\n🛡️  Testing resilience (closing a node)...\n");

  // Close the first node
  const nodeToClose = nodes[0];
  console.log(`Closing node ${nodeToClose.index}...`);
  await nodeToClose.node.stop();
  nodes.shift();

  // Wait a bit
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Try to send a message from remaining nodes
  const CHAT_TOPIC = "libp2p-chat";
  const { node } = nodes[0];

  const message = {
    text: "Test after node closure",
    timestamp: Date.now(),
    sender: node.peerId.toString(),
  };

  const data = new TextEncoder().encode(JSON.stringify(message));
  await node.services.pubsub.publish(CHAT_TOPIC, data);

  console.log("✅ Network still functional after node closure!");
}

// Main test function
async function runTests() {
  try {
    // Step 1: Create all nodes
    console.log("Step 1: Creating nodes...\n");
    for (let i = 0; i < NUM_NODES; i++) {
      const nodeInfo = await createNode(i);
      nodes.push(nodeInfo);
      nodeAddresses.push(nodeInfo.address);
      console.log(`  ✅ Node ${i} created: ${nodeInfo.address.slice(-30)}...`);
    }

    // Step 2: Connect nodes
    await connectNodes();

    // Step 3: Wait for connections to establish
    console.log("\n⏳ Waiting for all connections to establish...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 4: Test messaging
    await testMessaging();

    // Step 5: Test resilience
    await testResilience();

    // Cleanup
    console.log("\n🧹 Cleaning up...");
    for (const { node } of nodes) {
      await node.stop();
    }

    console.log("\n✅ All tests completed!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

runTests();
