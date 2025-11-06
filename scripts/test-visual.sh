#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🧪 TEST VISUEL - Communications libp2p                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}1️⃣  CONNEXIONS ENTRE NŒUDS${NC}"
echo "=============================================="
for node in node1 node2 node3; do
    container="libp2p-$node"
    echo -e "${YELLOW}📦 $node${NC}"
    docker logs "$container" 2>&1 | grep -E "🔗 Peer connected" | tail -3 | while read -r line; do
        peer_id=$(echo "$line" | sed -n 's/.*ID: \([^)]*\).*/\1/p' | head -c 12)
        total=$(echo "$line" | sed -n 's/.*Total: \([^)]*\).*/\1/p')
        if [ -n "$peer_id" ]; then
            echo -e "  ${GREEN}✅${NC} Connecté à: $peer_id (Total: $total)"
        fi
    done
    echo ""
done

echo -e "${BLUE}2️⃣  BASES DE DONNÉES${NC}"
echo "=============================================="
for node in node1 node2 node3; do
    container="libp2p-$node"
    db_path="/app/data/${node}.db"
    echo -e "${YELLOW}📊 $node${NC}"
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
                    const rows = db.prepare('SELECT * FROM peers ORDER BY last_seen DESC').all();
                    console.log('Peer ID                                    | Last Seen');
                    console.log('--------------------------------------------|------------------------');
                    rows.forEach(r => {
                        const date = new Date(r.last_seen).toISOString().replace('T', ' ').substring(0, 19);
                        const peerShort = r.peer_id.substring(0, 40);
                        console.log(\`\${peerShort} | \${date}\`);
                    });
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

echo -e "${BLUE}3️⃣  ACTIVITÉ DHT${NC}"
echo "=============================================="
for node in node1 node2 node3; do
    container="libp2p-$node"
    echo -e "${YELLOW}📡 $node${NC}"
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        dht_announce=$(docker logs "$container" 2>&1 | grep -c "📢 Announced" || echo "0")
        dht_discover=$(docker logs "$container" 2>&1 | grep -c "🔍 Discovering" || echo "0")
        connects=$(docker logs "$container" 2>&1 | grep -c "🔗 Peer connected" || echo "0")
        messages=$(docker logs "$container" 2>&1 | grep -c "💬" || echo "0")
        
        echo -e "  DHT: ${BLUE}$dht_announce annonces${NC}, ${BLUE}$dht_discover recherches${NC}"
        echo -e "  Connexions: ${GREEN}$connects${NC}, Messages: ${CYAN}$messages${NC}"
    else
        echo -e "  ${RED}❌ Non disponible${NC}"
    fi
    echo ""
done

echo -e "${BLUE}4️⃣  MESSAGES RÉCENTS${NC}"
echo "=============================================="
for node in node1 node2 node3; do
    container="libp2p-$node"
    echo -e "${YELLOW}💬 $node${NC}"
    docker logs "$container" 2>&1 | grep -E "💬 \[" | tail -3 | while read -r line; do
        echo "  $line"
    done
    echo ""
done

echo -e "${CYAN}💡 Pour envoyer des messages:${NC}"
echo "   docker exec -it libp2p-node1 sh"
echo "   (puis taper votre message dans le terminal)"
echo ""
echo -e "${CYAN}💡 Pour voir les logs en temps réel:${NC}"
echo "   docker-compose logs -f"
echo ""

