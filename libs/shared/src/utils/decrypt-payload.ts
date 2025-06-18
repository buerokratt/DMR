import { compactDecrypt, importPKCS8, importSPKI, jwtVerify } from 'jose';

const decoder = new TextDecoder();

export const decryptPayload = async (
  jwe: string,
  senderPublicKeyString: string,
  recipientPrivateKeyString: string,
): Promise<{ data: string[] }> => {
  // Load recipient's private key (for encryption)
  const recipientPrivateKey = await importPKCS8(recipientPrivateKeyString, 'RSA-OAEP');

  // Decrypt the JWE
  const { plaintext } = await compactDecrypt(jwe, recipientPrivateKey);
  const signedJWT = decoder.decode(plaintext);

  // Load agent's public key (for signing)
  const senderPublicKey = await importSPKI(senderPublicKeyString, 'RS256');

  // Verify signature and extract payload
  const { payload } = await jwtVerify<{ data: string[] }>(signedJWT, senderPublicKey);

  return payload;
};
