#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}📡 Visualisation des communications libp2p${NC}"
echo "=============================================="
echo ""

# Function to show communications for a node
show_node_comms() {
    local node=$1
    local container="libp2p-$node"
    
    echo -e "${GREEN}📊 Node: $node${NC}"
    echo "-----------------------------------"
    
    # Check if container exists and is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${RED}❌ Le conteneur $container n'est pas en cours d'exécution${NC}"
        echo ""
        return
    fi
    
    # Get peer connections
    echo -e "${YELLOW}🔗 Connexions:${NC}"
    docker logs "$container" 2>&1 | grep -E "🔗 Peer connected|❌ Peer disconnected" | tail -10 | while read -r line; do
        if echo "$line" | grep -q "🔗"; then
            peer_id=$(echo "$line" | grep -oP 'ID: \K[^)]+' | head -1)
            total=$(echo "$line" | grep -oP 'Total: \K[^)]+' | head -1)
            echo -e "  ${GREEN}✅ Connexion: ${peer_id}${NC} (Total: $total)"
        elif echo "$line" | grep -q "❌"; then
            peer_id=$(echo "$line" | grep -oP 'ID: \K[^)]+' | head -1)
            total=$(echo "$line" | grep -oP 'Total: \K[^)]+' | head -1)
            echo -e "  ${RED}❌ Déconnexion: ${peer_id}${NC} (Total: $total)"
        fi
    done
    
    # Get DHT announcements
    echo ""
    echo -e "${YELLOW}📢 DHT Annonces:${NC}"
    dht_count=$(docker logs "$container" 2>&1 | grep -c "📢 Announced to DHT network" || echo "0")
    echo -e "  ${BLUE}Total annonces: $dht_count${NC}"
    
    # Get DHT discoveries
    echo ""
    echo -e "${YELLOW}🔍 Découvertes DHT:${NC}"
    discovery_count=$(docker logs "$container" 2>&1 | grep -c "🔍 Discovering peers via DHT" || echo "0")
    connected_via_dht=$(docker logs "$container" 2>&1 | grep -c "✅ Connected to DHT" || echo "0")
    echo -e "  ${BLUE}Recherches: $discovery_count${NC}"
    echo -e "  ${GREEN}Connexions réussies: $connected_via_dht${NC}"
    
    # Get messages
    echo ""
    echo -e "${YELLOW}💬 Messages:${NC}"
    docker logs "$container" 2>&1 | grep -E "💬 \[" | tail -5 | while read -r line; do
        echo "  $line"
    done
    
    echo ""
    echo "=============================================="
    echo ""
}

# Show communications for all nodes
show_node_comms "node1"
show_node_comms "node2"
show_node_comms "node3"

echo -e "${BLUE}💡 Pour voir les logs en temps réel:${NC}"
echo "   docker-compose logs -f"
echo ""
echo -e "${BLUE}💡 Pour voir uniquement les connexions:${NC}"
echo "   docker-compose logs | grep '🔗 Peer connected'"
