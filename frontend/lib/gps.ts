export type GpsFix = {
  lat?: number;
  lng?: number;
  acc?: number;
  reason?: string;
  updatedAt?: number;
};

function readPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device has no GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export async function getGpsFix(): Promise<GpsFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { reason: "This device has no GPS" };
  }
  try {
    const pos = await readPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      acc: pos.coords.accuracy,
      updatedAt: Date.now(),
    };
  } catch {
    try {
      const pos = await readPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        updatedAt: Date.now(),
      };
    } catch {
      return { reason: "GPS unavailable at this site" };
    }
  }
}
