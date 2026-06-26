const SW_PATH = "/aurora-service-worker.js";

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(SW_PATH)
      .then(async (registration) => {
        if ("periodicSync" in registration) {
          const periodicRegistration = registration as ServiceWorkerRegistration & {
            periodicSync: {
              register: (tag: string, options: { minInterval: number }) => Promise<void>;
            };
          };
          await periodicRegistration.periodicSync
            .register("aurora-autopilot-refresh", { minInterval: 15 * 60 * 1000 })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  });
}
