import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quran.qasas',
  appName: 'حفظ سوره قصص',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      '*.everyayah.com',
      'everyayah.com',
      '*.qurancdn.com',
      'audio.qurancdn.com',
      '*.quranwbw.com',
      'quranwbw.com',
      '*'
    ]
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;

