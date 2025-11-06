# lib-peer-2-peer-javascript-boilerplate

Un boilerplate complet pour créer des applications peer-to-peer avec libp2p en JavaScript. Ce projet inclut un système de chat en temps réel, des fonctionnalités de ping, et une architecture modulaire prête pour l'extension.

## 🚀 Fonctionnalités

- **Nœud libp2p complet** avec transport TCP, chiffrement Noise, et multiplexage Yamux
- **Système de chat en temps réel** utilisant GossipSub
- **Service de ping** pour mesurer la latence entre peers
- **Gestion des connexions** avec logs détaillés
- **Interface de chat interactive** en ligne de commande
- **Architecture modulaire** facilement extensible

## 📋 Prérequis

- Node.js >= 16.0.0
- Yarn (recommandé) ou npm

## 🛠️ Installation

1. **Cloner le repository**

```bash
git clone https://github.com/votre-username/lib-peer-2-peer-javascript-boilerplate.git
cd lib-peer-2-peer-javascript-boilerplate
```

2. **Installer les dépendances**

```bash
yarn install
# ou
npm install
```

## 🎯 Utilisation

### Démarrage d'un nœud

```bash
node src/index.js
```

Vous verrez quelque chose comme :

```
libp2p has started
listening on addresses:
/ip4/127.0.0.1/tcp/51245/p2p/12D3KooWG2stbe3a4FpmYRkEWDf3BsBTpapzwCoSXG9fkSh6Ls1z
📋 My peer ID: 12D3KooWG2stbe3a4FpmYRkEWDf3BsBTpapzwCoSXG9fkSh6Ls1z
📢 Subscribed to chat topic: libp2p-chat
💬 Chat started! Type your messages and press Enter to send them.
💡 Connect to another peer to start chatting!
```

### Connexion entre deux nœuds

1. **Terminal 1** - Lancez le premier nœud :

```bash
node src/index.js
```

2. **Terminal 2** - Lancez le deuxième nœud avec l'adresse du premier :

```bash
node src/index.js /ip4/127.0.0.1/tcp/51245/p2p/12D3KooWG2stbe3a4FpmYRkEWDf3BsBTpapzwCoSXG9fkSh6Ls1z
```

### Chat en temps réel

Une fois connectés, vous pouvez chatter en temps réel :

- Tapez vos messages dans n'importe quel terminal
- Appuyez sur **Entrée** pour envoyer
- Les messages apparaîtront dans les deux terminaux

```
💬 [You]: Salut !
💬 [ffUTKijW]: Salut ! Comment ça va ?
💬 [You]: Ça va bien, merci !
```

## 🏗️ Architecture

### Services libp2p configurés

- **Transport** : TCP pour les connexions réseau
- **Chiffrement** : Noise pour la sécurité des communications
- **Multiplexage** : Yamux pour optimiser les connexions
- **Ping** : Service de ping pour mesurer la latence
- **Identify** : Identification des peers
- **PubSub** : GossipSub pour la messagerie distribuée

### Structure du projet

```
src/
├── index.js          # Point d'entrée principal
package.json          # Configuration npm/yarn
yarn.lock            # Lock file des dépendances
README.md            # Documentation
```

## 🔧 Configuration

### Variables d'environnement

Le projet utilise des ports aléatoires par défaut. Pour utiliser un port fixe, modifiez la configuration dans `src/index.js` :

```javascript
addresses: {
  listen: ["/ip4/127.0.0.1/tcp/0"]; // Port aléatoire
  // ou
  listen: ["/ip4/127.0.0.1/tcp/9000"]; // Port fixe
}
```

### Personnalisation du chat

Pour modifier le topic du chat, changez la variable `CHAT_TOPIC` :

```javascript
const CHAT_TOPIC = "mon-chat-personnalise";
```

## 📚 Dépendances principales

- **libp2p** : Framework peer-to-peer principal
- **@libp2p/tcp** : Transport TCP
- **@chainsafe/libp2p-noise** : Chiffrement Noise
- **@chainsafe/libp2p-yamux** : Multiplexage de flux
- **@libp2p/gossipsub** : Protocole de messagerie distribuée
- **@libp2p/ping** : Service de ping
- **@libp2p/identify** : Identification des peers

## 🚀 Extensions possibles

### Ajouter de nouveaux protocoles

```javascript
// Dans la configuration des services
services: {
  // ... services existants
  monProtocole: monProtocoleService();
}
```

### Ajouter de nouveaux transports

```javascript
// Dans la configuration des transports
transports: [
  tcp(),
  websocket(), // Nouveau transport
  // ...
];
```

### Interface web

Ce boilerplate peut être étendu avec une interface web en utilisant les mêmes modules libp2p avec des transports WebRTC.

## 🧪 Tests de scalabilité

Le projet inclut un script de test automatisé pour vérifier la scalabilité du réseau :

```bash
yarn test:scalability
# ou
npm run test:scalability
```

Ce test :

- ✅ Crée 10 nœuds automatiquement
- ✅ Les connecte en topologie mesh (chaque nœud se connecte à plusieurs autres)
- ✅ Vérifie que tous les messages sont propagés à tous les nœuds
- ✅ Teste la résilience (fonctionne même si un nœud se déconnecte)

### Résultats des tests

Le système a été testé avec succès avec **10 nœuds** :

- ✅ **100% de succès** : Tous les nœuds reçoivent tous les messages
- ✅ **Résilience** : Le réseau continue de fonctionner même après la fermeture d'un nœud
- ✅ **Architecture décentralisée** : Aucun point de défaillance unique

### Connecter plusieurs nœuds manuellement

Pour créer un réseau avec plusieurs nœuds manuellement :

1. **Nœud 1** (bootstrap) :

```bash
node src/index.js
```

2. **Nœud 2** (se connecte au nœud 1) :

```bash
node src/index.js /ip4/127.0.0.1/tcp/XXXXX/p2p/ADRESSE_NODE1
```

3. **Nœud 3** (se connecte au nœud 1 ET au nœud 2) :

```bash
node src/index.js /ip4/127.0.0.1/tcp/XXXXX/p2p/ADRESSE_NODE1 /ip4/127.0.0.1/tcp/YYYYY/p2p/ADRESSE_NODE2
```

**Astuce** : Pour un réseau vraiment décentralisé, chaque nœud devrait se connecter à au moins 2-3 autres nœuds pour éviter les points de défaillance unique.

## 🤝 Contribution

1. Fork le projet
2. Créez une branche pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🔗 Liens utiles

- [Documentation libp2p](https://docs.libp2p.io/)
- [js-libp2p GitHub](https://github.com/libp2p/js-libp2p)
- [Exemples libp2p](https://github.com/libp2p/js-libp2p-examples)

## 🐛 Problèmes connus

- Les ports changent à chaque redémarrage (comportement normal avec `tcp/0`)
- Les messages ne sont pas persistants (ajoutez une base de données si nécessaire)

## 📞 Support

Si vous rencontrez des problèmes ou avez des questions :

1. Vérifiez les [Issues existantes](https://github.com/votre-username/lib-peer-2-peer-javascript-boilerplate/issues)
2. Créez une nouvelle issue avec une description détaillée
3. Incluez les logs d'erreur et votre configuration

---

**Fait avec ❤️ et libp2p**
