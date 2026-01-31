import geopandas as gpd
import pandas as pd
import os

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

SHAPEFILE_DIR = os.path.join(RAW_DATA_DIR, "RPG_2-2__SHP_LAMB93_R44_2023-01-01")
SHAPEFILE_PATH = os.path.join(SHAPEFILE_DIR, "PARCELLES_GRAPHIQUES.shp")
PARQUET_PATH = os.path.join(RAW_DATA_DIR, "RPG2023_sol_climat.parquet")
PRODUCTION_PATH = os.path.join(PROCESSED_DATA_DIR, "production_alsace.csv")
OUTPUT_PATH = os.path.join(PROCESSED_DATA_DIR, "vignes.geojson")

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# Load data
print("Loading shapefile...")
geom = gpd.read_file(SHAPEFILE_PATH)
print(f"  {len(geom)} parcels loaded")

print("Loading topographic data...")
topo = pd.read_parquet(PARQUET_PATH)
print(f"  {len(topo)} parcels loaded")

# Merge
print("Merging datasets...")
merged = geom.merge(topo, left_on='ID_PARCEL', right_on='id_parcel', how='inner')
print(f"  {len(merged)} parcels after merge")

# Filter vineyards
print("Filtering vineyards...")
vignes = merged[merged['CODE_CULTU'].isin(['VRC', 'VRT'])].copy()
print(f"  {len(vignes)} vineyard parcels")

# Filter Alsace
print("Filtering Alsace region...")
vignes = vignes[vignes['dep_parc'].isin(['67', '68'])].copy()
print(f"  {len(vignes)} parcels in Alsace")

# Filter Route des Vins communes
ROUTE_DES_VINS = [
    '67003', '67032', '67084', '67372', '67482', '67210',
    '68004', '68066', '68112', '68162', '68228', '68237',
    '68338', '68340', '68350', '68376'
]

vignes_route = vignes[vignes['com_parc'].isin(ROUTE_DES_VINS)].copy()

if len(vignes_route) > 0:
    vignes = vignes_route
    print(f"  {len(vignes)} parcels on Route des Vins")
else:
    print("  WARNING: No parcels on Route des Vins, keeping all Alsace")

# Stratified sampling
MAX_PARCELLES = 10000

if len(vignes) > MAX_PARCELLES:
    print(f"Sampling {len(vignes)} -> {MAX_PARCELLES} parcels...")
    
    parcelles_par_commune = vignes.groupby('com_parc').size()
    proportion = MAX_PARCELLES / len(vignes)
    
    vignes_echantillonnees = []
    for commune, count in parcelles_par_commune.items():
        nb_a_garder = max(5, int(count * proportion))
        parcelles_commune = vignes[vignes['com_parc'] == commune]
        
        if len(parcelles_commune) > nb_a_garder:
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
    print(f"  {len(vignes)} parcels selected")

# Add commune names
COMMUNES_ALSACE = {
    '67003': 'Andlau', '67032': 'Barr', '67084': 'Dambach-la-Ville',
    '67210': 'Obernai', '67372': 'Mittelbergheim', '67482': 'Rosheim',
    '68004': 'Ammerschwihr', '68066': 'Bergheim', '68112': 'Eguisheim',
    '68162': 'Hunawihr', '68228': 'Kaysersberg', '68237': 'Mittelwihr',
    '68338': 'Turckheim', '68340': 'Riquewihr', '68350': 'Ribeauvillé',
    '68376': 'Sigolsheim',
}

vignes['nom_commune'] = vignes['com_parc'].map(COMMUNES_ALSACE).fillna(vignes['com_parc'])

# Add appellations
APPELLATIONS_ALSACE = {
    'Andlau': 'Alsace Grand Cru Wiebelsberg',
    'Barr': 'Alsace Grand Cru Kirchberg de Barr',
    'Dambach-la-Ville': 'Alsace Grand Cru Frankstein',
    'Mittelbergheim': 'Alsace Grand Cru Zotzenberg',
    'Rosheim': 'Alsace Grand Cru Engelberg',
    'Ammerschwihr': 'Alsace Grand Cru Kaefferkopf',
    'Bergheim': 'Alsace Grand Cru Altenberg de Bergheim',
    'Eguisheim': 'Alsace Grand Cru Eichberg',
    'Hunawihr': 'Alsace Grand Cru Rosacker',
    'Kaysersberg': 'Alsace Grand Cru Schlossberg',
    'Mittelwihr': 'Alsace Grand Cru Mandelberg',
    'Riquewihr': 'Alsace Grand Cru Schoenenbourg',
    'Ribeauvillé': 'Alsace Grand Cru Geisberg',
    'Sigolsheim': 'Alsace Grand Cru Mambourg',
    'Turckheim': 'Alsace Grand Cru Brand',
    'Obernai': 'AOC Alsace',
}

vignes['appellation'] = vignes['nom_commune'].map(APPELLATIONS_ALSACE).fillna('AOC Alsace')

nb_grands_crus = vignes['appellation'].str.contains('Grand Cru', na=False).sum()
nb_aoc = (vignes['appellation'] == 'AOC Alsace').sum()
print(f"  {nb_grands_crus} Grand Cru parcels, {nb_aoc} AOC Alsace parcels")

# Add production data
print("Integrating production data...")
try:
    if not os.path.exists(PRODUCTION_PATH):
        raise FileNotFoundError
    
    production = pd.read_csv(PRODUCTION_PATH)
    vignes = vignes.merge(production, left_on='nom_commune', right_on='commune', how='left')
    
    if 'commune' in vignes.columns:
        vignes.drop(columns=['commune'], inplace=True)
    
    nb_avec_prod = vignes['volume_production_hl'].notna().sum()
    print(f"  {nb_avec_prod}/{len(vignes)} parcels with production data")

except FileNotFoundError:
    print("  WARNING: Production file not found, continuing without")
    vignes['superficie_production_ha'] = None
    vignes['volume_production_hl'] = None
    vignes['rendement_moyen_hl_ha'] = None

except Exception as e:
    print(f"  ERROR: {e}")
    vignes['superficie_production_ha'] = None
    vignes['volume_production_hl'] = None
    vignes['rendement_moyen_hl_ha'] = None

# Select columns
colonnes_utiles = [
    'geometry', 'CODE_CULTU', 'SURF_PARC',
    'pente_mean', 'expo_mean', 'alt_mean',
    'dep_parc', 'com_parc', 'nom_commune', 'appellation',
    'superficie_production_ha', 'volume_production_hl', 'rendement_moyen_hl_ha'
]

vignes = vignes[colonnes_utiles].copy()

# Reproject and simplify
print("Reprojecting to WGS84...")
vignes = vignes.to_crs("EPSG:4326")

print("Simplifying geometries...")
vignes['geometry'] = vignes['geometry'].simplify(tolerance=0.0002, preserve_topology=True)

# Export
print(f"Exporting to {OUTPUT_PATH}...")
vignes.to_file(OUTPUT_PATH, driver="GeoJSON")

file_size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)

# Statistics
print(f"\nFINAL STATISTICS:")
print(f"  Parcels: {len(vignes)}")
print(f"  Average slope: {vignes['pente_mean'].mean():.1f}%")
print(f"  Average altitude: {vignes['alt_mean'].mean():.0f}m")
print(f"  Communes: {vignes['nom_commune'].nunique()}")
print(f"  File size: {file_size_mb:.2f} MB")

app_stats = vignes.groupby('appellation').size().sort_values(ascending=False)
print(f"\nAppellations:")
for app, count in app_stats.head(5).items():
    pct = count / len(vignes) * 100
    print(f"  {app}: {count} ({pct:.1f}%)")

if file_size_mb > 3:
    print(f"\nWARNING: Large file ({file_size_mb:.1f} MB)")
else:
    print(f"\nOptimized for web ({file_size_mb:.1f} MB)")

print("\nDone!")