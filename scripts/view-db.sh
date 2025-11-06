#!/bin/bash

echo "🗄️  Visualisation des bases de données libp2p"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display database
show_db() {
    local node=$1
    local db_path=$2
    local container_name="libp2p-$node"
    
    echo -e "${BLUE}📊 Base de données de $node${NC}"
    echo "-----------------------------------"
    
    # Check if container exists
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo -e "${YELLOW}⚠️  Le conteneur $container_name n'existe pas${NC}"
        echo ""
        return
    fi
    
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo -e "${YELLOW}⚠️  Le conteneur $container_name n'est pas en cours d'exécution${NC}"
        echo ""
        return
    fi
    
    # Check if database exists
    if ! docker exec "$container_name" sh -c "test -f $db_path" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  La base de données n'existe pas encore${NC}"
        echo ""
        return
    fi
    
    # Get peer count using Node.js
    local count=$(docker exec "$container_name" node -e "
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
    
    if [ "$count" = "0" ]; then
        echo -e "${YELLOW}📭 Aucun peer sauvegardé pour l'instant${NC}"
        echo ""
    else
        echo -e "${GREEN}✅ $count peer(s) sauvegardé(s)${NC}"
        echo ""
        
        # Show all peers using Node.js
        echo "Peers sauvegardés:"
        docker exec "$container_name" node -e "
            const Database = require('better-sqlite3');
            try {
                const db = new Database('$db_path');
                const rows = db.prepare('SELECT * FROM peers ORDER BY last_seen DESC').all();
                console.log('Peer ID                                    | Addresses | Last Seen');
                console.log('--------------------------------------------|-----------|------------------------');
                rows.forEach(r => {
                    const addresses = JSON.parse(r.addresses);
                    const date = new Date(r.last_seen).toISOString().replace('T', ' ').substring(0, 19);
                    const peerShort = r.peer_id.substring(0, 40);
                    console.log(\`\${peerShort} | \${addresses.length} addr(s) | \${date}\`);
                    addresses.forEach(addr => {
                        console.log(\`  → \${addr}\`);
                    });
                });
                db.close();
            } catch(e) {
                console.error('Error:', e.message);
            }
        " 2>/dev/null
        echo ""
    fi
    
    echo "=============================================="
    echo ""
}

# Show all databases
show_db "node1" "/app/data/node1.db"
show_db "node2" "/app/data/node2.db"
show_db "node3" "/app/data/node3.db"

echo "💡 Pour voir les logs en temps réel:"
echo "   docker-compose logs -f"
echo ""
echo "💡 Pour voir les connexions:"
echo "   docker-compose logs | grep '🔗 Peer connected'"
