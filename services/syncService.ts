class CloudSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;

  async start() {
    console.log('[cloud-sync] Cloud sync disabled. Using local SQLite only.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow() {
    console.log('[cloud-sync] Sync skipped - offline mode');
  }
}

export const syncService = new CloudSyncService();

export async function synchronizeNow() {
  await syncService.syncNow();
}
