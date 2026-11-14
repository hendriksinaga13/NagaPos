# Format File Backup (.db)

File backup (.db) dan file yang diunggah ke Supabase adalah **file JSON** dengan struktur berikut:

```json
{
  "format": "kasir-dbfile",
  "version": 1,
  "exportedAt": 1710000000000,
  "deviceCode": "ABCD",
  "stores": {
    "products": [ { "id": "...", "name": "...", ... } ],
    "units": [ ... ],
    "sales": [ ... ],
    ... (semua tabel)
  }
}