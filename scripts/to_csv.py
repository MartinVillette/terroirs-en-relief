import geopandas as gpd
import pandas as pd
import os

# ============================================
# CONFIGURATION DES CHEMINS (alignée avec prepare_data.py)
# ============================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")

SHAPEFILE_DIR = os.path.join(RAW_DATA_DIR, "RPG_2-2__SHP_LAMB93_R44_2023-01-01")
SHAPEFILE_PATH = os.path.join(SHAPEFILE_DIR, "PARCELLES_GRAPHIQUES.shp")
PARQUET_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")

SHAPEFILE_CSV_PATH = os.path.join(RAW_DATA_DIR, "PARCELLES_GRAPHIQUES.csv")
PARQUET_CSV_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.csv")

# ============================================
# 1. CHARGEMENT DES DONNÉES
# ============================================
print("📂 Chargement du Shapefile IGN...")
geom = gpd.read_file(SHAPEFILE_PATH)
print(f"✅ {len(geom)} parcelles chargées")

print("\n📂 Chargement des données Sol & Climat (Parquet)...")
topo = pd.read_parquet(PARQUET_PATH)
print(f"✅ {len(topo)} parcelles avec données topographiques")

# ============================================
# 2. EXPORT CSV (data/raw)
# ============================================
print("\n💾 Export CSV...")

# GeoDataFrame -> CSV (géométrie en WKT)
geom_csv = geom.copy()
geom_csv["geometry"] = geom_csv["geometry"].astype("string")
geom_csv.to_csv(SHAPEFILE_CSV_PATH, index=False)
print(f"✅ Shapefile exporté: {SHAPEFILE_CSV_PATH}")

# DataFrame -> CSV
topo.to_csv(PARQUET_CSV_PATH, index=False)
print(f"✅ Parquet exporté: {PARQUET_CSV_PATH}")

print("\n✅ Conversion terminée!")