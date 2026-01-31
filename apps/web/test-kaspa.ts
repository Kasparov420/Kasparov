
import kaspa from '@kaspa/core-lib';

async function main() {
  // Check if initialization is needed
  // Note: Inspecting the object keys showed 'initRuntime' and 'ready'
  if (typeof kaspa.initRuntime === 'function') {
      await kaspa.initRuntime();
  }

  console.log('Kaspa lib loaded:', Object.keys(kaspa));

  const privateKey = new kaspa.PrivateKey();
  const address = privateKey.toAddress('kaspa');
  console.log('Private Key:', privateKey.toString());
  console.log('Address:', address.toString());
}

main().catch(console.error);
