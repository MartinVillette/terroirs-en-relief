import geopandas as gpd
import pandas as pd
import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

SHAPEFILE_PATH = os.path.join(RAW_DATA_DIR, "RPG_2-2__SHP_LAMB93_R44_2023-01-01", "PARCELLES_GRAPHIQUES.shp")
PARQUET_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

print("Chargement des fichiers...")
geom = gpd.read_file(SHAPEFILE_PATH)
topo = pd.read_parquet(PARQUET_PATH)

print("Fusion (Jointure)...")
merged = geom.merge(topo, left_on='ID_PARCEL', right_on='id_parcel', how='inner')

print("Filtrage des vignes...")
vignes = merged[merged['CODE_CULTU'].isin(['VRC', 'VRT'])].copy()

print("Nettoyage des codes départements...")
vignes['dep_parc'] = vignes['dep_parc'].astype(str).str.zfill(2)

print("Calcul des moyennes par département...")
df_agg = vignes.groupby('dep_parc').agg({
    'alt_mean': 'mean',    # Moyenne de l'altitude
    'pente_mean': 'mean',  # Moyenne de la pente
    'expo_mean': 'mean',   # Moyenne de l'exposition
    'SURF_PARC': 'sum'     # Somme des surfaces (pour info)
}).reset_index()

df_agg = df_agg.rename(columns={
    'dep_parc': 'code_dep',
    'alt_mean': 'altitude',
    'pente_mean': 'pente',
    'expo_mean': 'exposition',
    'SURF_PARC': 'surface_rpg_ha'
})

output_csv = os.path.join(PROCESSED_DATA_DIR, "topo_vignes_par_departement.csv")
df_agg.to_csv(output_csv, index=False)

print(f"SUCCÈS ! Fichier généré : {output_csv}")
print(f"Nombre de départements trouvés : {len(df_agg)}")
print(df_agg.head())