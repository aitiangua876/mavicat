<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**Un workspace de base de données desktop, open source, pour celles et ceux qui vivent dans SQL.**

[Site web](https://mavicat.kailingteck.com/) · [Releases](https://github.com/chenlong/Mavicat/releases) · [Issues](https://github.com/chenlong/Mavicat/issues) · [Contribuer](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/Site-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?logo=tauri)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Stars](https://img.shields.io/github/stars/chenlong/Mavicat?style=social)](https://github.com/chenlong/Mavicat/stargazers)

<p>
  <strong>README:</strong>
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.de.md">Deutsch</a> |
  <a href="./README.es.md">Español</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.it.md">Italiano</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.ru.md">Русский</a>
</p>
</div>

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

Mavicat transpose les workflows familiers des clients de bases de données professionnels dans une application moderne, locale et extensible. Elle est construite avec Tauri v2, Rust, React et TypeScript pour offrir une coque native, une logique backend solide et une interface rapide.

Si le projet vous plaît, une étoile aide beaucoup à le rendre visible et à soutenir sa roadmap open source.

## Pourquoi Mavicat ?

- **Un workspace pour le quotidien** : connexions, schémas, SQL, résultats, édition de données, design de tables, export, backup, synchronisation, migration, Redis et IA.
- **UX desktop familière** : arbre de connexions compact, vues objet, onglets, panneaux de résultats, menus contextuels et assistants.
- **Local-first** : profils, historique, préférences et configuration IA restent locaux par défaut.
- **Rust + React** : Rust pour la base de données et l'intégration système, React pour l'éditeur et les grilles riches.
- **Ouvert et extensible** : licence Apache-2.0, construit sur la base Tabularis.

## Bases supportées

| Base | Statut |
|---|---|
| MySQL / MariaDB | Actif |
| PostgreSQL | Actif |
| SQLite | Actif |
| SQL Server | Actif |
| Redis | Actif, navigation et édition des clés en amélioration |
| Oracle | Prévu, hors du jalon actuel |

## Points forts

### Workspace de base de données

- Arbre latéral avec états de connexion, base et tables.
- Page objets pour chaque base, avec vues liste et icônes.
- Actions par clic droit sur connexions, bases, tables et résultats.
- Interface multi-onglets pensée pour les longues sessions.

### Éditeur SQL

- Monaco Editor avec formatage, historique, exécution de sélection ou de script complet, et multi-résultats.
- Sélection de connexion et de base par onglet.
- Ctrl-clic sur un objet pour ouvrir les données de table.
- Assistant IA par fenêtre de requête : écrire, expliquer, optimiser et insérer du SQL; les écritures demandent confirmation.

### Grille de données

- Export de la page courante, de tous les résultats filtrés ou de toutes les données.
- CSV, JSON, Excel et SQL.
- Visibilité des colonnes, pagination, copie en SQL et workflows de résultats.
- En cours : édition plus sûre avec prévisualisation, commit/rollback, annulation et erreurs mieux localisées.

### Designer de table

- Champs, clés primaires, index, aperçu SQL et DDL.
- Objectif : une surface robuste pour le travail quotidien sur les schémas.

### Import, export, backup, migration

- Assistants cohérents pour export, import, backup, fichiers SQL, schema sync et transfert de données.
- Dictionnaire de base en HTML, Excel et Markdown.
- Diff de schéma avec preview SQL avant exécution.
- Migration inter-base avec mapping de champs et conversion prudente des types.

### Redis

- Redis dans le même workspace.
- Navigation hiérarchique, recherche par préfixe, affichage, édition et suppression sont en amélioration.

## Télécharger

- [Site officiel](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/chenlong/Mavicat/releases)

Mavicat vise macOS, Windows et Linux. Les artefacts disponibles peuvent varier selon les jalons.

## Développement

```bash
pnpm install
pnpm tauri dev
```

Build :

```bash
pnpm tauri build
```

Checks :

```bash
pnpm run build
pnpm test
cd src-tauri && cargo test
```

## Stack

- Tauri v2
- Rust, SQLx, Tiberius, Redis client
- React 19, TypeScript, Vite, Tailwind CSS
- Monaco Editor
- TanStack Table / virtualisation
- XYFlow

## Roadmap

- **P0** : édition sûre, meilleure exécution SQL, états de connexion stables, erreurs claires.
- **P1** : import/export, schema sync, transfert de données, backup/restore avec progression et annulation.
- **P2** : designer de tables, ER diagrams, dictionnaire, commentaires, index, clés étrangères, triggers.
- **P3** : assistants unifiés, sidebar compacte, menus complets, meilleur feedback sur les tâches longues.

## Contribuer

Issues, reproductions, feedback UI, cas spécifiques de bases, traductions et pull requests sont les bienvenus.

## Licence et notes

Mavicat est basé sur [Tabularis](https://github.com/TabularisDB/tabularis), sous Apache-2.0. Mavicat n'est pas affilié à Navicat, TablePlus, DataGrip, DBeaver ou aux autres produits mentionnés; ces noms décrivent uniquement des workflows connus.

[Apache License 2.0](./LICENSE)
