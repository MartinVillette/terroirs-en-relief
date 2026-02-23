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
# ÉTAPE 1 : PRÉPARATION SPATIALE
# ==============================================================================
print("1. Chargement et Nettoyage des données...")

col_nom_aoc = 'app'
aoc_gdf = gpd.read_file(SHAPEFILE_AOC)
aoc_gdf = aoc_gdf[[col_nom_aoc, 'geometry']]
if aoc_gdf.crs is None:
    aoc_gdf.set_crs("EPSG:2154", inplace=True)
else:
    aoc_gdf = aoc_gdf.to_crs("EPSG:2154")

df_topo = pd.read_parquet(PARQUET_PATH)
df_points = df_topo[['mf_lambx', 'mf_lamby', 'pente_mean', 'alt_mean', 'expo_mean', 'id_parcel', 'dep_parc']].copy()
df_points = df_points.dropna(subset=['mf_lambx', 'mf_lamby', 'dep_parc'])
df_points['x_m'] = df_points['mf_lambx'] * 100
df_points['y_m'] = df_points['mf_lamby'] * 100

points_gdf = gpd.GeoDataFrame(
    df_points,
    geometry=gpd.points_from_xy(df_points['x_m'], df_points['y_m']),
    crs="EPSG:27572"
).to_crs("EPSG:2154")

# ==============================================================================
# ÉTAPE 2 : JOINTURE SPATIALE
# ==============================================================================
print("2. Jointure Spatiale...")

aoc_buffered = aoc_gdf.copy()
aoc_buffered['geometry'] = aoc_gdf.geometry.buffer(50)

vignes_in_aoc = gpd.sjoin(points_gdf, aoc_buffered, how="inner", predicate="within")
print(f"   -> {len(vignes_in_aoc)} correspondances trouvées.")

# Fallback nearest pour les départements sans correspondance
matched_deps = set(vignes_in_aoc['dep_parc'].dropna().astype(str).str.zfill(2).unique())
all_deps = set(df_points['dep_parc'].dropna().astype(str).str.zfill(2).unique())
missing_deps = all_deps - matched_deps

if missing_deps:
    print(f"   -> Départements sans correspondance : {sorted(missing_deps)}, tentative nearest...")
    missing_points = points_gdf[points_gdf['dep_parc'].astype(str).str.zfill(2).isin(missing_deps)]
    fallback = gpd.sjoin_nearest(missing_points, aoc_gdf, how="inner", max_distance=500)
    vignes_in_aoc = pd.concat([vignes_in_aoc, fallback], ignore_index=True)
    print(f"   -> Total : {len(vignes_in_aoc)} correspondances.")

# ==============================================================================
# ÉTAPE 3 : EXPORT PAR APPELLATION
# ==============================================================================
print("3. GÉNÉRATION : PAR APPELLATION")

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
# ÉTAPE 4 : EXPORT PAR DÉPARTEMENT
# ==============================================================================
print("4. GÉNÉRATION : PAR DÉPARTEMENT")

vignes_uniques = vignes_in_aoc.drop_duplicates(subset='id_parcel').copy()
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