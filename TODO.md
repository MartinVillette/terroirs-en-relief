# TODO — Wine Geometry Viz

## 🗺️ Découpage par zones viticoles (feedback jury)
> *"Le découpage administratif n'est pas très pertinent → zones viticoles ?"*

- [ ] Utiliser le shapefile AOC déjà disponible (`2026-01-06-delim-parcellaire-aoc-shp`) comme fond de carte alternatif
- [ ] Ajouter un toggle **"Départements / Zones viticoles"** sur les cartes choroplèthes
- [ ] Dissoudre les polygones AOC par grande région viticole (Bordeaux, Bourgogne, Alsace, Vallée du Rhône, etc.)
- [ ] Créer une table de correspondance `département → région viticole` pour colorier les départements par appartenance viticole

---

## 📊 Vue synthèse "toutes les cartes" (feedback jury)
> *"Essayer de mettre un mode avec toutes les cartes côté à côté"*

- [x] Ajouter un onglet **"Vue synthèse"** affichant les 4 cartes en grille 2×2 :
  - Production / Rendement
  - Ensoleillement
  - Pente
  - Altitude
- [x] Synchroniser la sélection de département entre toutes les cartes de la vue synthèse
- [x] Adapter la taille des cartes pour tenir dans la fenêtre (réduire `widthMap` et `heightMap`)

---

## 📈 Expliquer les rendements (feedback jury)
> *"Essayer d'expliquer rendements, etc."*

- [ ] Afficher le **coefficient de corrélation r** sur le scatterplot de l'onglet Impact
- [ ] Générer une **phrase d'interprétation automatique** :
  *"Les départements avec plus de X h/an d'ensoleillement ont en moyenne Y hl/ha de plus"*
- [ ] Ajouter des **seuils de référence** sur les graphiques (ex : 2000 h/an = seuil de maturation du raisin)
- [ ] Ajouter une **évaluation qualitative** dans la fact box : 🟢 Favorable / 🟡 Moyen / 🔴 Défavorable par rapport à la moyenne nationale