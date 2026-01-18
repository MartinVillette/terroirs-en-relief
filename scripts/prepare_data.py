import geopandas as gpd
import pandas as pd
import os

# ============================================
# CONFIGURATION DES CHEMINS
# ============================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

SHAPEFILE_DIR = os.path.join(RAW_DATA_DIR, "RPG_2-2__SHP_LAMB93_R44_2023-01-01")
SHAPEFILE_PATH = os.path.join(SHAPEFILE_DIR, "PARCELLES_GRAPHIQUES.shp")
PARQUET_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")
OUTPUT_PATH = os.path.join(PROCESSED_DATA_DIR, "vignes.geojson")

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# ============================================
# 1. CHARGEMENT DES DONNÉES
# ============================================
print("📂 Chargement du Shapefile IGN...")
geom = gpd.read_file(SHAPEFILE_PATH)
print(f"✅ {len(geom)} parcelles chargées")

print("\n📂 Chargement des données Sol & Climat...")
topo = pd.read_parquet(PARQUET_PATH)
print(f"✅ {len(topo)} parcelles avec données topographiques")

# ============================================
# 2. FUSION DES DONNÉES
# ============================================
print("\n🔗 Fusion des données...")
shapefile_id_col = 'ID_PARCEL'
merged = geom.merge(topo, left_on=shapefile_id_col, right_on='id_parcel', how='inner')
print(f"✅ {len(merged)} parcelles après fusion")

# ============================================
# 3. FILTRAGE VIGNES + ALSACE
# ============================================
print("\n🍇 Filtrage des parcelles viticoles...")
vignes = merged[merged['CODE_CULTU'].isin(['VRC', 'VRT'])].copy()
print(f"✅ {len(vignes)} parcelles viticoles")

print("\n🗺️ Filtrage sur l'Alsace (67 + 68)...")
vignes = vignes[vignes['dep_parc'].isin(['67', '68'])].copy()
print(f"✅ {len(vignes)} parcelles viticoles en Alsace")

# ============================================
# 4. FILTRAGE GÉOGRAPHIQUE SUR LA ROUTE DES VINS
# ============================================
print("\n🍷 Filtrage sur les principales communes viticoles...")

# Liste des codes INSEE des communes de la Route des Vins d'Alsace
ROUTE_DES_VINS = [
    # Bas-Rhin (67) - Nord
    '67003',  # Andlau
    '67032',  # Barr
    '67084',  # Dambach-la-Ville
    '67372',  # Mittelbergheim
    '67482',  # Rosheim
    
    # Haut-Rhin (68) - Sud
    '67210',  # Obernai
    '68004',  # Ammerschwihr
    '68066',  # Bergheim
    '68112',  # Eguisheim
    '68162',  # Hunawihr
    '68228',  # Kaysersberg
    '68237',  # Mittelwihr
    '68338',  # Turckheim
    '68340',  # Riquewihr
    '68350',  # Ribeauvillé
    '68376',  # Sigolsheim
]

vignes_route = vignes[vignes['com_parc'].isin(ROUTE_DES_VINS)].copy()

if len(vignes_route) > 0:
    vignes = vignes_route
    print(f"✅ {len(vignes)} parcelles sur la Route des Vins")
else:
    print("⚠️ Aucune parcelle trouvée sur la Route, conservation de toute l'Alsace")

# ============================================
# 5. ÉCHANTILLONNAGE STRATIFIÉ PAR COMMUNE
# ============================================
MAX_PARCELLES = 10000 

if len(vignes) > MAX_PARCELLES:
    print(f"\n⚠️ Échantillonnage ({len(vignes)} → {MAX_PARCELLES} parcelles)...")
    
    # Compter les parcelles par commune
    parcelles_par_commune = vignes.groupby('com_parc').size()
    nb_communes = len(parcelles_par_commune)
    print(f"   📍 {nb_communes} communes viticoles")
    
    # Proportion à garder
    proportion = MAX_PARCELLES / len(vignes)
    
    # Échantillonner proportionnellement
    vignes_echantillonnees = []
    for commune, count in parcelles_par_commune.items():
        nb_a_garder = max(5, int(count * proportion))  # Min 5 parcelles par commune
        parcelles_commune = vignes[vignes['com_parc'] == commune]
        
        if len(parcelles_commune) > nb_a_garder:
            # Mix : 40% plus pentues + 60% aléatoires
            n_steep = max(2, int(nb_a_garder * 0.4))
            n_random = nb_a_garder - n_steep
            
            sorted_parcels = parcelles_commune.sort_values('pente_mean', ascending=False)
            steep = sorted_parcels.head(n_steep)
            remaining = sorted_parcels.iloc[n_steep:]
            random_parcels = remaining.sample(n=min(n_random, len(remaining)), random_state=42)
            
            vignes_echantillonnees.append(pd.concat([steep, random_parcels]))
        else:
            vignes_echantillonnees.append(parcelles_commune)
    
    vignes = pd.concat(vignes_echantillonnees).reset_index(drop=True)
    print(f"✅ {len(vignes)} parcelles sélectionnées")

# Afficher la distribution
distribution = vignes.groupby('com_parc').size().sort_values(ascending=False)
print(f"\n   📊 Distribution par commune (top 10):")
for commune, count in distribution.head(10).items():
    print(f"      - Code {commune}: {count} parcelles")

# ============================================
# 6. AJOUT DES NOMS DE COMMUNES
# ============================================
print("\n📍 Ajout des noms de communes...")

COMMUNES_ALSACE = {
    '67003': 'Andlau',
    '67032': 'Barr',
    '67084': 'Dambach-la-Ville',
    '67210': 'Obernai',
    '67372': 'Mittelbergheim',
    '67482': 'Rosheim',
    '68004': 'Ammerschwihr',
    '68066': 'Bergheim',
    '68112': 'Eguisheim',
    '68162': 'Hunawihr',
    '68228': 'Kaysersberg',
    '68237': 'Mittelwihr',
    '68338': 'Turckheim',
    '68340': 'Riquewihr',
    '68350': 'Ribeauvillé',
    '68376': 'Sigolsheim',
}

vignes['nom_commune'] = vignes['com_parc'].map(COMMUNES_ALSACE).fillna(vignes['com_parc'])
print(f"   ✅ Noms ajoutés pour {vignes['nom_commune'].notna().sum()} parcelles")

# ============================================
# 7. SÉLECTION DES COLONNES
# ============================================
print("\n⚙️ Sélection des colonnes...")

colonnes_utiles = [
    'geometry',
    'CODE_CULTU',
    'SURF_PARC',
    'pente_mean',
    'expo_mean',
    'alt_mean',
    'dep_parc',
    'com_parc',
    'nom_commune'
]

vignes = vignes[colonnes_utiles].copy()

# ============================================
# 8. REPROJECTION + SIMPLIFICATION AGRESSIVE
# ============================================
print("\n🌍 Reprojection en WGS84...")
vignes = vignes.to_crs("EPSG:4326")

print("⚙️ Simplification des géométries (tolérance: 0.0002)...")
# ⬆️ Tolérance augmentée pour réduire la complexité
vignes['geometry'] = vignes['geometry'].simplify(tolerance=0.0002, preserve_topology=True)

# ============================================
# 9. EXPORT
# ============================================
print(f"\n💾 Export vers {OUTPUT_PATH}...")
vignes.to_file(OUTPUT_PATH, driver="GeoJSON")

file_size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
print(f"✅ Export réussi!")
print(f"   📦 Taille: {file_size_mb:.2f} MB")

# ============================================
# 10. STATISTIQUES FINALES
# ============================================
print("\n📊 STATISTIQUES FINALES:")
print(f"   • Parcelles: {len(vignes)}")
print(f"   • Pente moyenne: {vignes['pente_mean'].mean():.1f}%")
print(f"   • Pente max: {vignes['pente_mean'].max():.1f}%")
print(f"   • Altitude moyenne: {vignes['alt_mean'].mean():.0f}m")
print(f"   • Altitude min/max: {vignes['alt_mean'].min():.0f}m / {vignes['alt_mean'].max():.0f}m")
print(f"   • Départements: {', '.join(sorted(vignes['dep_parc'].unique()))}")
print(f"   • Communes: {vignes['nom_commune'].nunique()}")

print(f"\n   🍇 Top 5 communes viticoles:")
top_communes = vignes.groupby('nom_commune').size().sort_values(ascending=False).head()
for commune, count in top_communes.items():
    print(f"      - {commune}: {count} parcelles")

if file_size_mb > 3:
    print(f"\n⚠️ ATTENTION: Fichier encore volumineux ({file_size_mb:.1f} MB)")
    print("   Conseil: Réduisez MAX_PARCELLES à 1000 ou filtrez sur moins de communes")
else:
    print(f"\n✅ Fichier optimisé pour le web ({file_size_mb:.1f} MB)")

print("\n✅ Traitement terminé!")