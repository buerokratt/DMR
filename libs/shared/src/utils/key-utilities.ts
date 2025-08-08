import { importPKCS8 } from 'jose';
import { createPrivateKey } from 'node:crypto';

// Helper function to handle both PKCS#1 and PKCS#8 private key formats
// CentOps uses PKCS#1 format for private keys
export const importPrivateKey = async (privateKeyString: string, algorithm: string) => {
  try {
    // Try PKCS#8 format first
    return await importPKCS8(privateKeyString, algorithm);
  } catch (error) {
    // If PKCS#8 fails, try to convert PKCS#1 to PKCS#8 format
    if (privateKeyString.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      try {
        // Use Node.js crypto to convert PKCS#1 to PKCS#8
        const pkcs1Key = createPrivateKey({
          key: privateKeyString,
          format: 'pem',
          type: 'pkcs1',
        });

        const pkcs8Key = pkcs1Key.export({
          format: 'pem',
          type: 'pkcs8',
        });

        return await importPKCS8(pkcs8Key.toString(), algorithm);
      } catch (conversionError) {
        console.error('Failed to convert PKCS#1 to PKCS#8:', conversionError);
        throw error; // Throw the original error
      }
    }
    throw error;
  }
};
