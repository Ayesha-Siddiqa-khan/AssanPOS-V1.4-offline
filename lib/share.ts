import { Linking } from 'react-native';

const ensureEncoded = (message: string) => encodeURIComponent(message);

export async function shareTextViaWhatsApp(message: string): Promise<boolean> {
  const encoded = ensureEncoded(message);
  const whatsappUrl = `whatsapp://send?text=${encoded}`;
  const webFallbackUrl = `https://wa.me/?text=${encoded}`;

  try {
    const canOpenWhatsApp = await Linking.canOpenURL(whatsappUrl);
    if (canOpenWhatsApp) {
      await Linking.openURL(whatsappUrl);
      return true;
    }

    const canOpenWeb = await Linking.canOpenURL(webFallbackUrl);
    if (canOpenWeb) {
      await Linking.openURL(webFallbackUrl);
      return true;
    }
  } catch (error) {
    console.warn('Failed to open WhatsApp URL', error);
  }

  return false;
}
