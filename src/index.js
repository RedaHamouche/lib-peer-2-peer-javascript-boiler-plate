import process from "node:process";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { multiaddr } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
import { gossipsub } from "@libp2p/gossipsub";
import { identify } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import readline from "node:readline";
import { dbOperations } from "./db.js";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const main = async () => {
  // In Docker, listen on 0.0.0.0 with fixed port based on node name
  // In local development, use 127.0.0.1 with random port
  let listenAddress;
  if (process.env.DOCKER === "true") {
    const nodeName = process.env.NODE_NAME || "node1";
    const portMap = { node1: 9001, node2: 9002, node3: 9003 };
    const port = portMap[nodeName] || 9000;
    listenAddress = `/ip4/0.0.0.0/tcp/${port}`;
  } else {
    listenAddress = "/ip4/127.0.0.1/tcp/0";
  }

  const node = await createLibp2p({
    addresses: {
      listen: [listenAddress],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      ping: ping({
        protocolPrefix: "ipfs", // default
      }),
      identify: identify(),
      dht: kadDHT({
        protocolPrefix: "/ipfs",
        clientMode: false, // Act as both client and server
      }),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: true,
        // Optimize for larger networks
        D: 6, // target peers per topic
        Dlo: 4, // minimum peers per topic
        Dhi: 12, // maximum peers per topic
        Dscore: 4, // score threshold for pruning
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
  console.log(`💾 Database: ${process.env.DB_PATH || "default path"}`);

  // Share our address via shared file (for Docker)
  const shareAddress = async () => {
    if (process.env.DOCKER === "true" && process.env.NODE_NAME === "node1") {
      try {
        const sharedDir = "/app/shared";
        const addressFile = `${sharedDir}/node1-address.json`;

        // Ensure directory exists
        await mkdir(sharedDir, { recursive: true });

        // Get our addresses with hostname
        const addresses = node.getMultiaddrs().map((addr) => {
          const addrStr = addr.toString();
          // Replace IP with hostname for Docker
          const hostnameAddr = addrStr.replace(
            /\/ip4\/[^\/]+/,
            `/dns4/libp2p-node1`
          );
          return { original: addrStr, docker: hostnameAddr };
        });

        const addressInfo = {
          peerId: node.peerId.toString(),
          addresses: addresses.map((a) => a.docker),
          timestamp: Date.now(),
        };

        await writeFile(addressFile, JSON.stringify(addressInfo, null, 2));
        console.log(`📝 Shared address in ${addressFile}`);
      } catch (error) {
        // File sharing failed, that's okay
      }
    }
  };

  // Read bootstrap node address from shared file
  const readBootstrapAddress = async () => {
    if (process.env.DOCKER === "true" && process.env.BOOTSTRAP_NODE) {
      try {
        const addressFile = "/app/shared/node1-address.json";
        const data = await readFile(addressFile, "utf-8");
        const addressInfo = JSON.parse(data);

        console.log(`📖 Read bootstrap address from shared file`);
        return addressInfo;
      } catch (error) {
        // File not found yet, that's okay
        return null;
      }
    }
    return null;
  };

  // Share address after startup
  setTimeout(() => {
    shareAddress().catch(() => {});
  }, 1000);

  // Update shared address periodically
  setInterval(() => {
    shareAddress().catch(() => {});
  }, 5000);

  // Function to get container IP address (for Docker)
  const getContainerIP = async () => {
    if (process.env.DOCKER === "true") {
      try {
        // Try to get IP from hostname
        const dns = await import("node:dns/promises");
        const hostname = process.env.NODE_NAME || "localhost";
        const records = await dns.lookup(hostname, { family: 4 });
        return records.address;
      } catch (error) {
        // Fallback: try to get from network interface
        try {
          const os = await import("node:os");
          const interfaces = os.networkInterfaces();
          for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
              if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
              }
            }
          }
        } catch (error) {
          // If all else fails, return 0.0.0.0
          return "0.0.0.0";
        }
      }
    }
    return "127.0.0.1";
  };

  // Connect to bootstrap node if specified (for Docker)
  const connectToBootstrap = async () => {
    const bootstrapNode = process.env.BOOTSTRAP_NODE;
    if (bootstrapNode && process.env.DOCKER === "true") {
      console.log(
        `🔌 Attempting to connect to bootstrap node: ${bootstrapNode}`
      );

      // Wait a bit for bootstrap node to be ready
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Try to read bootstrap address from shared file first
      const bootstrapAddress = await readBootstrapAddress();
      if (
        bootstrapAddress &&
        bootstrapAddress.addresses &&
        bootstrapAddress.addresses.length > 0
      ) {
        console.log(`  📖 Found bootstrap address in shared file`);

        // Try to connect to each address
        for (const addrStr of bootstrapAddress.addresses) {
          try {
            const ma = multiaddr(addrStr);
            await node.dial(ma);
            console.log(`  ✅ Connected to bootstrap node via ${addrStr}`);

            // Store the address
            peerAddresses.set(
              bootstrapAddress.peerId,
              bootstrapAddress.addresses
            );
            dbOperations.savePeer(
              bootstrapAddress.peerId,
              bootstrapAddress.addresses
            );

            return; // Successfully connected
          } catch (dialError) {
            console.log(
              `  ⚠️  Failed to connect via ${addrStr}: ${dialError.message}`
            );
            continue;
          }
        }
      }

      try {
        // Try to resolve bootstrap node hostname to IP
        const dns = await import("node:dns/promises");
        const bootstrapIP = await dns.lookup(bootstrapNode, { family: 4 });
        console.log(
          `✅ Resolved bootstrap node ${bootstrapNode} to ${bootstrapIP.address}`
        );

        // Try to find bootstrap node in DHT first
        try {
          const records = [];
          for await (const record of node.services.dht.get(DHT_KEY)) {
            if (record && record.value) {
              try {
                const peerInfo = JSON.parse(
                  new TextDecoder().decode(record.value)
                );
                // Look for addresses with the bootstrap hostname
                if (
                  peerInfo.addresses &&
                  peerInfo.addresses.some((addr) =>
                    addr.includes(bootstrapNode)
                  )
                ) {
                  records.push(peerInfo);
                }
              } catch (error) {
                // Skip invalid records
              }
            }
          }

          // Try to connect to discovered addresses
          for (const peerInfo of records) {
            if (peerInfo.addresses && peerInfo.addresses.length > 0) {
              // Prefer addresses with hostname
              const hostnameAddresses = peerInfo.addresses.filter((addr) =>
                addr.includes(bootstrapNode)
              );
              const addressesToTry =
                hostnameAddresses.length > 0
                  ? hostnameAddresses
                  : peerInfo.addresses;

              for (const addrStr of addressesToTry) {
                try {
                  const ma = multiaddr(addrStr);
                  await node.dial(ma);
                  console.log(
                    `  ✅ Connected to bootstrap node via ${addrStr}`
                  );
                  return; // Successfully connected
                } catch (dialError) {
                  // Try next address
                  continue;
                }
              }
            }
          }
        } catch (dhtError) {
          console.log(`⚠️  DHT discovery failed: ${dhtError.message}`);
        }

        // If DHT didn't work, try direct connection with fixed port
        console.log(`💡 Trying direct connection to bootstrap node...`);

        // Try direct connection with known port (9001 for node1)
        try {
          const directAddr = `/dns4/${bootstrapNode}/tcp/9001/p2p/${node.peerId.toString()}`;
          // Actually, we need to discover the peer ID first
          // For now, try without peer ID
          const directAddrSimple = `/dns4/${bootstrapNode}/tcp/9001`;
          try {
            const ma = multiaddr(directAddrSimple);
            await node.dial(ma);
            console.log(`  ✅ Connected directly to bootstrap node`);
            return;
          } catch (directError) {
            console.log(
              `  ⚠️  Direct connection failed, will rely on GossipSub discovery`
            );
          }
        } catch (error) {
          // Direct connection failed
        }
      } catch (error) {
        console.log(`⚠️  Could not resolve bootstrap node: ${error.message}`);
        console.log(`💡 Will rely on DHT and GossipSub discovery instead`);
      }
    }
  };

  // Connect to bootstrap if configured
  if (process.env.BOOTSTRAP_NODE) {
    setTimeout(() => {
      connectToBootstrap().catch(() => {});
    }, 2000);
  }

  // Track connected peers
  const connectedPeers = new Set();

  // Load known peers from database
  const loadPeersFromDB = async () => {
    try {
      const knownPeers = dbOperations.getAllPeers();
      console.log(`📚 Loaded ${knownPeers.length} peer(s) from database`);

      for (const peer of knownPeers) {
        // Try to connect to known peers
        for (const addrStr of peer.addresses) {
          try {
            const ma = multiaddr(addrStr);
            await node.dial(ma);
            console.log(
              `  ✅ Reconnected to known peer: ${peer.peerId.slice(-8)}`
            );
            peerAddresses.set(peer.peerId, peer.addresses);
            break;
          } catch (error) {
            // Connection failed, try next address
            continue;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️  Error loading peers from DB: ${error.message}`);
    }
  };

  // Load peers on startup
  setTimeout(() => {
    loadPeersFromDB().catch(() => {});
  }, 1000);

  // DHT key for our chat network
  const DHT_KEY = "/libp2p-chat-network/peers";

  // Chat topic (defined early so we can use it in mesh discovery)
  const CHAT_TOPIC = "libp2p-chat";
  const PEER_DISCOVERY_TOPIC = "libp2p-peer-discovery";

  // Subscribe to peer discovery topic
  await node.services.pubsub.subscribe(PEER_DISCOVERY_TOPIC);

  // Store peer addresses for broadcasting (peerId -> multiaddr[])
  const peerAddresses = new Map();

  // Function to announce ourselves in the DHT
  const announceToDHT = async () => {
    try {
      let ourAddresses = node.getMultiaddrs().map((addr) => addr.toString());

      // In Docker, also add addresses with hostname for other containers to connect
      if (process.env.DOCKER === "true" && process.env.NODE_NAME) {
        const hostname = process.env.NODE_NAME;
        const ourAddressesWithHostname = node.getMultiaddrs().map((addr) => {
          // Replace 0.0.0.0 or 127.0.0.1 with hostname for Docker networking
          const addrStr = addr.toString();
          // Extract port from address
          const portMatch = addrStr.match(/\/tcp\/(\d+)/);
          if (portMatch) {
            const port = portMatch[1];
            // Create address with hostname
            return `/dns4/${hostname}/tcp/${port}/p2p/${node.peerId.toString()}`;
          }
          return addrStr;
        });
        ourAddresses = [...ourAddresses, ...ourAddressesWithHostname];
      }

      const peerInfo = {
        peerId: node.peerId.toString(),
        addresses: ourAddresses,
        timestamp: Date.now(),
      };

      const data = new TextEncoder().encode(JSON.stringify(peerInfo));

      // Store our info in DHT
      await node.services.dht.put(DHT_KEY, data, {
        key: node.peerId,
      });

      console.log(
        `📢 Announced to DHT network (${ourAddresses.length} address(es))`
      );
    } catch (error) {
      // DHT might not be ready yet, that's okay
    }
  };

  // Function to discover peers via DHT
  const discoverPeersViaDHT = async () => {
    try {
      console.log("🔍 Discovering peers via DHT...");

      // Find peers in DHT
      const records = [];

      try {
        for await (const record of node.services.dht.get(DHT_KEY)) {
          if (record && record.value) {
            try {
              const peerInfo = JSON.parse(
                new TextDecoder().decode(record.value)
              );
              if (peerInfo.peerId !== node.peerId.toString()) {
                records.push(peerInfo);
              }
            } catch (error) {
              // Invalid record, skip
            }
          }
        }
      } catch (error) {
        // No records found or DHT error, that's okay
      }

      // Note: DHT findPeer is for finding a specific peer, not discovering all peers
      // We'll rely on the records we stored in the DHT

      // Connect to discovered peers
      for (const peerInfo of records) {
        if (
          peerInfo.peerId !== node.peerId.toString() &&
          !connectedPeers.has(peerInfo.peerId) &&
          peerInfo.addresses &&
          peerInfo.addresses.length > 0
        ) {
          for (const addrStr of peerInfo.addresses) {
            try {
              const ma = multiaddr(addrStr);
              await node.dial(ma);
              console.log(
                `  ✅ Connected to DHT-discovered peer: ${peerInfo.peerId.slice(
                  -8
                )}`
              );
              peerAddresses.set(peerInfo.peerId, peerInfo.addresses);
              break;
            } catch (error) {
              // Connection failed, try next address
              continue;
            }
          }
        }
      }

      // Connect to peers found via DHT routing
      for (const peer of foundPeers) {
        if (
          peer.id.toString() !== node.peerId.toString() &&
          !connectedPeers.has(peer.id.toString())
        ) {
          try {
            const peerData = await node.peerStore.get(peer.id);
            if (
              peerData &&
              peerData.addresses &&
              peerData.addresses.length > 0
            ) {
              for (const addr of peerData.addresses) {
                try {
                  await node.dial(addr);
                  console.log(
                    `  ✅ Connected to DHT-routed peer: ${peer.id
                      .toString()
                      .slice(-8)}`
                  );
                  break;
                } catch (error) {
                  continue;
                }
              }
            }
          } catch (error) {
            // Can't connect
          }
        }
      }
    } catch (error) {
      // DHT discovery failed, that's okay
    }
  };

  // Function to broadcast our connected peers with their addresses
  const broadcastConnectedPeers = async () => {
    // Always include our own address
    const ourAddresses = node.getMultiaddrs().map((addr) => addr.toString());
    const peersWithAddresses = [
      {
        peerId: node.peerId.toString(),
        addresses: ourAddresses,
      },
    ];

    // Add connected peers with their addresses
    for (const peerIdStr of connectedPeers) {
      try {
        // Try to get addresses from peer store
        let addresses = peerAddresses.get(peerIdStr);

        if (!addresses || addresses.length === 0) {
          // Get from peer store
          try {
            for await (const peer of node.peerStore.getAll()) {
              if (peer.id.toString() === peerIdStr) {
                if (peer.addresses && peer.addresses.length > 0) {
                  addresses = peer.addresses.map((addr) => addr.toString());
                  peerAddresses.set(peerIdStr, addresses);
                  break;
                }
              }
            }
          } catch (error) {
            // Can't get addresses
          }
        }

        if (addresses && addresses.length > 0) {
          peersWithAddresses.push({
            peerId: peerIdStr,
            addresses: addresses,
          });
        }
      } catch (error) {
        // Skip this peer
      }
    }

    if (peersWithAddresses.length > 0) {
      const message = {
        type: "peer-list",
        peers: peersWithAddresses,
        sender: node.peerId.toString(),
        timestamp: Date.now(),
      };

      const data = new TextEncoder().encode(JSON.stringify(message));
      node.services.pubsub.publish(PEER_DISCOVERY_TOPIC, data);
    }
  };

  // Handle peer discovery messages
  const handlePeerDiscovery = async (evt) => {
    if (evt.detail.topic === PEER_DISCOVERY_TOPIC) {
      try {
        const message = JSON.parse(new TextDecoder().decode(evt.detail.data));

        if (message.type === "peer-list" && message.peers) {
          const senderId = evt.detail.from.toString();
          if (senderId === node.peerId.toString()) return;

          // Try to connect to peers from this list that we're not connected to
          for (const peerInfo of message.peers) {
            // Support both old format (just peerId string) and new format (object with addresses)
            const peerIdStr = peerInfo.peerId || peerInfo;

            if (
              peerIdStr === node.peerId.toString() ||
              connectedPeers.has(peerIdStr)
            ) {
              continue;
            }

            // Use addresses directly if provided, otherwise try peer store
            let addressesToTry = [];

            if (peerInfo.addresses && Array.isArray(peerInfo.addresses)) {
              // New format: addresses are provided directly
              addressesToTry = peerInfo.addresses;
            } else {
              // Old format or no addresses: try peer store
              try {
                for await (const peer of node.peerStore.getAll()) {
                  if (peer.id.toString() === peerIdStr) {
                    if (peer.addresses && peer.addresses.length > 0) {
                      addressesToTry = peer.addresses.map((addr) =>
                        addr.toString()
                      );
                      break;
                    }
                  }
                }
              } catch (error) {
                // Can't get from peer store
              }
            }

            // Try to connect using provided addresses
            if (addressesToTry.length > 0) {
              for (const addrStr of addressesToTry) {
                try {
                  const ma = multiaddr(addrStr);
                  await node.dial(ma);
                  console.log(
                    `  ✅ Auto-connected to discovered peer: ${peerIdStr.slice(
                      -8
                    )}`
                  );

                  // Store the address for future use
                  if (!peerAddresses.has(peerIdStr)) {
                    peerAddresses.set(peerIdStr, addressesToTry);
                  }

                  break; // Successfully connected
                } catch (dialError) {
                  // Continue to next address
                  continue;
                }
              }
            }
          }
        }
      } catch (error) {
        // Invalid message, ignore
      }
    }
  };

  // Function to discover and connect to peers
  const discoverAndConnectPeers = async () => {
    try {
      // Wait a bit for connections to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Broadcast our connected peers
      broadcastConnectedPeers();

      // Also try to get peers from mesh
      const meshPeers = node.services.pubsub.getMeshPeers(CHAT_TOPIC);

      if (meshPeers && meshPeers.length > 0) {
        console.log(
          `  🔍 Checking ${meshPeers.length} peer(s) in GossipSub mesh`
        );

        for (const peerId of meshPeers) {
          const peerIdStr = peerId.toString();

          if (
            peerIdStr === node.peerId.toString() ||
            connectedPeers.has(peerIdStr)
          ) {
            continue;
          }

          try {
            const peer = await node.peerStore.get(peerId);

            if (peer && peer.addresses && peer.addresses.length > 0) {
              for (const addr of peer.addresses) {
                try {
                  await node.dial(addr);
                  console.log(
                    `  ✅ Connected to mesh peer: ${peerIdStr.slice(-8)}`
                  );
                  break;
                } catch (dialError) {
                  continue;
                }
              }
            }
          } catch (error) {
            // Peer not available
          }
        }
      }
    } catch (error) {
      // Discovery failed
    }
  };

  // Add event listeners to see when connections happen
  node.addEventListener("peer:connect", async (evt) => {
    const peerId = evt.detail.toString();
    connectedPeers.add(peerId);
    console.log(
      `🔗 Peer connected! ID: ${peerId.slice(-8)} (Total: ${
        connectedPeers.size
      } peer(s))`
    );

    // Save peer to database
    try {
      let addresses = peerAddresses.get(peerId) || [];

      if (addresses.length === 0) {
        // Try to get from peer store directly
        try {
          const peerIdObj = evt.detail; // Use the peerId from the event
          const peer = await node.peerStore.get(peerIdObj);

          if (peer && peer.addresses && peer.addresses.length > 0) {
            // Addresses are objects with multiaddr property
            addresses = peer.addresses.map((addr) => {
              // addr can be a Multiaddr object or an Address object with multiaddr
              if (addr.multiaddr) {
                return addr.multiaddr.toString();
              } else if (addr.toString) {
                return addr.toString();
              } else {
                return String(addr);
              }
            });
            peerAddresses.set(peerId, addresses);
          }
        } catch (error) {
          console.log(
            `  ⚠️  Could not get addresses from peerStore: ${error.message}`
          );
          // Try alternative methods
          try {
            const peerIdObj = evt.detail;

            // Method 1: Get addresses from the connection itself
            const connections = node.getConnections(peerIdObj);
            if (connections && connections.length > 0) {
              const conn = connections[0];
              if (conn.remoteAddr) {
                addresses = [conn.remoteAddr.toString()];
                peerAddresses.set(peerId, addresses);
              }
            }

            // Method 2: Try peerStore again after delays (identify updates peerStore automatically)
            // Try multiple times with increasing delays
            const tryDelayedSave = async (delay) => {
              setTimeout(async () => {
                try {
                  const peer = await node.peerStore.get(peerIdObj);
                  if (peer && peer.addresses && peer.addresses.length > 0) {
                    const delayedAddresses = peer.addresses.map((addr) => {
                      if (addr.multiaddr) {
                        return addr.multiaddr.toString();
                      } else if (addr.toString) {
                        return addr.toString();
                      } else {
                        return String(addr);
                      }
                    });
                    // Only save if we don't already have this peer saved
                    const existing = peerAddresses.get(peerId);
                    if (!existing || existing.length === 0) {
                      peerAddresses.set(peerId, delayedAddresses);
                      dbOperations.savePeer(peerId, delayedAddresses);
                      console.log(
                        `  💾 Saved peer to database (delayed ${delay}ms, ${delayedAddresses.length} address(es))`
                      );
                    }
                  }
                } catch (delayedError) {
                  // Still can't get addresses, try again later
                }
              }, delay);
            };

            if (addresses.length === 0) {
              // Try after 1 second, 2 seconds, and 5 seconds
              tryDelayedSave(1000);
              tryDelayedSave(2000);
              tryDelayedSave(5000);
            }
          } catch (connError) {
            // Still can't get addresses
          }
        }
      }

      if (addresses.length > 0) {
        dbOperations.savePeer(peerId, addresses);
        console.log(
          `  💾 Saved peer to database (${addresses.length} address(es))`
        );
      } else {
        console.log(`  ⚠️  No addresses found for peer, skipping DB save`);
      }
    } catch (error) {
      console.log(`  ❌ Error saving peer to DB: ${error.message}`);
    }

    // Discover other peers in the mesh after a new connection
    setTimeout(() => {
      discoverAndConnectPeers().catch(() => {
        // Discovery failed, that's okay
      });
    }, 2000);

    // Broadcast updated peer list
    setTimeout(() => {
      broadcastConnectedPeers();
    }, 1000);
  });

  node.addEventListener("peer:disconnect", (evt) => {
    const peerId = evt.detail.toString();
    connectedPeers.delete(peerId);
    console.log(
      `❌ Peer disconnected! ID: ${peerId.slice(-8)} (Total: ${
        connectedPeers.size
      } peer(s))`
    );
  });

  // Subscribe to chat messages
  await node.services.pubsub.subscribe(CHAT_TOPIC);
  console.log(`📢 Subscribed to chat topic: ${CHAT_TOPIC}`);

  // Handle incoming messages (both chat and peer discovery)
  node.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic === CHAT_TOPIC) {
      const message = JSON.parse(new TextDecoder().decode(evt.detail.data));
      const senderId = evt.detail.from.toString();
      const isFromMe = senderId === node.peerId.toString();

      if (!isFromMe) {
        console.log(`💬 [${senderId.slice(-8)}]: ${message.text}`);
      }
    } else if (evt.detail.topic === PEER_DISCOVERY_TOPIC) {
      handlePeerDiscovery(evt).catch(() => {
        // Discovery failed, that's okay
      });
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
  console.log(
    "💡 Tip: You can connect to multiple peers by passing multiple addresses!"
  );
  console.log(
    "💡 Example: node src/index.js /ip4/.../p2p/PEER1 /ip4/.../p2p/PEER2\n"
  );

  // Periodically save all connected peers to database
  const saveAllConnectedPeers = async () => {
    try {
      // Get all active connections
      const connections = node.getConnections();

      for (const conn of connections) {
        try {
          const peerIdStr = conn.remotePeer.toString();

          // Get address from connection
          if (conn.remoteAddr) {
            const addr = conn.remoteAddr.toString();
            const existing = peerAddresses.get(peerIdStr) || [];

            // Add address if not already present
            if (!existing.includes(addr)) {
              existing.push(addr);
            }

            // Update peerAddresses map
            peerAddresses.set(peerIdStr, existing);

            // Save to database (this also updates last_seen via INSERT OR REPLACE)
            dbOperations.savePeer(peerIdStr, existing);

            // Also explicitly update last_seen to ensure it's current
            dbOperations.updateLastSeen(peerIdStr);
          }
        } catch (error) {
          // Skip this connection
        }
      }
    } catch (error) {
      // Error saving peers
    }
  };

  // Save all connected peers periodically (every 10 seconds)
  setInterval(() => {
    saveAllConnectedPeers().catch(() => {});
  }, 10000);

  // Clean up database periodically
  const cleanupDatabase = () => {
    try {
      // 1. Clean peers that are not currently connected (but keep them for 5 minutes)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const allPeersInDB = dbOperations.getAllPeerIds();
      const peersToKeep = new Set();

      // Keep currently connected peers
      for (const peerId of connectedPeers) {
        peersToKeep.add(peerId);
      }

      // Keep recently seen peers (seen within last 5 minutes)
      for (const peerId of allPeersInDB) {
        try {
          const peer = dbOperations.getPeer(peerId);
          if (peer && peer.lastSeen > fiveMinutesAgo) {
            peersToKeep.add(peerId);
          }
        } catch (error) {
          // Skip invalid peer
        }
      }

      // Remove peers that are not in the keep list
      let removedCount = 0;
      for (const peerId of allPeersInDB) {
        if (!peersToKeep.has(peerId)) {
          dbOperations.deletePeer(peerId);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(
          `  🧹 Cleaned ${removedCount} disconnected peer(s) from database`
        );
      }

      // 2. Clean very old peers (older than 1 hour)
      const oldRemoved = dbOperations.cleanOldPeersByHours(1);
      if (oldRemoved > 0) {
        console.log(
          `  🧹 Cleaned ${oldRemoved} old peer(s) (older than 1 hour) from database`
        );
      }
    } catch (error) {
      // Cleanup failed, that's okay
    }
  };

  // Clean up database periodically (every 30 seconds)
  setInterval(() => {
    cleanupDatabase();
  }, 30000);

  // Show database statistics periodically
  const showDBStats = () => {
    try {
      const allPeers = dbOperations.getAllPeers();
      const connectedCount = connectedPeers.size;
      const dbCount = allPeers.length;

      console.log(
        `📊 DB Stats: ${dbCount} peer(s) in DB, ${connectedCount} currently connected`
      );
    } catch (error) {
      // Stats failed
    }
  };

  // Show DB stats periodically (every 60 seconds)
  setInterval(() => {
    showDBStats();
  }, 60000);

  // Connect to peers if addresses provided
  if (process.argv.length >= 3) {
    const addressesToConnect = process.argv.slice(2);
    console.log(`🔌 Connecting to ${addressesToConnect.length} peer(s)...`);

    for (const address of addressesToConnect) {
      try {
        const ma = multiaddr(address);
        console.log(`  → Connecting to ${address}...`);

        // Establish connection (this also enables pubsub communication)
        await node.dial(ma);
        console.log(`  ✅ Connected to ${address}`);

        // Store the peer address
        const peerIdFromAddr = ma.getPeerId();
        if (peerIdFromAddr) {
          const peerIdStr = peerIdFromAddr.toString();
          if (!peerAddresses.has(peerIdStr)) {
            peerAddresses.set(peerIdStr, [address]);
          } else if (!peerAddresses.get(peerIdStr).includes(address)) {
            peerAddresses.get(peerIdStr).push(address);
          }

          // Save to database
          try {
            dbOperations.savePeer(peerIdStr, peerAddresses.get(peerIdStr));
            console.log(`  💾 Saved peer to database`);
          } catch (error) {
            // DB save failed, that's okay
          }
        }

        // Optional: ping to verify connection
        try {
          const latency = await node.services.ping.ping(ma);
          console.log(`  📡 Ping: ${latency}ms`);
        } catch (pingError) {
          // Ping might fail, but connection is still established
          console.log(`  ⚠️  Ping failed, but connection is established`);
        }
      } catch (error) {
        console.log(`  ❌ Failed to connect to ${address}: ${error.message}`);
      }
    }

    console.log("💡 Now you can chat with all connected peers!");

    // Discover and connect to other peers in the mesh
    setTimeout(() => {
      discoverAndConnectPeers().catch(() => {
        // Discovery failed, that's okay
      });
    }, 3000);

    // Broadcast peer list periodically
    setInterval(() => {
      broadcastConnectedPeers();
    }, 5000);
  } else {
    console.log(
      "💡 No peer addresses provided. Start other instances with this node's address to connect!"
    );
    console.log(
      "💡 Example: node src/index.js /ip4/127.0.0.1/tcp/XXXXX/p2p/12D3KooW..."
    );
    console.log(
      "💡 The DHT will automatically discover and connect to other peers!"
    );
  }

  // Load peers from database and try to reconnect
  const loadAndReconnectPeersFromDB = async () => {
    try {
      const savedPeers = dbOperations.getAllPeers();
      if (savedPeers.length === 0) {
        return;
      }

      console.log(`📂 Loading ${savedPeers.length} peer(s) from database...`);

      let reconnectCount = 0;
      for (const peer of savedPeers) {
        try {
          // Skip if already connected
          if (connectedPeers.has(peer.peerId)) {
            continue;
          }

          // Try to connect to each address
          for (const addrStr of peer.addresses) {
            try {
              const ma = multiaddr(addrStr);
              await node.dial(ma);
              console.log(
                `  ✅ Reconnected to peer from DB: ${peer.peerId.slice(-8)}`
              );
              reconnectCount++;

              // Store the address
              peerAddresses.set(peer.peerId, peer.addresses);

              break; // Successfully connected, move to next peer
            } catch (dialError) {
              // Try next address
              continue;
            }
          }
        } catch (error) {
          // Skip this peer
        }
      }

      if (reconnectCount > 0) {
        console.log(
          `  ✅ Reconnected to ${reconnectCount} peer(s) from database`
        );
      } else if (savedPeers.length > 0) {
        console.log(
          `  ⚠️  Could not reconnect to any saved peers (they may be offline)`
        );
      }
    } catch (error) {
      console.log(`  ⚠️  Error loading peers from database: ${error.message}`);
    }
  };

  // Wait a bit for DHT to initialize, then announce and discover
  setTimeout(async () => {
    try {
      // First, try to reconnect to peers from database
      await loadAndReconnectPeersFromDB();

      // Then announce and discover via DHT
      await announceToDHT();
      await discoverPeersViaDHT();
    } catch (error) {
      // DHT might not be ready, try again later
    }
  }, 3000);

  // Broadcast peer list periodically for all nodes
  setInterval(() => {
    broadcastConnectedPeers();
  }, 5000);

  // Announce to DHT periodically
  setInterval(() => {
    announceToDHT().catch(() => {
      // DHT announcement failed
    });
  }, 10000);

  // Discover peers via DHT periodically
  setInterval(() => {
    discoverPeersViaDHT().catch(() => {
      // DHT discovery failed
    });
  }, 15000);

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
