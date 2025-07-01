import { CompactEncrypt, importPKCS8, importSPKI, SignJWT } from 'jose';

const encoder = new TextEncoder();

export const encryptPayload = async (
  payload: unknown,
  senderPrivateKeyString: string,
  recipientPublicKeyString: string,
): Promise<string> => {
  // Load agent's private key (for signing)
  const senderPrivateKey = await importPKCS8(senderPrivateKeyString, 'RS256');

  // Sign the payload
  const jwt = await new SignJWT({ data: payload })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(senderPrivateKey);

  // Load recipient's public key (for encryption)
  const recipientPublicKey = await importSPKI(recipientPublicKeyString, 'RSA-OAEP');

  // Encrypt the signed JWT
  const jwe = await new CompactEncrypt(encoder.encode(jwt))
    .setProtectedHeader({ alg: 'RSA-OAEP', enc: 'A256GCM' })
    .encrypt(recipientPublicKey);

  return jwe;
};
