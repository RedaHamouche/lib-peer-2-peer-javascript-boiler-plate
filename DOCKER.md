# Docker Setup pour libp2p

Ce projet inclut un setup Docker Compose pour tester le système avec 3 nœuds, chacun avec sa propre base de données SQLite.

## 🚀 Utilisation

### Lancer les 3 nœuds

```bash
docker-compose up --build
```

Cela va :

1. Construire l'image Docker
2. Lancer 3 conteneurs (node1, node2, node3)
3. Chaque nœud aura sa propre base de données SQLite dans un volume Docker

### Accéder aux conteneurs

Pour accéder à un nœud spécifique :

```bash
# Node 1
docker exec -it libp2p-node1 sh

# Node 2
docker exec -it libp2p-node2 sh

# Node 3
docker exec -it libp2p-node3 sh
```

### Voir les logs

```bash
# Logs de tous les nœuds
docker-compose logs -f

# Logs d'un nœud spécifique
docker-compose logs -f node1
```

### Arrêter les nœuds

```bash
docker-compose down
```

### Supprimer les volumes (base de données)

```bash
docker-compose down -v
```

## 📊 Base de données

Chaque nœud a sa propre base de données SQLite stockée dans un volume Docker :

- `node1-db` : Base de données du nœud 1
- `node2-db` : Base de données du nœud 2
- `node3-db` : Base de données du nœud 3

Les peers découverts sont automatiquement sauvegardés dans la base de données et rechargés au redémarrage.

## 🔗 Connexions entre nœuds

Les nœuds se connectent automatiquement via :

1. **DHT** : Découverte distribuée de peers
2. **GossipSub** : Partage de liste de peers
3. **Base de données** : Rechargement des peers connus au démarrage

## 💡 Tests

1. Lancez les 3 nœuds avec `docker-compose up`
2. Les nœuds vont automatiquement se découvrir et se connecter
3. Vous pouvez tester le chat en accédant aux conteneurs
4. Arrêtez le nœud 1 - les nœuds 2 et 3 devraient continuer à communiquer grâce à la DB et au DHT
