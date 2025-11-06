# 🚀 Démarrage Rapide - Test Docker

## Test rapide (5 minutes)

### 1. Lancer les 3 nœuds

```bash
docker-compose up --build
```

### 2. Dans un nouveau terminal, vérifier les connexions

```bash
# Voir les logs en temps réel
docker-compose logs -f

# Ou utiliser le script de test
./scripts/test-chat.sh
```

### 3. Test de résilience

```bash
# Dans un nouveau terminal
# Arrêter node1
docker-compose stop node1

# Attendre 5 secondes, puis vérifier que node2 et node3 fonctionnent
docker-compose logs node2 | tail -20
docker-compose logs node3 | tail -20

# Redémarrer node1
docker-compose start node1

# Vérifier la reconnexion
docker-compose logs node1 | tail -20
```

## Ce que vous devriez voir

✅ **Au démarrage :**

- `libp2p has started`
- `📋 My peer ID: ...`
- `💾 Database: ...`
- `📚 Loaded X peer(s) from database`
- `📢 Announced to DHT network`

✅ **Connexions :**

- `🔗 Peer connected! ID: ...`
- `💾 Saved peer to database`

✅ **Découverte :**

- `🔍 Discovering peers via DHT...`
- `✅ Connected to DHT-discovered peer: ...`

✅ **Résilience (après fermeture node1) :**

- `❌ Peer disconnected! ID: ...` (node1)
- Mais node2 et node3 continuent à fonctionner
- À la reconnexion : `🔗 Peer connected!` (reconnexion automatique)

## Commandes utiles

```bash
# Voir tous les logs
docker-compose logs -f

# Voir un nœud spécifique
docker-compose logs -f node1

# Arrêter tous les nœuds
docker-compose down

# Arrêter et supprimer les DB
docker-compose down -v

# Voir l'état
docker-compose ps
```

## Vérifier les bases de données

```bash
# Node1
docker exec libp2p-node1 sh -c "sqlite3 /app/data/node1.db 'SELECT * FROM peers;'"

# Node2
docker exec libp2p-node2 sh -c "sqlite3 /app/data/node2.db 'SELECT * FROM peers;'"

# Node3
docker exec libp2p-node3 sh -c "sqlite3 /app/data/node3.db 'SELECT * FROM peers;'"
```

Chaque DB devrait contenir les adresses des autres peers connectés !
