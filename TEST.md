# Guide de Test - libp2p avec Docker

## 🚀 Étape 1 : Lancer les 3 nœuds

```bash
docker-compose up --build
```

Cela va :

- Construire l'image Docker
- Lancer les 3 conteneurs (node1, node2, node3)
- Chaque nœud démarre avec sa propre DB

Attendez quelques secondes que tous les nœuds soient démarrés.

## 📊 Étape 2 : Vérifier que les nœuds sont actifs

Dans un nouveau terminal, vérifiez les logs :

```bash
# Voir tous les logs
docker-compose logs -f

# Ou voir un nœud spécifique
docker-compose logs -f node1
docker-compose logs -f node2
docker-compose logs -f node3
```

Vous devriez voir :

- `libp2p has started`
- `📋 My peer ID: ...`
- `💾 Database: ...`
- `📚 Loaded X peer(s) from database`
- `📢 Announced to DHT network`
- `🔍 Discovering peers via DHT...`

## 🔗 Étape 3 : Vérifier les connexions

Dans les logs, vous devriez voir :

- `🔗 Peer connected! ID: ...`
- Les nœuds se connectent automatiquement via DHT et GossipSub

## 💬 Étape 4 : Tester le chat

### Option A : Via les logs Docker

Les messages de chat apparaissent dans les logs. Vous pouvez envoyer des messages en modifiant le code ou en utilisant un script.

### Option B : Exécuter des commandes dans les conteneurs

```bash
# Accéder au node1
docker exec -it libp2p-node1 sh

# Dans le conteneur, vous pouvez lancer Node.js directement
# Mais le chat est interactif, donc c'est mieux de le faire via un script
```

### Option C : Créer un script de test

Créez un fichier `test-chat.js` pour envoyer des messages :

```javascript
// test-chat.js - À exécuter dans un conteneur
import { spawn } from "child_process";

const sendMessage = (nodeName, message) => {
  console.log(`Sending "${message}" to ${nodeName}`);
  // Vous pouvez utiliser docker exec pour envoyer des messages
};
```

## 🛡️ Étape 5 : Tester la résilience

1. **Vérifiez que les 3 nœuds communiquent** :

   ```bash
   docker-compose logs | grep "💬"
   ```

2. **Arrêtez le node1** :

   ```bash
   docker-compose stop node1
   ```

3. **Vérifiez que node2 et node3 continuent** :

   ```bash
   docker-compose logs node2 | tail -20
   docker-compose logs node3 | tail -20
   ```

   Vous devriez voir :

   - `❌ Peer disconnected! ID: ...` (déconnexion du node1)
   - Mais node2 et node3 continuent à fonctionner

4. **Redémarrez node1** :

   ```bash
   docker-compose start node1
   ```

5. **Vérifiez la reconnexion** :

   ```bash
   docker-compose logs node1 | tail -20
   ```

   Node1 devrait se reconnecter automatiquement grâce à la DB !

## 💾 Étape 6 : Vérifier les bases de données

```bash
# Accéder à la DB du node1
docker exec -it libp2p-node1 sh
sqlite3 /app/data/node1.db "SELECT * FROM peers;"

# Accéder à la DB du node2
docker exec -it libp2p-node2 sh
sqlite3 /app/data/node2.db "SELECT * FROM peers;"

# Accéder à la DB du node3
docker exec -it libp2p-node3 sh
sqlite3 /app/data/node3.db "SELECT * FROM peers;"
```

Chaque DB devrait contenir les adresses des autres peers !

## 🧹 Étape 7 : Nettoyer

```bash
# Arrêter tous les conteneurs
docker-compose down

# Arrêter et supprimer les volumes (DB)
docker-compose down -v

# Supprimer les images
docker-compose down --rmi all
```

## 🔍 Commandes utiles

```bash
# Voir l'état des conteneurs
docker-compose ps

# Voir les volumes (DB)
docker volume ls

# Voir les réseaux
docker network ls

# Inspecter un conteneur
docker inspect libp2p-node1

# Voir les ressources utilisées
docker stats
```

## 🐛 Dépannage

### Les nœuds ne se connectent pas

1. Vérifiez les logs : `docker-compose logs`
2. Vérifiez que le DHT fonctionne : cherchez `📢 Announced to DHT network`
3. Vérifiez les adresses : les logs doivent afficher les adresses multiaddr

### Les bases de données sont vides

1. Attendez quelques secondes - les peers sont sauvegardés après connexion
2. Vérifiez les logs pour voir si des connexions ont été établies
3. Les peers sont sauvegardés uniquement après une connexion réussie

### Erreurs de connexion

1. Vérifiez que tous les conteneurs sont dans le même réseau Docker
2. Vérifiez les logs pour les erreurs spécifiques
3. Assurez-vous que les ports ne sont pas déjà utilisés
