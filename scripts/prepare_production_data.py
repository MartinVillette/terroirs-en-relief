import pandas as pd
import os

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")

PRODUCTION_PATH = os.path.join(RAW_DATA_DIR, "production_vins.csv")
OUTPUT_PRODUCTION = os.path.join(PROCESSED_DATA_DIR, "production_alsace.csv")

# Chargement des données
production = pd.read_csv(
    PRODUCTION_PATH, 
    sep=';', 
    encoding='latin-1',
    skipinitialspace=True
)

print(f"Loaded {len(production)} rows")

# Nettoyage des colonnes
production.columns = [
    col.replace('\n', ' ').replace('\r', '').strip() 
    for col in production.columns
]

# Détection automatique des colonnes
def find_appellation_column(df):
    for col in df.columns:
        col_lower = col.lower()
        if 'libell' in col_lower:
            return col
        if df[col].dtype == 'object':
            sample_values = df[col].dropna().astype(str).str.upper().head(20)
            if any('ALSACE' in val or 'VIN' in val for val in sample_values):
                return col
    return None

col_appellation = find_appellation_column(production)
col_superficie = None
col_volume = None
col_rendement = None

for col in production.columns:
    col_lower = col.lower()
    if 'superficie' in col_lower or 'surface' in col_lower:
        col_superficie = col
    elif 'volume' in col_lower and 'produit' in col_lower:
        col_volume = col
    elif 'rendement' in col_lower:
        col_rendement = col

if not all([col_appellation, col_superficie, col_volume, col_rendement]):
    print("ERROR: Cannot detect required columns")
    for i, col in enumerate(production.columns):
        print(f"  {i}: {col} = {production[col].iloc[0]}")
    exit(1)

# Renommage
production = production.rename(columns={
    col_appellation: 'appellation',
    col_superficie: 'superficie_ha',
    col_volume: 'volume_hl',
    col_rendement: 'rendement'
})

# Nettoyage des valeurs numériques
def clean_numeric(value):
    if pd.isna(value):
        return None
    
    value_str = str(value).strip()
    
    if 'confidentialis' in value_str.lower() or value_str == '':
        return None
    
    value_str = value_str.replace(',', '.').replace(' ', '').replace('\xa0', '').replace('\u202f', '')
    
    try:
        return float(value_str)
    except:
        return None

production['superficie_ha'] = production['superficie_ha'].apply(clean_numeric)
production['volume_hl'] = production['volume_hl'].apply(clean_numeric)
production['rendement'] = production['rendement'].apply(clean_numeric)

# Suppression des lignes invalides
production_clean = production.dropna(subset=['superficie_ha', 'volume_hl']).copy()

print(f"Valid rows: {len(production_clean)}/{len(production)}")

# Filtrage Alsace
production_clean['appellation'] = production_clean['appellation'].str.strip().str.upper()

alsace_prod = production_clean[
    production_clean['appellation'].str.contains('ALSACE', case=False, na=False)
].copy()

print(f"Alsace appellations: {len(alsace_prod)}")

# Extraction des communes (Grands Crus)
GRANDS_CRUS_COMMUNES = {
    'ALTENBERG DE BERGBIETEN': 'Bergbieten',
    'ALTENBERG DE BERGHEIM': 'Bergheim',
    'ALTENBERG DE WOLXHEIM': 'Wolxheim',
    'BRAND': 'Turckheim',
    'BRUDERTHAL': 'Molsheim',
    'EICHBERG': 'Eguisheim',
    'ENGELBERG': 'Dahlenheim',
    'FLORIMONT': 'Ingersheim',
    'FRANKSTEIN': 'Dambach-la-Ville',
    'FROEHN': 'Zellenberg',
    'FURSTENTUM': 'Kientzheim',
    'GEISBERG': 'Ribeauvillé',
    'GLOECKELBERG': 'Rodern',
    'GOLDERT': 'Gueberschwihr',
    'HATSCHBOURG': 'Hattstatt',
    'HENGST': 'Wintzenheim',
    'KAEFFERKOPF': 'Ammerschwihr',
    'KANZLERBERG': 'Bergheim',
    'KASTELBERG': 'Andlau',
    'KESSLER': 'Guebwiller',
    'KIRCHBERG DE BARR': 'Barr',
    'KIRCHBERG DE RIBEAUVILLE': 'Ribeauvillé',
    'KITTERLE': 'Guebwiller',
    'MAMBOURG': 'Sigolsheim',
    'MANDELBERG': 'Mittelwihr',
    'MARCKRAIN': 'Bennwihr',
    'MOENCHBERG': 'Andlau',
    'MUENCHBERG': 'Nothalten',
    'OLLWILLER': 'Wuenheim',
    'OSTERBERG': 'Ribeauvillé',
    'PFERSIGBERG': 'Eguisheim',
    'PFINGSTBERG': 'Orschwihr',
    'PRAELATENBERG': 'Kintzheim',
    'RANGEN': 'Thann',
    'ROSACKER': 'Hunawihr',
    'SAERING': 'Guebwiller',
    'SCHLOSSBERG': 'Kientzheim',
    'SCHOENENBOURG': 'Riquewihr',
    'SOMMERBERG': 'Niedermorschwihr',
    'SONNENGLANZ': 'Beblenheim',
    'SPIEGEL': 'Bergholtz',
    'SPOREN': 'Riquewihr',
    'STEINERT': 'Pfaffenheim',
    'STEINGRUBLER': 'Wettolsheim',
    'STEINKLOTZ': 'Marlenheim',
    'VORBOURG': 'Rouffach',
    'WIEBELSBERG': 'Andlau',
    'WINECK-SCHLOSSBERG': 'Katzenthal',
    'WINZENBERG': 'Blienschwiller',
    'ZINNGKOEPFLE': 'Westhalten',
    'ZOTZENBERG': 'Mittelbergheim',
}

def extract_commune(appellation):
    if pd.isna(appellation):
        return None
    
    appellation_upper = str(appellation).upper()
    
    if 'GRAND CRU' in appellation_upper:
        for gc, commune in GRANDS_CRUS_COMMUNES.items():
            if gc in appellation_upper:
                return commune
    
    return None

alsace_prod['commune'] = alsace_prod['appellation'].apply(extract_commune)

nb_avec_commune = alsace_prod['commune'].notna().sum()
print(f"Appellations with commune: {nb_avec_commune}/{len(alsace_prod)}")

# Agrégation par commune
grands_crus = alsace_prod[alsace_prod['commune'].notna()].copy()

if len(grands_crus) > 0:
    production_par_commune = grands_crus.groupby('commune').agg({
        'superficie_ha': 'sum',
        'volume_hl': 'sum',
        'rendement': 'mean'
    }).reset_index()

    production_par_commune.rename(columns={
        'superficie_ha': 'superficie_production_ha',
        'volume_hl': 'volume_production_hl',
        'rendement': 'rendement_moyen_hl_ha'
    }, inplace=True)

    print(f"Communes with production data: {len(production_par_commune)}")
else:
    production_par_commune = pd.DataFrame(columns=[
        'commune', 'superficie_production_ha', 'volume_production_hl', 'rendement_moyen_hl_ha'
    ])

# Statistiques générales
if len(alsace_prod) > 0:
    total_superficie = alsace_prod['superficie_ha'].sum()
    total_volume = alsace_prod['volume_hl'].sum()
    rendement_moyen = alsace_prod['rendement'].mean()

    print(f"\nAlsace statistics:")
    print(f"  Total surface: {total_superficie:,.1f} ha")
    print(f"  Total volume: {total_volume:,.0f} hl")
    print(f"  Average yield: {rendement_moyen:.0f} hl/ha")

    if len(grands_crus) > 0:
        part_gc_superficie = (grands_crus['superficie_ha'].sum() / total_superficie * 100)
        part_gc_volume = (grands_crus['volume_hl'].sum() / total_volume * 100)

        print(f"\nGrand Cru share:")
        print(f"  Surface: {part_gc_superficie:.1f}%")
        print(f"  Volume: {part_gc_volume:.1f}%")

# Export
production_par_commune.to_csv(OUTPUT_PRODUCTION, index=False, encoding='utf-8')
alsace_prod.to_csv(
    os.path.join(PROCESSED_DATA_DIR, "production_alsace_detaillee.csv"),
    index=False,
    encoding='utf-8'
)

print(f"\nExported to {OUTPUT_PRODUCTION}")
print("Done!")