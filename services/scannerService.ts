// TODO: Re-enable when expo-barcode-scanner and expo-camera are fixed for new architecture
// import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';
// import { Camera } from 'expo-camera';

export async function requestScannerPermissions() {
  // Temporarily disabled - barcode scanner not compatible with new architecture yet
  // const cameraStatus = await Camera.requestCameraPermissionsAsync();
  // const barcodeStatus = await BarCodeScanner.requestPermissionsAsync();
  // return cameraStatus.status === 'granted' && barcodeStatus.status === 'granted';
  return false;
}

export async function hasScannerPermissions() {
  // Temporarily disabled - barcode scanner not compatible with new architecture yet
  // const cameraStatus = await Camera.getCameraPermissionsAsync();
  // const barcodeStatus = await BarCodeScanner.getPermissionsAsync();
  // return cameraStatus.granted && barcodeStatus.granted;
  return false;
}

export type ScannerCallback = (result: any) => void; // Changed from BarCodeScannerResult

export const supportedBarcodeTypes: string[] = [
  // Temporarily disabled - barcode scanner not compatible with new architecture yet
  // BarCodeScanner.Constants.BarCodeType.ean13,
  // BarCodeScanner.Constants.BarCodeType.code128,
  // BarCodeScanner.Constants.BarCodeType.qr,
  // BarCodeScanner.Constants.BarCodeType.ean8,
  // BarCodeScanner.Constants.BarCodeType.upc_e,
  // BarCodeScanner.Constants.BarCodeType.code39,
];
