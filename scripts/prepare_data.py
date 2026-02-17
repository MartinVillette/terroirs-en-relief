import geopandas as gpd
import pandas as pd
import os

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

PARQUET_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")
SHAPEFILE_AOC_DIR = os.path.join(RAW_DATA_DIR, "2026-01-06-delim-parcellaire-aoc-shp")
SHAPEFILE_AOC = os.path.join(SHAPEFILE_AOC_DIR, "2026-01-06_delim-parcellaire-aoc-shp.shp")

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# ==============================================================================
# ÉTAPE 1 : PRÉPARATION SPATIALE (IDENTIFICATION DES VIGNES)
# ==============================================================================
print("1. Chargement et Nettoyage des données...")

# A. Chargement AOC (Le Filtre)
aoc_gdf = gpd.read_file(SHAPEFILE_AOC)
col_nom_aoc = 'app' # Nom de l'appellation
aoc_gdf = aoc_gdf[[col_nom_aoc, 'geometry']]
if aoc_gdf.crs is None:
    aoc_gdf.set_crs("EPSG:2154", inplace=True)
else:
    aoc_gdf = aoc_gdf.to_crs("EPSG:2154")

# B. Chargement Parquet (Les Terrains)
df_topo = pd.read_parquet(PARQUET_PATH)

# Conversion Coordonnées (Hectomètres -> Mètres)
# On garde 'dep_parc' pour l'agrégation départementale !
df_points = df_topo[['mf_lambx', 'mf_lamby', 'pente_mean', 'alt_mean', 'expo_mean', 'id_parcel', 'dep_parc']].copy()
df_points['x_reel'] = df_points['mf_lambx'] * 100
df_points['y_reel'] = df_points['mf_lamby'] * 100

# Création Géométrie (Lambert II -> Lambert 93)
points_gdf = gpd.GeoDataFrame(
    df_points, 
    geometry=gpd.points_from_xy(df_points.x_reel, df_points.y_reel),
    crs="EPSG:27572" 
).to_crs("EPSG:2154")

print("2. Jointure Spatiale (On ne garde que ce qui est dans une AOC)...")
# C'est ici qu'on filtre : tout ce qui n'est pas dans une AOC est supprimé.
vignes_in_aoc = gpd.sjoin(points_gdf, aoc_gdf, how="inner", predicate="within")

print(f"   -> {len(vignes_in_aoc)} correspondances trouvées (Parcelles x Appellations).")

# ==============================================================================
# ÉTAPE 2 : EXPORT PAR APPELLATION
# ==============================================================================
print("-" * 30)
print("3. GÉNÉRATION : PAR APPELLATION")
print("-" * 30)

# Ici, on garde les doublons (une parcelle peut être dans 2 AOC)
df_app = vignes_in_aoc.groupby(col_nom_aoc).agg({
    'pente_mean': 'mean',
    'alt_mean': 'mean',
    'expo_mean': 'mean',
    'id_parcel': 'count'
}).reset_index().rename(columns={
    col_nom_aoc: 'appellation',
    'pente_mean': 'pente',
    'alt_mean': 'altitude',
    'expo_mean': 'exposition',
    'id_parcel': 'nb_parcelles'
})

csv_app = os.path.join(PROCESSED_DATA_DIR, "topo_par_appellation.csv")
df_app.to_csv(csv_app, index=False)
print(f"   [OK] {csv_app}")

# ==============================================================================
# ÉTAPE 3 : EXPORT PAR DÉPARTEMENT (UNIQUEMENT VIGNES)
# ==============================================================================
print("-" * 30)
print("4. GÉNÉRATION : PAR DÉPARTEMENT (VIGNES UNIQUEMENT)")
print("-" * 30)

# CRUCIAL : On dédoublonne ! 
# Pour le département, une parcelle ne doit compter qu'une seule fois, 
# même si elle produit 3 vins différents.
vignes_uniques = vignes_in_aoc.drop_duplicates(subset='id_parcel')

print(f"   -> {len(vignes_uniques)} parcelles physiques uniques identifiées.")

# Nettoyage Code Dept
vignes_uniques['code_dep'] = vignes_uniques['dep_parc'].astype(str).str.zfill(2)

df_dep = vignes_uniques.groupby('code_dep').agg({
    'pente_mean': 'mean',
    'alt_mean': 'mean',
    'expo_mean': 'mean',
    'id_parcel': 'count'
}).reset_index().rename(columns={
    'pente_mean': 'pente',
    'alt_mean': 'altitude',
    'expo_mean': 'exposition',
    'id_parcel': 'nb_parcelles_vignes'
})

csv_dep = os.path.join(PROCESSED_DATA_DIR, "topo_par_departement.csv")
df_dep.to_csv(csv_dep, index=False)
print(f"   [OK] {csv_dep}")

print("=" * 30)
print("TRAITEMENT TERMINÉ")