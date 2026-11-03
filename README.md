# Orange VPN v2.3.4 - Fast & Secure VPN Client 🛡️

[![Version](https://img.shields.io/badge/Version-2.3.4-orange)](https://github.com/meta-jeady/Freebaduc)
[![Flutter](https://img.shields.io/badge/Flutter-3.24+-02569B?logo=flutter)](https://flutter.dev)
[![Engine](https://img.shields.io/badge/Engine-Xray%20Core%20v1.2.0-FF7900)]()
[![Signature](https://img.shields.io/badge/Powered%20By-%40kcorp--tech-FF7900)]()

**Orange VPN v2.3.4** est une application VPN professionnelle et sécurisée conçue pour offrir une connexion fluide, rapide et chiffrée (VLESS, VMess, Trojan, SlowDNS, UDP).

---

## ✨ Nouveautés & Fonctionnalités Clés (v2.3.4)

1. **👤 Accueil & Nom de l'utilisateur obligatoire :**
   - À l'ouverture de l'application, un message de bienvenue personnalisé s'affiche et demande obligatoirement le nom de l'utilisateur pour activer son profil.

2. **📅 Notifications quotidiennes d'expiration du forfait :**
   - Alerte système chaque jour rappelant la date d'expiration de l'abonnement :
   > *"Cher [Nom], votre forfait Orange VPN expire le [Date] (dans X jours). Pensez à renouveler votre abonnement."*

3. **📊 Rappel automatique à 200 Mo de consommation :**
   - Dès que l'utilisateur franchit le seuil des 200 Mo, l'application déclenche instantanément une alerte système :
   > *"Cher [Nom], vous venez de consommer 200 Mo de votre forfait ! Il vous reste [X.XX Go]. Veuillez souscrire à nouveau après l'expiration."*

4. **📡 Canal de diffusion de notifications instantanées depuis GitHub :**
   - Vous pouvez envoyer des notifications à **tous les utilisateurs** de votre application directement en modifiant un simple fichier sur votre dépôt GitHub !
   - Fichier à modifier : `public/broadcast.json`
   - Modifiez l'attribut `"id"` et écrivez votre `"message"`, validez sur GitHub (commit/push), et tous les utilisateurs recevront l'alerte instantanément !

5. **🚀 Détection des nouvelles versions & Déploiement :**
   - Fichier manifest : `public/app-update.json`
   - Lorsque vous poussez une mise à jour sur GitHub (ex: v2.3.5), une popup s'affiche automatiquement chez les utilisateurs : *"Nouvelle version disponible ! Télécharger maintenant"*.

6. **📋 Configuration Automatique Instantanée :**
   - Bouton « Coller la configuration » : extrait automatiquement le Host, le Path et le Port depuis les liens VLESS, VMess ou Trojan.

---

## 📡 Comment envoyer une notification à tous les utilisateurs via GitHub

1. Rendez-vous sur votre dépôt GitHub : `meta-jeady/Freebaduc`
2. Ouvrez le fichier **`public/broadcast.json`**
3. Modifiez l'identifiant `"id"` (ex: `"msg-002"`) et votre texte :
```json
{
  "id": "msg-002",
  "timestamp": "2026-11-03T12:00:00Z",
  "priority": "high",
  "title": "Orange VPN • Info Importante",
  "message": "Nouveaux serveurs VIP activés pour tous les abonnés !",
  "actionLabel": "En savoir plus",
  "actionUrl": "https://github.com/meta-jeady/Freebaduc"
}
```
4. Cliquez sur **Commit changes** (Push).
5. C'est tout ! L'application interroge ce fichier en arrière-plan et déclenche la notification système sur les appareils de tous vos utilisateurs.

---

## 🚀 Comment déployer une nouvelle version

1. Ouvrez **`public/app-update.json`**
2. Mettez à jour `"currentVersion": "2.3.5"` et vos notes de version.
3. Dès que l'application détecte cette version supérieure à la 2.3.4, un pop-up proposera à tous vos utilisateurs de télécharger la nouvelle version.

---

## 🏗️ Build & Installation

### Web (React + Vite)
```bash
npm install
npm run build
```

### Android APK (Flutter)
```bash
flutter pub get
flutter build apk --release
```
L'APK se trouvera dans `build/app/outputs/flutter-apk/app-release.apk`.
