import geopandas as gpd
import pandas as pd
import numpy as np
import os
import json

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

PARQUET_PATH       = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")
SHAPEFILE_AOC_DIR  = os.path.join(RAW_DATA_DIR, "2026-01-06-delim-parcellaire-aoc-shp")
SHAPEFILE_AOC      = os.path.join(SHAPEFILE_AOC_DIR, "2026-01-06_delim-parcellaire-aoc-shp.shp")
PRODUCTION_CSV_PATH = os.path.join(RAW_DATA_DIR, "production_vins_2024_clean.csv")

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# ==============================================================================
# HELPERS
# ==============================================================================

def weighted_mean(values, weights):
    """Weighted arithmetic mean, ignoring NaN."""
    mask = ~(np.isnan(values) | np.isnan(weights))
    v, w = values[mask], weights[mask]
    if w.sum() == 0:
        return np.nan
    return np.average(v, weights=w)

def weighted_circular_mean(angles_deg, weights):
    """
    Correct weighted mean for circular/angular data (0–360°).
    Uses atan2(mean(sin), mean(cos)) weighted by parcel area.
    Plain arithmetic mean is wrong for angles:
      e.g. mean(1°, 359°) should be 0° (North), not 180° (South).
    """
    mask = ~(np.isnan(angles_deg) | np.isnan(weights))
    a, w = np.deg2rad(angles_deg[mask]), weights[mask]
    if w.sum() == 0:
        return np.nan
    mean_sin = np.average(np.sin(a), weights=w)
    mean_cos = np.average(np.cos(a), weights=w)
    result   = np.rad2deg(np.arctan2(mean_sin, mean_cos))
    return result % 360  # ensure 0–360°

def weighted_agg(group, weight_col):
    """Aggregate one group with area-weighted stats."""
    w = group[weight_col].values.astype(float)
    return pd.Series({
        'pente'      : weighted_mean(group['pente_mean'].values.astype(float), w),
        'altitude'   : weighted_mean(group['alt_mean'].values.astype(float),   w),
        'exposition' : weighted_circular_mean(group['expo_mean'].values.astype(float), w),
        'nb_parcelles': len(group),
        'surface_ha' : w.sum() / 10_000,   # m² → ha
    })

# ==============================================================================
# ÉTAPE 1 : CHARGEMENT DES DONNÉES
# ==============================================================================
print("1. Chargement et nettoyage des données...")

col_nom_aoc = 'app'
aoc_gdf = gpd.read_file(SHAPEFILE_AOC)
aoc_gdf = aoc_gdf[[col_nom_aoc, 'geometry']]
if aoc_gdf.crs is None:
    aoc_gdf.set_crs("EPSG:2154", inplace=True)
else:
    aoc_gdf = aoc_gdf.to_crs("EPSG:2154")

df_topo = pd.read_parquet(PARQUET_PATH)
df_points = df_topo[[
    'mf_lambx', 'mf_lamby',
    'pente_mean', 'alt_mean', 'expo_mean',
    'id_parcel', 'dep_parc'
]].copy()
df_points = df_points.dropna(subset=['mf_lambx', 'mf_lamby', 'dep_parc'])

# Coordinates
df_points['x_m'] = df_points['mf_lambx'] * 100
df_points['y_m'] = df_points['mf_lamby'] * 100

points_gdf = gpd.GeoDataFrame(
    df_points,
    geometry=gpd.points_from_xy(df_points['x_m'], df_points['y_m']),
    crs="EPSG:27572"
).to_crs("EPSG:2154")

# ==============================================================================
# ÉTAPE 2 : JOINTURE SPATIALE AVEC LES ZONES AOC
# ==============================================================================
print("2. Jointure spatiale avec les zones AOC...")

aoc_buffered          = aoc_gdf.copy()
aoc_buffered['geometry'] = aoc_gdf.geometry.buffer(50)

# Also compute parcel area from the AOC polygon for weighting
aoc_buffered['area_m2'] = aoc_buffered.geometry.area

vignes_in_aoc = gpd.sjoin(points_gdf, aoc_buffered, how="inner", predicate="within")
print(f"   -> {len(vignes_in_aoc)} correspondances trouvées.")

# Fallback nearest for departments with no match
matched_deps = set(vignes_in_aoc['dep_parc'].dropna().astype(str).str.zfill(2).unique())
all_deps     = set(df_points['dep_parc'].dropna().astype(str).str.zfill(2).unique())
missing_deps = all_deps - matched_deps

if missing_deps:
    print(f"   -> Départements sans correspondance : {sorted(missing_deps)}, tentative nearest...")
    missing_points = points_gdf[points_gdf['dep_parc'].astype(str).str.zfill(2).isin(missing_deps)]
    fallback = gpd.sjoin_nearest(missing_points, aoc_gdf[[ col_nom_aoc, 'geometry']], how="inner", max_distance=500)
    fallback['area_m2'] = fallback.geometry.area   # point area as fallback weight (equal weight)
    vignes_in_aoc = pd.concat([vignes_in_aoc, fallback], ignore_index=True)
    print(f"   -> Total après fallback : {len(vignes_in_aoc)} correspondances.")

# Drop duplicate parcels (a parcel matched to multiple AOC zones → keep first)
vignes_uniques = vignes_in_aoc.drop_duplicates(subset='id_parcel').copy()
vignes_uniques['code_dep'] = vignes_uniques['dep_parc'].astype(str).str.zfill(2)

# Use area_m2 as weight; fill missing with median area
median_area = vignes_uniques['area_m2'].median()
vignes_uniques['area_m2'] = vignes_uniques['area_m2'].fillna(median_area).clip(lower=1)

print(f"   -> {vignes_uniques['code_dep'].nunique()} départements avec données viticoles AOC.")

# ==============================================================================
# ÉTAPE 3 : EXPORT PAR APPELLATION (area-weighted)
# ==============================================================================
print("3. Génération : par appellation...")

df_app = (
    vignes_uniques
    .groupby(col_nom_aoc, group_keys=False)
    .apply(lambda g: weighted_agg(g, 'area_m2'))
    .reset_index()
    .rename(columns={col_nom_aoc: 'appellation'})
)

csv_app = os.path.join(PROCESSED_DATA_DIR, "topo_par_appellation.csv")
df_app.to_csv(csv_app, index=False)
print(f"   [OK] {csv_app}  ({len(df_app)} appellations)")

# ==============================================================================
# ÉTAPE 4 : EXPORT PAR DÉPARTEMENT (area-weighted)
# ==============================================================================
print("4. Génération : par département...")

df_dep = (
    vignes_uniques
    .groupby('code_dep', group_keys=False)
    .apply(lambda g: weighted_agg(g, 'area_m2'))
    .reset_index()
)

csv_dep = os.path.join(PROCESSED_DATA_DIR, "topo_par_departement.csv")
df_dep.to_csv(csv_dep, index=False)
print(f"   [OK] {csv_dep}  ({len(df_dep)} départements)")

# ==============================================================================
# ÉTAPE 5 : EXPORT APPELLATIONS PAR DÉPARTEMENT (JSON)
# ==============================================================================
print("5. Génération : appellations par département (JSON)...")

aoc_par_dept = (
    vignes_uniques
    .groupby('code_dep')[col_nom_aoc]
    .apply(lambda x: sorted(x.dropna().unique()))
    .to_dict()
)

json_aoc_dept = os.path.join(PROCESSED_DATA_DIR, "aop_par_departement.json")
with open(json_aoc_dept, 'w', encoding='utf-8') as f:
    json.dump(aoc_par_dept, f, ensure_ascii=False, indent=2)
print(f"   [OK] {json_aoc_dept}  ({len(aoc_par_dept)} départements)")

print("=" * 30)
print("TRAITEMENT TERMINÉ")