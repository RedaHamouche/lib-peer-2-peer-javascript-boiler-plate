#!/bin/bash

# Script pour tester le chat entre les nœuds Docker

echo "🧪 Test du système de chat libp2p"
echo ""

# Vérifier que les conteneurs sont lancés
if ! docker ps | grep -q "libp2p-node"; then
    echo "❌ Les conteneurs ne sont pas lancés. Lancez d'abord: docker-compose up"
    exit 1
fi

echo "✅ Conteneurs détectés"
echo ""

# Fonction pour envoyer un message via un nœud
send_message() {
    local node=$1
    local message=$2
    echo "📤 Envoi de message via $node: '$message'"
    # Note: Pour envoyer des messages, il faudrait modifier le code pour accepter des messages via stdin ou un script
    # Pour l'instant, on vérifie juste les connexions
}

echo "📊 Vérification des connexions..."
echo ""

# Vérifier les connexions dans les logs
echo "Node1 - Dernières connexions:"
docker-compose logs node1 | grep -E "🔗 Peer connected|❌ Peer disconnected" | tail -5
echo ""

echo "Node2 - Dernières connexions:"
docker-compose logs node2 | grep -E "🔗 Peer connected|❌ Peer disconnected" | tail -5
echo ""

echo "Node3 - Dernières connexions:"
docker-compose logs node3 | grep -E "🔗 Peer connected|❌ Peer disconnected" | tail -5
echo ""

echo "💾 Vérification des bases de données..."
echo ""

echo "Node1 DB - Peers sauvegardés:"
docker exec libp2p-node1 sh -c "sqlite3 /app/data/node1.db 'SELECT COUNT(*) as count FROM peers;' 2>/dev/null || echo 'DB pas encore créée'"
echo ""

echo "Node2 DB - Peers sauvegardés:"
docker exec libp2p-node2 sh -c "sqlite3 /app/data/node2.db 'SELECT COUNT(*) as count FROM peers;' 2>/dev/null || echo 'DB pas encore créée'"
echo ""

echo "Node3 DB - Peers sauvegardés:"
docker exec libp2p-node3 sh -c "sqlite3 /app/data/node3.db 'SELECT COUNT(*) as count FROM peers;' 2>/dev/null || echo 'DB pas encore créée'"
echo ""

echo "✅ Test terminé!"
echo ""
echo "💡 Pour voir les logs en temps réel:"
echo "   docker-compose logs -f"
echo ""
echo "💡 Pour tester la résilience:"
echo "   docker-compose stop node1"
echo "   # Attendez quelques secondes"
echo "   docker-compose logs node2 node3"
echo "   docker-compose start node1"
