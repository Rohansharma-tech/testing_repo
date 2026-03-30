export async function getCameraPermissionState() {
  if (!navigator.permissions?.query) {
    return "prompt";
  }

  try {
    const result = await navigator.permissions.query({ name: "camera" });
    return result.state;
  } catch {
    return "prompt";
  }
}

export function ensureCameraSupport() {
  if (!window.isSecureContext) {
    throw new Error("Camera access requires HTTPS or localhost. Open the app from a secure URL and try again.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported in this browser. Use a recent Chrome, Edge, or Safari browser.");
  }
}

export function getCameraErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access is blocked. Allow camera permission for this site in your browser settings and reload.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The camera is busy or unavailable. Close other apps using the camera and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The requested camera mode is not available on this device.";
    case "SecurityError":
      return "Camera access was blocked by browser security settings.";
    case "TypeError":
      return "Camera access is not available in this browser context.";
    default:
      return error?.message || "Unable to start the camera.";
  }
}
