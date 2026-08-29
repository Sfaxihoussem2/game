# نعرفك قدّاش؟ ❤️

Jeu de couple à distance, **entièrement en arabe tunisien (derja)**.
Deux joueurs, deux appareils, une partie privée à 5 caractères. 562 cartes.

---

## 1. Lancer en local (2 minutes)

Prérequis : **Node.js 18+**.

```bash
cd naarfek
npm install
npm start
```

Le terminal affiche :

```
❤️  نعرفك قدّاش؟ — http://localhost:3000
🃏  562 كارت جاهز في الداتاباز
```

Ouvre `http://localhost:3000` dans deux onglets (ou deux navigateurs) :
un onglet fait **نعمل Partie**, l'autre entre le code dans **ندخل لـ Partie**.

### Jouer depuis deux téléphones sur le même Wi-Fi

Trouve l'IP locale de ton ordinateur :

```bash
# macOS / Linux
ipconfig getifaddr en0 || hostname -I
# Windows
ipconfig
```

Puis, sur les deux téléphones : `http://192.168.x.x:3000`.
(Ça ne marche que si les deux appareils sont sur le même réseau — pour jouer
vraiment à distance, passe au déploiement ci-dessous.)

### Tests

```bash
npm start          # dans un terminal
npm test           # dans un autre : deux vrais clients jouent une partie complète
```

Le test vérifie : création/join, refus d'un 3ᵉ joueur, refus d'un code invalide,
protection des réglages, blocage d'un joueur hors de son tour, fin de partie au
bon nombre de cartes, synchronisation des scores, reconnexion, restart.

---

## 2. Mettre en ligne (pour jouer vraiment à distance)

Le projet est un serveur Node standard : `npm install` puis `npm start`, en
écoutant `process.env.PORT`. Il tourne tel quel sur n'importe quel hébergeur Node.

### Option A — Render (gratuit, recommandé)

1. Pousse le dossier sur un dépôt GitHub.
2. [render.com](https://render.com) → **New +** → **Web Service** → connecte le dépôt.
3. Réglages :
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
4. Deploy. Tu obtiens une URL type `https://naarfek.onrender.com`.
5. Envoie l'URL + le code de partie à ton/ta partenaire.

> Le plan gratuit Render met le service en veille après 15 min d'inactivité :
> le premier chargement peut prendre ~30 s. Les rooms étant en mémoire, une mise
> en veille efface les parties en cours (voir §4).

### Option B — Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Railway détecte Node tout seul ; aucune variable d'environnement n'est requise.
3. **Settings → Networking → Generate Domain** pour obtenir l'URL publique.

### Option C — Fly.io / VPS / Docker

Un `Dockerfile` est fourni :

```bash
docker build -t naarfek .
docker run -p 3000:3000 naarfek
```

### Aucune configuration externe n'est nécessaire

Pas de base de données, pas de clé API, pas de compte tiers, pas de fichier `.env`.
La seule variable lue est `PORT` (fournie automatiquement par l'hébergeur).

---

## 3. Comment on joue

1. Joueur 1 écrit son prénom → **نعمل Partie** → reçoit un code (ex. `K7P4X`).
2. Il l'envoie avec le bouton **مشاركة** (partage le lien `?code=K7P4X` prérempli).
3. Joueur 2 écrit son prénom, entre le code → **ندخل لـ Partie**.
4. Dans le lobby, le créateur choisit les catégories et la longueur (10 / 20 / 30 / ∞),
   puis **يلّا نبداو ❤️**.
5. À chaque tour : **إسحب كارت** → la carte se retourne en 3D chez les deux joueurs →
   on répond → **مرّر الدور**.

Le serveur refuse toute action d'un joueur dont ce n'est pas le tour.

### Points

| Catégorie | Points |
|---|---|
| ❤️ سؤال حب, 😂 ضحك | 1 |
| 🧠 قدّاش نعرفك, 🎭 موقف, 🔥 جريء, 💭 عميق, 💑 علاقتنا | 2 |
| 🎯 مهمّة | 3 |

- 🧠 : « جاوبتوا كيف كيف؟ » → **إيه** = 2 pts pour les deux, **لا** = 1 pt pour celui qui a tiré.
- 🎯 : « ما نجّمتش » = 0 point.
- **بدّل الكارت** : jusqu'à 3 fois par carte, dans la même catégorie, sans pénalité.

### Cartes spéciales (12 % des tirages)

| Carte | Effet réel dans le code |
|---|---|
| 🎲 **DOUBLE** | La carte suivante vaut ×2, le joueur rejoue immédiatement |
| 🔄 **SWITCH** | Le tour passe tout de suite au partenaire |
| ❤️ **COUPLE BONUS** | Une vraie question est tirée en plus ; les deux marquent |
| 😂 **CHAOS** | Deux missions différentes, une par joueur, nommées ; 3 pts chacun |

### Fin de partie

Verdict calculé sur le ratio points obtenus / points possibles :

- ≥ 70 % → 🔥 « الكيمياء بيناتكم قوية! »
- ≥ 45 % → 💘 « تعرفوا بعضكم برشة! »
- sinon → 😂 « يلزمكم شوية وقت باش تفهموا بعضكم »

---

## 4. Architecture technique

```
Navigateur A ─┐                        ┌─ rooms (Map en mémoire)
              ├── WebSocket (Socket.IO) ┤   code, joueurs, tour, carte, score
Navigateur B ─┘         Node.js         └─ Dealer : pioches mélangées par catégorie
```

**Le serveur fait autorité.** Il tire les cartes, valide le tour, calcule les
points, puis diffuse l'état complet aux deux clients via l'événement `state`.
Le client ne fait qu'afficher — il ne peut ni inventer une carte ni s'attribuer
des points.

### Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Express (statique + `/api/*`) et toute l'API Socket.IO |
| `lib/rooms.js` | Rooms, tours, score, effets spéciaux, TTL et GC |
| `lib/cards.js` | Chargement des cartes, `Dealer` (pioches anti-répétition) |
| `data/*.js` | Les 562 cartes, rangées par catégorie et par niveau |
| `public/` | `index.html`, `style.css`, `app.js` (aucun build, aucun framework) |
| `test/e2e.js` | Deux clients Socket.IO qui jouent une partie complète |

### Événements Socket.IO

| Client → serveur | Effet |
|---|---|
| `room:create {name}` | Crée la room, renvoie `{code, playerId, state}` |
| `room:join {code, name}` | Rejoint (2 joueurs max) |
| `room:rejoin {code, playerId}` | Restaure la session après rechargement |
| `room:settings {settings}` | Catégories / longueur (créateur uniquement) |
| `game:start` · `game:restart` · `game:end` | Cycle de la partie |
| `card:draw` · `card:swap` · `card:resolve {result}` | Cartes |
| `turn:pass` | Passe la main |
| `nudge` | Petite vibration chez le partenaire |

| Serveur → client | Contenu |
|---|---|
| `state` | État complet de la partie (joueurs, tour, carte, score, historique) |
| `fx` | `confetti`, `end`, `nudge` |

### Anti-répétition

Chaque partie instancie un `Dealer` : une pioche mélangée (Fisher-Yates) par
catégorie. Une carte n'est retirée qu'une fois **toute** sa catégorie épuisée —
100 questions 🧠 avant de revoir la première.

### Persistance et limites (assumées)

- Les rooms vivent **en mémoire**, avec TTL de 6 h et nettoyage toutes les 15 min.
- Un redémarrage du serveur (ou une mise en veille Render) efface les parties en cours.
- Le rechargement d'une page, lui, est géré : `playerId` est gardé en `localStorage`
  et `room:rejoin` restaure la partie. La bannière « الكونيكسيون طاحت » s'affiche
  pendant une coupure, et Socket.IO reconnecte automatiquement.
- Pour survivre aux redémarrages, remplacer la `Map` de `lib/rooms.js` par Redis
  (`SET room:CODE`) suffirait : toute la logique passe déjà par ce seul module.

---

## 5. Personnaliser le contenu

Chaque fichier de `data/` exporte `{ easy, medium, hard }` — de simples tableaux
de chaînes. Ajouter une carte = ajouter une ligne, puis redémarrer le serveur.

```js
// data/love.js
module.exports = {
  easy: [
    'شنوة أول حاجة شدّت انتباهك فيّا؟',
    'كارت جديد متاعك هنا…',   // ← ajoute ici
  ],
  ...
};
```

Le niveau (`easy` / `medium` / `hard`) s'affiche en ★ sur la carte.
Les points par catégorie se règlent dans `CATEGORIES`, en haut de `lib/cards.js`.

La catégorie 🔥 **جريء est désactivée par défaut** ; le créateur de la partie
l'active depuis le lobby.

---

## 6. Contenu livré

| Catégorie | Cartes |
|---|---|
| 🧠 قدّاش نعرفك | 100 |
| 💑 علاقتنا | 100 |
| 🎭 مواقف | 65 |
| ❤️ سؤال حب | 60 |
| 🎯 مهمّة (à distance) | 55 |
| 😂 ضحك | 55 |
| 💭 عميق | 55 |
| 🔥 جريء | 52 |
| 🎲 خاصة | 20 |
| **Total** | **562** |

Zéro doublon (vérifié), zéro texte factice.

Licence MIT — fais-en ce que tu veux. ❤️

---

# 🎮 Game Hub — 10 ألعاب

Depuis la v2, l'application n'est plus un seul jeu de cartes mais une **plateforme
privée de jeux de couple**. Le parcours est :

```
نعمل Partie → نشاركو الكود → الشريك يدخل → Lobby → 🎮 Game Hub
   → نختارو لعبة → الشريك يوافق → الزوز Ready → نلعبو → 🏆 نتيجة
   → لعبة أخرى / نعاودو / stats الsession
```

Les deux joueurs restent **dans la même Room** pour toute la session, et le score
est **global** : tous les jeux alimentent le même total.

## Les jeux

| # | Jeu | Comment ça marche | Points |
|---|---|---|---|
| ❤️ | نعرفك قدّاش؟ | 562 cartes, tours alternés, cartes spéciales | 1–3 |
| 🧠 | شكون يعرف الآخر أكثر؟ | L'un répond sur lui-même, l'autre devine — réponses cachées | 2 |
| 💭 | تختار شنوّة؟ (Would You Rather) | Choix simultané, révélation après les deux réponses | 1 |
| 😂 | مين فينا؟ | Chacun vote : toi / moi / les deux | 1 |
| 🔮 | Guess My Answer | Question ouverte, l'autre devine la vraie réponse | 2 |
| 📸 | Memories Challenge | Les deux racontent le même souvenir, on compare | 2 |
| 🎯 | Truth or Challenge | Truth (+1) ou Challenge (+3), à son tour | 1 / 3 |
| ⏱️ | Speed Challenge | « أذكر 3 حاجات » avec compte à rebours 5–30 s | 0–3 |
| 🧩 | Puzzle متاعنا | Votre photo découpée en 9/16/25/36, résolue à deux en temps réel | 3 / perf |
| 🎨 | Draw & Guess | Canvas partagé live, 60 s, points selon la rapidité | 1–3 |

## Ready system

Un joueur propose un jeu → l'autre reçoit « X يحب يلعب … موافق؟ » → une fois
accepté, chacun appuie sur **أنا جاهز ❤️**. Le jeu ne démarre que quand les deux
sont prêts (vérifié côté serveur).

## Secrets

Chaque joueur reçoit **sa propre version** de l'état : les réponses de l'autre et
le mot à dessiner sont retirés côté serveur avant l'envoi (`maskGame`). Rien de
secret ne transite avant le moment de la révélation.

## Puzzle : la photo

La photo est réduite à 900 px et compressée en JPEG dans le navigateur, puis
transmise par WebSocket à l'autre joueur et gardée en mémoire du serveur le temps
de la partie. Elle n'est écrite sur aucun disque et disparaît à la fin de la session.

## Badges et statistiques

9 badges se débloquent automatiquement (Perfect Match, Mind Reader, Puzzle Masters,
Artist, Speed Couple, Love Birds, Chemistry, Duo de Clowns, Couple Champion).
À la fin de la session : score, nombre de jeux, réponses identiques, bonnes
prédictions, missions réussies, puzzles, dessins devinés, meilleur jeu, et un
verdict ludique — **présenté explicitement comme un jeu, pas une analyse psychologique**.

## Contenu total : 1 468 éléments

| Source | Éléments |
|---|---|
| Cartes نعرفك قدّاش | 562 |
| شكون يعرف الآخر | 100 |
| Would You Rather | 100 |
| مين فينا | 100 |
| Guess My Answer | 100 |
| Truth | 100 |
| Challenge | 100 |
| Memories | 55 |
| Speed | 101 |
| Mots à dessiner | 150 |

## Architecture des modules

```
lib/games.js      # catalogue + moteurs : duel, tor, speed, puzzle, draw
lib/rooms.js      # room, hub, ready, score global, badges, stats
data/games/*.js   # contenu de chaque jeu (un fichier = un jeu)
public/app.js     # Hub, rendu par moteur, canvas, puzzle, timers
```

Ajouter un jeu = ajouter son contenu dans `data/games/`, son entrée dans `GAMES`
et son cas dans `gameAction` + une fonction de rendu côté client. Les autres jeux
ne bougent pas.

## Tests

```bash
npm start      # terminal 1
npm test       # terminal 2 : lance les deux suites
```

`test/e2e.js` couvre la room et le jeu de cartes.
`test/e2e-games.js` fait jouer deux vrais clients aux 10 jeux et vérifie
notamment que rien de secret ne fuite avant la révélation.
