export async function syncSOs(ctx, silent = false) {
  const { sync, repos } = ctx;
  if (!sync || !sync.supabase) {
    if (!silent) throw new Error('Supabase belum dikonfigurasi');
    return { uploaded: 0, downloaded: 0 };
  }

  let uploaded = 0;
  let downloaded = 0;

  const pending = await repos.salesOrders.filter(so => !so.synced && so.status === 'pending');
  for (const so of pending) {
    try {
      await sync.supabase.uploadSO(so);
      await repos.salesOrders.patch(so.id, { synced: true });
      uploaded++;
    } catch (e) { if (!silent) console.warn('Upload SO gagal:', so.number, e); }
  }

  try {
    const files = await sync.supabase.listSOs();
    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const remoteSO = await sync.supabase.downloadSO(file.name);
        const exists = await repos.salesOrders.get(remoteSO.id);
        if (!exists) {
          await repos.salesOrders.save({ ...remoteSO, synced: true });
          downloaded++;
        }
        await sync.supabase.deleteSO(file.name);
      } catch (e) { if (!silent) console.warn('Download SO gagal:', file.name, e); }
    }
  } catch (e) { if (!silent) console.warn('List SO gagal:', e); }

  return { uploaded, downloaded };
}