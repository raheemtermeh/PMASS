/** Browser WebAuthn helpers — base64url ↔ ArrayBuffer for PublicKeyCredential. */

function bufferToBase64url(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function reviveCreationOptions(
  publicKey: Record<string, unknown>,
): PublicKeyCredentialCreationOptions {
  const pk = { ...publicKey } as Record<string, unknown>;
  if (typeof pk.challenge === "string") pk.challenge = base64urlToBuffer(pk.challenge);
  const user = pk.user as Record<string, unknown> | undefined;
  if (user && typeof user.id === "string") {
    pk.user = { ...user, id: base64urlToBuffer(user.id as string) };
  }
  if (Array.isArray(pk.excludeCredentials)) {
    pk.excludeCredentials = (pk.excludeCredentials as Record<string, unknown>[]).map((c) => ({
      ...c,
      id: typeof c.id === "string" ? base64urlToBuffer(c.id) : c.id,
    }));
  }
  return pk as unknown as PublicKeyCredentialCreationOptions;
}

function reviveRequestOptions(
  publicKey: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  const pk = { ...publicKey } as Record<string, unknown>;
  if (typeof pk.challenge === "string") pk.challenge = base64urlToBuffer(pk.challenge);
  if (Array.isArray(pk.allowCredentials)) {
    pk.allowCredentials = (pk.allowCredentials as Record<string, unknown>[]).map((c) => ({
      ...c,
      id: typeof c.id === "string" ? base64urlToBuffer(c.id) : c.id,
    }));
  }
  return pk as unknown as PublicKeyCredentialRequestOptions;
}

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function createPasskeyCredential(
  publicKey: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.create({
    publicKey: reviveCreationOptions(publicKey),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey creation was cancelled");

  const att = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(att.clientDataJSON),
      attestationObject: bufferToBase64url(att.attestationObject),
      transports:
        typeof att.getTransports === "function" ? att.getTransports() : undefined,
    },
  };
}

export async function getPasskeyCredential(
  publicKey: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.get({
    publicKey: reviveRequestOptions(publicKey),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey sign-in was cancelled");

  const assertion = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64url(assertion.authenticatorData),
      signature: bufferToBase64url(assertion.signature),
      userHandle: assertion.userHandle
        ? bufferToBase64url(assertion.userHandle)
        : null,
    },
  };
}
