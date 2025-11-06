#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

clear
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     📊 DASHBOARD LIBP2P - Visualisation en temps réel     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to get status
get_node_status() {
    local node=$1
    local container="libp2p-$node"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${RED}❌ Arrêté${NC}"
        return
    fi
    
    echo -e "${GREEN}✅ Actif${NC}"
}

# Function to get peer count
get_peer_count() {
    local node=$1
    local container="libp2p-$node"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "0"
        return
    fi
    
    docker logs "$container" 2>&1 | grep "Total:" | tail -1 | sed -n 's/.*Total: \([0-9]*\).*/\1/p' || echo "0"
}

# Function to get DB count
get_db_count() {
    local node=$1
    local container="libp2p-$node"
    local db_path="/app/data/${node}.db"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "0"
        return
    fi
    
    docker exec "$container" node -e "
        const Database = require('better-sqlite3');
        try {
            const db = new Database('$db_path');
            const rows = db.prepare('SELECT COUNT(*) as count FROM peers').get();
            console.log(rows.count);
            db.close();
        } catch(e) {
            console.log('0');
        }
    " 2>/dev/null || echo "0"
}

# Function to get peer ID
get_peer_id() {
    local node=$1
    local container="libp2p-$node"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "N/A"
        return
    fi
    
    docker logs "$container" 2>&1 | grep "📋 My peer ID:" | head -1 | sed -n 's/.*ID: \([^ ]*\).*/\1/p' | head -c 20 || echo "N/A"
}

# Function to get recent connections
get_recent_connections() {
    local node=$1
    local container="libp2p-$node"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        return
    fi
    
    docker logs "$container" 2>&1 | grep -E "🔗 Peer connected" | tail -3 | while read -r line; do
        peer_id=$(echo "$line" | sed -n 's/.*ID: \([^)]*\).*/\1/p' | head -c 12)
        if [ -n "$peer_id" ]; then
            echo -e "    ${GREEN}→${NC} $peer_id"
        fi
    done
}

# Header
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ÉTAT DES NŒUDS                                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Node 1
echo -e "${YELLOW}📦 NODE 1${NC}"
echo -e "  Status: $(get_node_status node1)"
echo -e "  Peer ID: $(get_peer_id node1)"
echo -e "  Peers connectés: $(get_peer_count node1)"
echo -e "  Peers en DB: $(get_db_count node1)"
echo -e "  Connexions récentes:"
get_recent_connections node1
echo ""

# Node 2
echo -e "${YELLOW}📦 NODE 2${NC}"
echo -e "  Status: $(get_node_status node2)"
echo -e "  Peer ID: $(get_peer_id node2)"
echo -e "  Peers connectés: $(get_peer_count node2)"
echo -e "  Peers en DB: $(get_db_count node2)"
echo -e "  Connexions récentes:"
get_recent_connections node2
echo ""

# Node 3
echo -e "${YELLOW}📦 NODE 3${NC}"
echo -e "  Status: $(get_node_status node3)"
echo -e "  Peer ID: $(get_peer_id node3)"
echo -e "  Peers connectés: $(get_peer_count node3)"
echo -e "  Peers en DB: $(get_db_count node3)"
echo -e "  Connexions récentes:"
get_recent_connections node3
echo ""

# Database details
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  BASES DE DONNÉES                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

for node in node1 node2 node3; do
    container="libp2p-$node"
    db_path="/app/data/${node}.db"
    
    echo -e "${CYAN}📊 $node${NC}"
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        count=$(docker exec "$container" node -e "
            const Database = require('better-sqlite3');
            try {
                const db = new Database('$db_path');
                const rows = db.prepare('SELECT COUNT(*) as count FROM peers').get();
                console.log(rows.count);
                db.close();
            } catch(e) {
                console.log('0');
            }
        " 2>/dev/null || echo "0")
        if [ "$count" != "0" ]; then
            echo -e "  ${GREEN}✅ $count peer(s) sauvegardé(s)${NC}"
            docker exec "$container" node -e "
                const Database = require('better-sqlite3');
                try {
                    const db = new Database('$db_path');
                    const rows = db.prepare('SELECT * FROM peers ORDER BY last_seen DESC LIMIT 5').all();
                    if (rows.length > 0) {
                        console.log('Peer ID                                    | Last Seen');
                        console.log('--------------------------------------------|------------------------');
                        rows.forEach(r => {
                            const date = new Date(r.last_seen).toISOString().replace('T', ' ').substring(0, 19);
                            const peerShort = r.peer_id.substring(0, 40);
                            console.log(\`\${peerShort} | \${date}\`);
                        });
                    }
                    db.close();
                } catch(e) {
                    console.error('Error:', e.message);
                }
            " 2>/dev/null
        else
            echo -e "  ${YELLOW}📭 Aucun peer sauvegardé${NC}"
        fi
    else
        echo -e "  ${RED}❌ Conteneur non disponible${NC}"
    fi
    echo ""
done

# Communications summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ACTIVITÉ RÉCENTE                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

for node in node1 node2 node3; do
    container="libp2p-$node"
    echo -e "${MAGENTA}📡 $node${NC}"
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        # DHT activity
        dht_announce=$(docker logs "$container" 2>&1 | grep -c "📢 Announced" || echo "0")
        dht_discover=$(docker logs "$container" 2>&1 | grep -c "🔍 Discovering" || echo "0")
        echo -e "  DHT: ${BLUE}$dht_announce annonces${NC}, ${BLUE}$dht_discover recherches${NC}"
        
        # Connections
        connects=$(docker logs "$container" 2>&1 | grep -c "🔗 Peer connected" || echo "0")
        disconnects=$(docker logs "$container" 2>&1 | grep -c "❌ Peer disconnected" || echo "0")
        echo -e "  Connexions: ${GREEN}$connects${NC}, Déconnexions: ${RED}$disconnects${NC}"
        
        # Messages
        messages=$(docker logs "$container" 2>&1 | grep -c "💬" || echo "0")
        echo -e "  Messages: ${CYAN}$messages${NC}"
    else
        echo -e "  ${RED}❌ Non disponible${NC}"
    fi
    echo ""
done

echo -e "${CYAN}💡 Appuyez sur Ctrl+C pour quitter${NC}"
echo -e "${CYAN}💡 Rafraîchissement automatique toutes les 5 secondes...${NC}"
