# Assistant PO — ISO/IEC/IEEE 29148

Application Next.js permettant à un Product Owner de coller ou d'importer un besoin
exprimé de façon informelle, puis de le faire reformuler par Claude (Anthropic) en
exigences structurées conformes à la norme **ISO/IEC/IEEE 29148** (nécessaire, non
ambiguë, complète, singulière, faisable, vérifiable, correcte).

## Fonctionnalités

- Zone **« Texte à reformuler »** : saisie libre ou collage de texte.
- Import de document **.txt / .docx / .pdf** (le texte est extrait et déposé dans la
  zone de saisie).
- Bouton **Reformuler** (actif uniquement si du texte est présent) qui appelle l'API
  Claude et affiche le résultat structuré (REQ-001, REQ-002…) dans un second panneau.
- Résultat **modifiable** avant export.
- Export du résultat en **.docx** ou **.pdf**.

## Prérequis

- Node.js 18.18 ou supérieur
- Une clé API Anthropic : https://console.anthropic.com/settings/keys

## Installation locale

```bash
npm install
cp .env.example .env.local
# Renseignez ANTHROPIC_API_KEY dans .env.local
npm run dev
```

L'application est alors disponible sur http://localhost:3000.

## Déploiement sur Vercel

1. Poussez ce projet sur un dépôt Git (GitHub, GitLab…).
2. Sur [vercel.com](https://vercel.com), cliquez sur **Add New → Project** et
   importez le dépôt.
3. Vercel détecte automatiquement le framework Next.js, aucune configuration
   supplémentaire n'est nécessaire.
4. Dans **Settings → Environment Variables**, ajoutez :
   - `ANTHROPIC_API_KEY` = votre clé API Anthropic
5. Déployez. Les routes `/api/reformulate`, `/api/import` et `/api/export`
   s'exécutent en tant que fonctions serverless Node.js.

## Structure du projet

```
app/
  layout.tsx              Layout racine (polices, métadonnées)
  page.tsx                Interface principale (client component)
  globals.css             Système de design
  api/
    reformulate/route.ts  Appel à l'API Claude, reformulation ISO 29148
    import/route.ts       Extraction de texte (.txt / .docx / .pdf)
    export/route.ts       Génération du fichier d'export (.docx / .pdf)
```

## Personnaliser le comportement de reformulation

Le prompt système qui pilote la reformulation se trouve dans
`app/api/reformulate/route.ts` (constante `SYSTEM_PROMPT`). Vous pouvez l'ajuster
pour :
- changer le gabarit des identifiants d'exigences (ex. `EXG-` au lieu de `REQ-`) ;
- ajouter des sections spécifiques à votre organisation (contraintes réglementaires,
  critères d'acceptation, etc.) ;
- adapter le niveau de détail attendu.

## Limitation de débit

La route `/api/reformulate` (celle qui appelle l'API Claude et engendre un
coût) est protégée par un compteur en mémoire, par adresse IP :
**8 reformulations / 10 minutes** par défaut. Au-delà, l'utilisateur reçoit
une erreur explicite lui indiquant dans combien de temps réessayer.

Ces valeurs sont ajustables via les variables d'environnement
`RATE_LIMIT_MAX` et `RATE_LIMIT_WINDOW_MS` (en millisecondes), sans toucher
au code.

⚠️ Cette protection est volontairement simple ("best effort") : le compteur
est stocké en mémoire dans la fonction serverless, il est donc réinitialisé
à chaque cold start et n'est pas partagé entre toutes les instances que
Vercel peut faire tourner en parallèle sous forte charge. Elle suffit à
freiner un usage abusif classique (spam du bouton, script naïf), mais
n'offre pas une garantie stricte contre un abus distribué à grande échelle.
Pour une limite fiable à 100 %, il faudrait un stockage externe partagé
(Upstash Redis, Vercel KV...).

## Tests

Deux niveaux de tests sont en place :

**Tests unitaires (Vitest)** — logique métier (`lib/`) et routes API
(`/api/reformulate`, `/api/import`, `/api/export`), avec l'API Claude
mockée (aucun coût, aucune clé réelle nécessaire) :

```bash
npm test
```

**Tests end-to-end (Playwright)** — parcours utilisateur complet dans un
vrai navigateur (saisie → reformulation → score → Gherkin → historique →
export), avec les appels réseau vers `/api/reformulate` et `/api/export`
interceptés et mockés au niveau du navigateur :

```bash
npx playwright install --with-deps chromium   # une seule fois
npm run test:e2e
```

Un workflow GitHub Actions (`.github/workflows/ci.yml`) exécute
automatiquement le build, les tests unitaires puis les tests end-to-end à
chaque push sur `main` et sur chaque pull request.

## Limites connues

- L'import PDF ne fonctionne que sur des PDF contenant du texte sélectionnable
  (pas de reconnaissance optique de caractères pour les documents scannés).
- La qualité de la reformulation dépend de la clarté du texte source : les points
  ambigus sont signalés par `[À clarifier : ...]` plutôt que d'être devinés.
